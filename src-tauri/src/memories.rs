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
You extract long-term memories from a chat exchange. Return at most two \
memories: durable facts, preferences, or context worth remembering later \
(never transient chatter). Reply with one memory per line, each prefixed \
with `MEMORY: `. If nothing is worth remembering, reply with nothing else.";

const MAX_MEMORY_CHARS: usize = 500;
const MAX_MEMORIES_PER_TURN: usize = 2;

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

/// Extracts `MEMORY: `-prefixed lines from the provider's reply, bounded and
/// cleaned. Nothing else in the reply is trusted.
fn parse_memories(reply: &str) -> Vec<String> {
    reply
        .lines()
        .filter_map(|line| line.trim().strip_prefix("MEMORY:"))
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .map(|mut line| {
            if line.chars().count() > MAX_MEMORY_CHARS {
                line = line.chars().take(MAX_MEMORY_CHARS).collect();
            }
            line
        })
        .take(MAX_MEMORIES_PER_TURN)
        .collect()
}

/// Post-chat distillation: sends the last exchange through the configured
/// provider and writes what it proposes as `distilled` memories with chat
/// provenance. Incognito chats are never touched. Returns how many memories
/// were written.
pub async fn distill_conversation(
    db: &Db,
    embedder: &dyn Embedder,
    provider: &dyn ChatProvider,
    conversation_id: i64,
) -> Result<usize, String> {
    let conn = db.get().map_err(|err| err.to_string())?;
    if is_incognito(&conn, conversation_id) {
        return Ok(0);
    }
    let Some((user_content, assistant_content)) =
        last_exchange(&conn, conversation_id).map_err(|err| err.to_string())?
    else {
        return Ok(0);
    };
    drop(conn);

    let request = ChatRequest {
        model: String::new(),
        messages: vec![
            ChatMessage {
                role: ChatRole::System,
                content: DISTILL_SYSTEM_PROMPT.to_string(),
            },
            ChatMessage {
                role: ChatRole::User,
                content: format!("User: {user_content}\n\nAssistant: {assistant_content}"),
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

    let proposals = parse_memories(&reply);
    let mut written = 0;
    for content in proposals {
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
            written += 1;
        }
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::response::IntoResponse;
    use std::sync::Arc;

    use crate::embeddings::FakeEmbedder;
    use crate::provider::OpenAiCompatProvider;

    #[test]
    fn parse_memories_takes_only_prefixed_lines() {
        let reply = "Sure, here is what I noted:\nMEMORY: user prefers terse answers\n\
                     noise line\nMEMORY:   \nMEMORY: works in Berlin\nMEMORY: too much\n";
        let parsed = parse_memories(reply);
        assert_eq!(
            parsed,
            vec!["user prefers terse answers", "works in Berlin"]
        );
    }

    #[test]
    fn parse_memories_truncates_and_caps() {
        let long = "x".repeat(800);
        let reply = format!("MEMORY: a\nMEMORY: {long}\nMEMORY: c\nMEMORY: d");
        let parsed = parse_memories(&reply);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0], "a");
        assert_eq!(parsed[1].chars().count(), MAX_MEMORY_CHARS);
    }

    #[test]
    fn parse_memories_empty_reply_is_empty() {
        assert!(parse_memories("nothing notable").is_empty());
    }

    /// Real SSE mock over HTTP (the provider goes through reqwest), replying
    /// with the configured text.
    async fn spawn_memories_mock_provider(reply: &'static str) -> String {
        use bytes::Bytes;

        let app = axum::Router::new().route(
            "/v1/chat/completions",
            axum::routing::post(move || async move {
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
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        base_url
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

        let base_url = spawn_memories_mock_provider(
            "MEMORY: user reports March commute exhaustion\nMEMORY: wants help planning the month",
        )
        .await;
        let provider =
            OpenAiCompatProvider::from_settings(Some(base_url), None, Some("mock".to_string()))
                .unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(FakeEmbedder::new(|text| {
            vec![text.len() as f32; crate::db::EMBEDDING_DIM]
        }));

        let written = distill_conversation(&db, embedder.as_ref(), &provider, 3)
            .await
            .unwrap();
        assert_eq!(written, 2);

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

        let base_url = spawn_memories_mock_provider("MEMORY: should never be written").await;
        let provider =
            OpenAiCompatProvider::from_settings(Some(base_url), None, Some("mock".to_string()))
                .unwrap();
        let embedder: Arc<dyn Embedder> =
            Arc::new(FakeEmbedder::new(|_| vec![1.0; crate::db::EMBEDDING_DIM]));

        let written = distill_conversation(&db, embedder.as_ref(), &provider, 4)
            .await
            .unwrap();
        assert_eq!(written, 0);
        let conn = db.get().unwrap();
        assert!(list_memories(&conn).unwrap().is_empty());
    }
}
