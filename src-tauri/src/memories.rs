//! The memory plane: durable facts distilled from chats (or written by
//! hand), stored inspectable — id, source, provenance, timestamps — and
//! searchable/deletable by design (no hidden profiling). The vector index
//! (`memories_vec`) is a side table keyed by `memory_id`.

use crate::db::{self, Db};
use crate::embeddings::EmbedError;
use crate::embeddings::Embedder;
use crate::provider::ProviderError;
use crate::provider::{ChatMessage, ChatProvider, ChatRequest, ChatRole};

use rusqlite::OptionalExtension;

pub const DISTILL_SYSTEM_PROMPT: &str = "\
You maintain the user's long-term memories from a chat exchange: durable \
facts, preferences, or context worth remembering later (never transient \
chatter). You may also reconcile the current memories listed alongside the \
exchange. Reply with one action per line and nothing else:
- `MEMORY: <fact>` — remember a new fact (at most two)
- `UPDATE <id>: <rewritten fact>` — a listed memory is outdated; rewrite it
- `DELETE <id>` — a listed memory is superseded; remove it
`UPDATE`/`DELETE` apply only to memories offered with a #id. If nothing is \
worth remembering or changing, reply with `NONE` and nothing else.";

const MAX_MEMORY_CHARS: usize = 500;
const MAX_ADDS_PER_TURN: usize = 2;
/// Reconciliation bounds: the model can touch at most this many existing
/// memories per turn (updates and deletes are capped separately).
const MAX_MUTATIONS_PER_TURN: usize = 4;
/// How many recent memories the distiller is offered for reconciliation.
/// Recency over similarity: contradictions can be lexically distant
/// ("moving to Lisbon in October" vs "lives in NYC"), and at desktop scale
/// a bounded recent list is exact and prompt-cheap.
const RECONCILE_OFFER_LIMIT: usize = 24;

/// What one distillation pass did to the store — rendered into the chat's
/// tool step so every automatic change is visible in the thread.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct DistillOutcome {
    pub added: usize,
    pub updated: usize,
    pub deleted: usize,
}

impl DistillOutcome {
    fn is_noop(&self) -> bool {
        self.added == 0 && self.updated == 0 && self.deleted == 0
    }

    /// Step text, e.g. "Updated 2 memories · 1 memory removed".
    pub fn step_text(&self) -> String {
        fn noun(count: usize) -> &'static str {
            if count == 1 {
                "memory"
            } else {
                "memories"
            }
        }
        let mut parts = Vec::new();
        let changed = self.added + self.updated;
        if changed > 0 {
            parts.push(format!("Updated {changed} {}", noun(changed)));
        }
        if self.deleted > 0 {
            parts.push(format!("{} {} removed", self.deleted, noun(self.deleted)));
        }
        parts.join(" · ")
    }
}

/// One parsed request from the distiller's reply.
#[derive(Debug, Clone, PartialEq)]
pub enum MemoryProposal {
    Add(String),
    Update { memory_id: i64, content: String },
    Delete { memory_id: i64 },
}

/// A stored memory. `conversation_id` is provenance: which chat produced a
/// distilled memory (manual memories have none).
#[derive(Debug, Clone)]
pub struct Memory {
    pub id: i64,
    pub content: String,
    pub source: MemorySource,
    pub conversation_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemorySource {
    Manual,
    Distilled,
}

impl MemorySource {
    pub fn as_str(self) -> &'static str {
        match self {
            MemorySource::Manual => "manual",
            MemorySource::Distilled => "distilled",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw {
            "distilled" => MemorySource::Distilled,
            _ => MemorySource::Manual,
        }
    }
}

fn memory_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: row.get(0)?,
        content: row.get(1)?,
        source: MemorySource::parse(&row.get::<_, String>(2)?),
        conversation_id: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn list_memories(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<Memory>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, source, conversation_id, created_at, updated_at
         FROM memories ORDER BY updated_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([], memory_from_row)?;
    rows.collect()
}

pub fn get_memory(conn: &rusqlite::Connection, memory_id: i64) -> rusqlite::Result<Option<Memory>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, source, conversation_id, created_at, updated_at
         FROM memories WHERE id = ?1",
    )?;
    stmt.query_row([memory_id], memory_from_row).optional()
}

/// Writes a memory: text row + vector index. The embedding is computed
/// locally (fastembed); failures fail the write — a memory without a vector
/// is unreachable, which would make the layer lie.
pub async fn write_memory(
    db: &Db,
    embedder: &dyn Embedder,
    content: &str,
    source: MemorySource,
    conversation_id: Option<i64>,
) -> Result<i64, String> {
    let content = content.trim();
    if content.is_empty() {
        return Err("Memory content must not be empty".to_string());
    }
    let embedding = embedder
        .embed(content)
        .await
        .map_err(|err: EmbedError| err.to_string())?;
    let conn = db.get().map_err(|err| err.to_string())?;
    let now = now_iso();
    conn.execute(
        "INSERT INTO memories (content, source, conversation_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![content, source.as_str(), conversation_id, now],
    )
    .map_err(|err| err.to_string())?;
    let memory_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO memories_vec (embedding, memory_id) VALUES (?1, ?2)",
        rusqlite::params![db::embedding_to_blob(&embedding), memory_id],
    )
    .map_err(|err| err.to_string())?;
    Ok(memory_id)
}

/// Rewrites a memory and re-embeds it (same id, fresh vector).
pub async fn update_memory(
    db: &Db,
    embedder: &dyn Embedder,
    memory_id: i64,
    content: &str,
) -> Result<(), String> {
    let content = content.trim();
    if content.is_empty() {
        return Err("Memory content must not be empty".to_string());
    }
    let embedding = embedder
        .embed(content)
        .await
        .map_err(|err: EmbedError| err.to_string())?;
    let conn = db.get().map_err(|err| err.to_string())?;
    conn.execute(
        "UPDATE memories SET content = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![content, now_iso(), memory_id],
    )
    .map_err(|err| err.to_string())?;
    if conn.changes() == 0 {
        return Err("Memory not found".to_string());
    }
    conn.execute(
        "UPDATE memories_vec SET embedding = ?1 WHERE memory_id = ?2",
        rusqlite::params![db::embedding_to_blob(&embedding), memory_id],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

/// Deletes a memory and its vector.
pub async fn delete_memory(db: &Db, memory_id: i64) -> Result<(), String> {
    let conn = db.get().map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM memories WHERE id = ?1", [memory_id])
        .map_err(|err| err.to_string())?;
    if conn.changes() == 0 {
        return Err("Memory not found".to_string());
    }
    conn.execute("DELETE FROM memories_vec WHERE memory_id = ?1", [memory_id])
        .map_err(|err| err.to_string())?;
    Ok(())
}

/// Is this chat incognito (no memory reads, no memory writes, no search)?
pub fn is_incognito(conn: &rusqlite::Connection, conversation_id: i64) -> bool {
    conn.query_row(
        "SELECT incognito FROM conversations WHERE id = ?1",
        [conversation_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v != 0)
    .unwrap_or(false)
}

/// The last user/ assistant exchange of a conversation (the distillation
/// input).
fn last_exchange(
    conn: &rusqlite::Connection,
    conversation_id: i64,
) -> rusqlite::Result<Option<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT role, content FROM messages
         WHERE conversation_id = ?1 ORDER BY id DESC LIMIT 4",
    )?;
    let recent: Vec<(String, String)> = stmt
        .query_map([conversation_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;

    // Streams persist the assistant replying to the last user message: the
    // newest non-empty assistant row and, above it, the user turn.
    let assistant = recent
        .iter()
        .find(|(role, content)| role == "ASSISTANT" && !content.trim().is_empty());
    let Some((_, assistant_content)) = assistant else {
        return Ok(None);
    };
    let assistant_pos = recent
        .iter()
        .position(|x| x.1 == *assistant_content)
        .unwrap();
    let user = recent[assistant_pos..]
        .iter()
        .find(|(role, _)| role == "USER")
        .map(|(_, content)| content.clone());
    let Some(user_content) = user else {
        return Ok(None);
    };
    Ok(Some((user_content, assistant_content.clone())))
}

/// Settles the chat history's tool-call step after a distillation: DONE
/// with the outcome when the store changed, deleted when nothing was
/// proposed (no noise for a no-op), ERROR when the distillation failed.
pub fn finish_tool_message(
    db: &Db,
    tool_message_id: Option<i64>,
    outcome: &Result<DistillOutcome, String>,
) -> Result<(), String> {
    let Some(id) = tool_message_id else {
        return Ok(());
    };
    let conn = db.get().map_err(|err| err.to_string())?;
    match outcome {
        Ok(outcome) if outcome.is_noop() => {
            conn.execute("DELETE FROM messages WHERE id = ?1", [id])
                .map_err(|err| err.to_string())?;
        }
        Ok(outcome) => {
            conn.execute(
                "UPDATE messages SET content = ?1, tool_state = 'DONE' WHERE id = ?2",
                rusqlite::params![outcome.step_text(), id],
            )
            .map_err(|err| err.to_string())?;
        }
        Err(_) => {
            conn.execute(
                "UPDATE messages SET tool_state = 'ERROR', content = ?1 WHERE id = ?2",
                rusqlite::params!["Couldn't update memories", id],
            )
            .map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

/// Extracts the distiller's requests from its reply — `MEMORY:` /
/// `UPDATE <id>:` / `DELETE <id>` lines — bounded and cleaned. Nothing else
/// in the reply is trusted: first-come-first-served per kind (2 adds,
/// 4 updates, 4 deletes), 500 chars per content, malformed lines dropped.
fn parse_memory_proposals(reply: &str) -> Vec<MemoryProposal> {
    fn bounded(content: &str) -> String {
        let trimmed = content.trim();
        match trimmed.chars().count() > MAX_MEMORY_CHARS {
            true => trimmed.chars().take(MAX_MEMORY_CHARS).collect(),
            false => trimmed.to_string(),
        }
    }
    /// `UPDATE 12: new content` → id 12 + content (also used for bare ids).
    fn parse_id(rest: &str) -> Option<(i64, Option<&str>)> {
        let rest = rest.trim();
        let (id_part, tail) = match rest.split_once(':') {
            Some((id_part, tail)) => (id_part, Some(tail)),
            None => (rest, None),
        };
        let id = id_part.trim().parse::<i64>().ok()?;
        Some((id, tail))
    }

    let mut proposals = Vec::new();
    let (mut adds, mut updates, mut deletes) = (0, 0, 0);
    for line in reply.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("MEMORY:") {
            let content = bounded(rest);
            if adds < MAX_ADDS_PER_TURN && !content.is_empty() {
                proposals.push(MemoryProposal::Add(content));
                adds += 1;
            }
        } else if let Some(rest) = line.strip_prefix("UPDATE") {
            let Some((memory_id, Some(content))) = parse_id(rest) else {
                continue;
            };
            let content = bounded(content);
            if updates < MAX_MUTATIONS_PER_TURN && !content.is_empty() {
                proposals.push(MemoryProposal::Update { memory_id, content });
                updates += 1;
            }
        } else if let Some(rest) = line.strip_prefix("DELETE") {
            let Some((memory_id, None)) = parse_id(rest) else {
                continue;
            };
            if deletes < MAX_MUTATIONS_PER_TURN {
                proposals.push(MemoryProposal::Delete { memory_id });
                deletes += 1;
            }
        }
    }
    proposals
}

/// The distiller's reconciliation surface: the most recently updated
/// memories, newest first. The model may only reference the ids it was
/// offered — and app-side enforcement re-checks authorship (manual memories
/// are user-authored; only the user changes them).
fn recent_memories(conn: &rusqlite::Connection, limit: usize) -> rusqlite::Result<Vec<Memory>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, source, conversation_id, created_at, updated_at
         FROM memories ORDER BY updated_at DESC, id DESC LIMIT ?1",
    )?;
    let rows = stmt
        .query_map([limit as i64], memory_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Post-chat distillation: sends the last exchange plus a bounded view of
/// the current store through the configured provider, then applies what it
/// proposes — new memories, rewrites, and removals of superseded distilled
/// entries — as `distilled` writes with chat provenance. Incognito chats
/// are never touched.
pub async fn distill_conversation(
    db: &Db,
    embedder: &dyn Embedder,
    provider: &dyn ChatProvider,
    conversation_id: i64,
) -> Result<DistillOutcome, String> {
    let conn = db.get().map_err(|err| err.to_string())?;
    if is_incognito(&conn, conversation_id) {
        return Ok(DistillOutcome::default());
    }
    let Some((user_content, assistant_content)) =
        last_exchange(&conn, conversation_id).map_err(|err| err.to_string())?
    else {
        return Ok(DistillOutcome::default());
    };
    let offered = recent_memories(&conn, RECONCILE_OFFER_LIMIT).map_err(|err| err.to_string())?;
    drop(conn);

    let mut exchange = format!("User: {user_content}\n\nAssistant: {assistant_content}");
    if !offered.is_empty() {
        exchange.push_str("\n\nCurrent memories:");
        for memory in &offered {
            match memory.source {
                MemorySource::Distilled => {
                    exchange.push_str(&format!("\n#{} {}", memory.id, memory.content));
                }
                MemorySource::Manual => {
                    exchange.push_str(&format!(
                        "\n- {} (written by the user; read-only)",
                        memory.content
                    ));
                }
            }
        }
    }

    let request = ChatRequest {
        model: provider.model().to_string(),
        messages: vec![
            ChatMessage {
                role: ChatRole::System,
                content: DISTILL_SYSTEM_PROMPT.to_string(),
            },
            ChatMessage {
                role: ChatRole::User,
                content: exchange,
            },
        ],
    };

    // The provider abstraction streams; a distillation needs the whole
    // reply, so drain the stream.
    let mut stream = provider
        .stream_chat(request)
        .await
        .map_err(|err: ProviderError| err.to_string())?;
    let mut reply = String::new();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(piece) => reply.push_str(&piece),
            Err(err) => return Err(err.to_string()),
        }
    }

    let proposals = parse_memory_proposals(&reply);

    // The authorship guardrail, enforced where the prompt can't reach:
    // only distilled memories offered above may be rewritten or removed.
    let mutable_ids: std::collections::HashSet<i64> = offered
        .iter()
        .filter(|memory| memory.source == MemorySource::Distilled)
        .map(|memory| memory.id)
        .collect();

    let mut outcome = DistillOutcome::default();
    for proposal in proposals {
        match proposal {
            MemoryProposal::Add(content) => {
                if write_memory(
                    db,
                    embedder,
                    &content,
                    MemorySource::Distilled,
                    Some(conversation_id),
                )
                .await
                .is_ok()
                {
                    outcome.added += 1;
                }
            }
            MemoryProposal::Update { memory_id, content } => {
                if mutable_ids.contains(&memory_id)
                    && update_memory(db, embedder, memory_id, &content)
                        .await
                        .is_ok()
                {
                    outcome.updated += 1;
                }
            }
            MemoryProposal::Delete { memory_id } => {
                if mutable_ids.contains(&memory_id) && delete_memory(db, memory_id).await.is_ok() {
                    outcome.deleted += 1;
                }
            }
        }
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::response::IntoResponse;
    use axum::Json;
    use std::sync::Arc;

    use crate::embeddings::FakeEmbedder;
    use crate::provider::OpenAiCompatProvider;

    #[test]
    fn parse_proposals_takes_only_protocol_lines() {
        let reply = "Sure, here is what I noted:\nMEMORY: user prefers terse answers\n\
                     noise line\nMEMORY:   \nMEMORY: works in Berlin\nMEMORY: too much\n";
        let parsed = parse_memory_proposals(reply);
        assert_eq!(
            parsed,
            vec![
                MemoryProposal::Add("user prefers terse answers".to_string()),
                MemoryProposal::Add("works in Berlin".to_string()),
            ],
            "only MEMORY: lines count, capped at {MAX_ADDS_PER_TURN}"
        );
    }

    #[test]
    fn parse_proposals_truncates_and_caps() {
        let long = "x".repeat(800);
        let reply = format!("MEMORY: a\nMEMORY: {long}\nMEMORY: c\nMEMORY: d");
        let parsed = parse_memory_proposals(&reply);
        assert_eq!(parsed.len(), 2);
        match &parsed[1] {
            MemoryProposal::Add(content) => assert_eq!(content.chars().count(), MAX_MEMORY_CHARS),
            other => panic!("expected Add, got {other:?}"),
        }
    }

    #[test]
    fn parse_proposals_mutations() {
        let reply = "UPDATE 12: user lives in SF\nDELETE 12\nDELETE broken\n\
                     UPDATE not-an-id: x\nUPDATE 7\nDELETE 13: with content\n\
                     MEMORY: user works at Acme\nDELETE 14";
        let parsed = parse_memory_proposals(reply);
        assert_eq!(
            parsed,
            vec![
                MemoryProposal::Update {
                    memory_id: 12,
                    content: "user lives in SF".to_string()
                },
                MemoryProposal::Delete { memory_id: 12 },
                MemoryProposal::Add("user works at Acme".to_string()),
                MemoryProposal::Delete { memory_id: 14 },
            ],
            "malformed lines are dropped: non-numeric ids, UPDATE without content, \
             DELETE with content"
        );
    }

    #[test]
    fn parse_proposals_caps_mutations_per_turn() {
        let reply = "UPDATE 1: a\nUPDATE 2: b\nUPDATE 3: c\nUPDATE 4: d\nUPDATE 5: e\n\
                     DELETE 1\nDELETE 2\nDELETE 3\nDELETE 4\nDELETE 5\nDELETE 6";
        let parsed = parse_memory_proposals(reply);
        let updates = parsed
            .iter()
            .filter(|p| matches!(p, MemoryProposal::Update { .. }))
            .count();
        let deletes = parsed
            .iter()
            .filter(|p| matches!(p, MemoryProposal::Delete { .. }))
            .count();
        assert_eq!(updates, MAX_MUTATIONS_PER_TURN);
        assert_eq!(deletes, MAX_MUTATIONS_PER_TURN);
    }

    #[test]
    fn parse_proposals_empty_reply_is_empty() {
        assert!(parse_memory_proposals("nothing notable, NONE").is_empty());
    }

    #[test]
    fn step_text_pluralizes_and_enumerates() {
        assert_eq!(
            DistillOutcome {
                added: 2,
                ..Default::default()
            }
            .step_text(),
            "Updated 2 memories"
        );
        assert_eq!(
            DistillOutcome {
                added: 1,
                updated: 1,
                deleted: 1
            }
            .step_text(),
            "Updated 2 memories · 1 memory removed"
        );
        assert_eq!(
            DistillOutcome {
                deleted: 2,
                ..Default::default()
            }
            .step_text(),
            "2 memories removed"
        );
        assert!(DistillOutcome::default().is_noop());
    }

    /// Real SSE mock over HTTP (the provider goes through reqwest), replying
    /// with the configured text and capturing each request's `model` field and
    /// user message (the distiller's exchange + memory offer list).
    struct CapturedRequest {
        model: String,
        user_content: String,
    }

    async fn spawn_memories_mock_provider(
        reply: impl Into<String>,
    ) -> (String, Arc<tokio::sync::Mutex<Vec<CapturedRequest>>>) {
        use bytes::Bytes;

        let reply = reply.into();
        let captured = Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let app = {
            let captured = captured.clone();
            axum::Router::new().route(
                "/v1/chat/completions",
                axum::routing::post(move |Json(body): Json<serde_json::Value>| async move {
                    captured.lock().await.push(CapturedRequest {
                        model: body["model"].as_str().unwrap_or_default().to_string(),
                        user_content: body["messages"][1]["content"]
                            .as_str()
                            .unwrap_or_default()
                            .to_string(),
                    });
                    let frames = vec![
                        Bytes::from(format!(
                            "data: {}\n\n",
                            serde_json::json!({"choices":[{"delta":{"content": reply}}]})
                        )),
                        Bytes::from("data: [DONE]\n\n"),
                    ];
                    let body =
                        futures_util::stream::iter(frames.into_iter().map(Ok::<_, std::io::Error>));
                    (
                        [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                        axum::body::Body::from_stream(body),
                    )
                        .into_response()
                }),
            )
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (base_url, captured)
    }

    fn seed_exchange(conn: &rusqlite::Connection, conversation_id: i64, incognito: bool) {
        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at, incognito)
             VALUES (?1, 'venting', '0', '0', ?2)",
            rusqlite::params![conversation_id, incognito as i64],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at)
             VALUES (?1, 'USER', 'I am exhausted from the March commute', '0')",
            [conversation_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at)
             VALUES (?1, 'ASSISTANT', 'That sounds draining. Want to plan around it?', '0')",
            [conversation_id],
        )
        .unwrap();
    }

    #[tokio::test]
    async fn distillation_writes_provenance_tagged_memories() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        {
            let conn = db.get().unwrap();
            seed_exchange(&conn, 3, false);
        }

        let (base_url, captured) = spawn_memories_mock_provider(
            "MEMORY: user reports March commute exhaustion\nMEMORY: wants help planning the month",
        )
        .await;
        let provider =
            OpenAiCompatProvider::from_settings(Some(base_url), None, Some("mock".to_string()))
                .unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(FakeEmbedder::new(|text| {
            vec![text.len() as f32; crate::db::EMBEDDING_DIM]
        }));

        // The chat history's tool step: the pump inserts it RUNNING; the
        // distillation settles it.
        let conn = db.get().unwrap();
        let tool_message_id =
            crate::schema::insert_tool_message(&conn, 3, "update_memories", "RUNNING").unwrap();
        drop(conn);

        let outcome = distill_conversation(&db, embedder.as_ref(), &provider, 3)
            .await
            .unwrap();
        assert_eq!(
            outcome,
            DistillOutcome {
                added: 2,
                ..Default::default()
            }
        );

        finish_tool_message(&db, Some(tool_message_id), &Ok(outcome)).unwrap();

        let conn = db.get().unwrap();
        let tool_row: (String, String) = conn
            .query_row(
                "SELECT tool_state, content FROM messages WHERE id = ?1",
                [tool_message_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(tool_row.0, "DONE");
        assert_eq!(tool_row.1, "Updated 2 memories");

        // Regression: the distillation request must carry the provider's
        // configured model — an empty model is rejected by real backends,
        // which silently killed automatic memory writes.
        assert_eq!(captured.lock().await[0].model, "mock");

        let conn = db.get().unwrap();
        let memories = list_memories(&conn).unwrap();
        assert_eq!(memories.len(), 2);
        for memory in &memories {
            assert_eq!(memory.source, MemorySource::Distilled);
            assert_eq!(
                memory.conversation_id,
                Some(3),
                "provenance records the source chat"
            );
        }
    }

    #[tokio::test]
    async fn distillation_skips_incognito_chats() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        {
            let conn = db.get().unwrap();
            seed_exchange(&conn, 4, true);
        }

        let (base_url, _captured_models) =
            spawn_memories_mock_provider("MEMORY: should never be written").await;
        let provider =
            OpenAiCompatProvider::from_settings(Some(base_url), None, Some("mock".to_string()))
                .unwrap();
        let embedder: Arc<dyn Embedder> =
            Arc::new(FakeEmbedder::new(|_| vec![1.0; crate::db::EMBEDDING_DIM]));

        let outcome = distill_conversation(&db, embedder.as_ref(), &provider, 4)
            .await
            .unwrap();
        assert_eq!(outcome, DistillOutcome::default());
        let conn = db.get().unwrap();
        assert!(list_memories(&conn).unwrap().is_empty());
    }

    /// The 0029 behavior: the distiller sees the recent store and rewrites
    /// or removes superseded `distilled` memories. Manual memories are
    /// offered for reference but are read-only to the model, and ids it
    /// was never offered are ignored.
    #[tokio::test]
    async fn distillation_reconciles_updates_and_deletes() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        {
            let conn = db.get().unwrap();
            seed_exchange(&conn, 3, false);
        }
        let embedder: Arc<dyn Embedder> = Arc::new(FakeEmbedder::new(|text| {
            vec![text.len() as f32; crate::db::EMBEDDING_DIM]
        }));

        let stale_city = write_memory(
            &db,
            embedder.as_ref(),
            "User lives in NYC",
            MemorySource::Distilled,
            Some(3),
        )
        .await
        .unwrap();
        let stale_bike = write_memory(
            &db,
            embedder.as_ref(),
            "User owns a road bike",
            MemorySource::Distilled,
            Some(3),
        )
        .await
        .unwrap();
        let manual = write_memory(
            &db,
            embedder.as_ref(),
            "User drinks tea",
            MemorySource::Manual,
            None,
        )
        .await
        .unwrap();

        let reply = format!(
            "UPDATE 999: forged id\nDELETE 998: forged too\n\
             UPDATE {manual}: user drinks coffee\n\
             UPDATE {stale_city}: User lives in SF\nDELETE {stale_bike}\n\
             MEMORY: User works at Acme"
        );
        let (base_url, captured) = spawn_memories_mock_provider(reply).await;
        let provider =
            OpenAiCompatProvider::from_settings(Some(base_url), None, Some("mock".to_string()))
                .unwrap();

        let outcome = distill_conversation(&db, embedder.as_ref(), &provider, 3)
            .await
            .unwrap();

        // The offer list reached the prompt: distilled memories carry #ids,
        // the manual one is marked read-only.
        let user_content = captured.lock().await[0].user_content.clone();
        assert!(
            user_content.contains(&format!("#{stale_city} User lives in NYC")),
            "offer list must carry distilled memories: {user_content}"
        );
        assert!(
            user_content.contains("User drinks tea (written by the user; read-only)"),
            "manual memories are offered read-only: {user_content}"
        );

        assert_eq!(
            outcome,
            DistillOutcome {
                added: 1,
                updated: 1,
                deleted: 1
            },
            "forged ids and the manual memory are ignored"
        );

        let conn = db.get().unwrap();
        let city: (String, String) = conn
            .query_row(
                "SELECT content, source FROM memories WHERE id = ?1",
                [stale_city],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            city,
            (
                "User lives in SF".to_string(),
                MemorySource::Distilled.as_str().to_string()
            ),
            "superseded fact is rewritten in place (id + source kept)"
        );
        let bike_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM memories WHERE id = ?1",
                [stale_bike],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(bike_count, 0, "superseded memory removed");
        let bike_vector: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM memories_vec WHERE memory_id = ?1",
                [stale_bike],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(bike_vector, 0, "deletion removes the vector too");
        let manual_content: String = conn
            .query_row(
                "SELECT content FROM memories WHERE id = ?1",
                [manual],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            manual_content, "User drinks tea",
            "manual memories are read-only to the model"
        );
        let added: Vec<(String, String)> = conn
            .prepare("SELECT content, source FROM memories WHERE content LIKE 'User works at%'")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            added,
            vec![("User works at Acme".to_string(), "distilled".to_string())],
            "new fact added with distilled source"
        );
    }
}
