//! Chat domain: conversation/message types and the streaming chat
//! subscription (the send path, its grounding, and its run safety).

use std::sync::Arc;
use std::time::Duration;

use async_graphql::{Context, Enum, Object, SimpleObject, Subscription, Union, ID};
use futures_util::StreamExt;
use rusqlite::{params, Connection, OptionalExtension};
use tokio_stream::wrappers::ReceiverStream;

use crate::db::{self, Db};
use crate::embeddings::Embedder;
use crate::files;
use crate::provider::{ChatMessage, ChatProvider, ChatRequest, ChatRole, OpenAiCompatProvider};
use crate::retrieval::{self, RetrievalInput};
use crate::runs::{self, RunRegistry};

use super::files::GqlFileUpload;
use super::GqlError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Enum)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

impl MessageRole {
    fn parse(raw: &str) -> Self {
        match raw {
            "ASSISTANT" => MessageRole::Assistant,
            "SYSTEM" => MessageRole::System,
            _ => MessageRole::User,
        }
    }
}

/// A persisted conversation. `archived` is thread-sidebar state (rename and
/// archive are now persisted — they were client-only in the web app).
/// `project_id` scopes the chat to a project (None = plain chat).
pub struct GqlConversation {
    pub id: i64,
    pub title: String,
    pub archived: bool,
    pub project_id: Option<i64>,
}

#[Object(name = "Conversation")]
impl GqlConversation {
    async fn id(&self) -> ID {
        ID(self.id.to_string())
    }

    async fn title(&self) -> &str {
        &self.title
    }

    async fn archived(&self) -> bool {
        self.archived
    }

    #[graphql(name = "projectId")]
    async fn project_id(&self) -> Option<i64> {
        self.project_id
    }

    async fn messages(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<GqlMessage>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        Ok(select_messages(&conn, self.id)?)
    }
}

#[derive(Debug, Clone)]
pub struct GqlMessage {
    pub id: ID,
    pub role: MessageRole,
    pub content: String,
}

#[Object(name = "Message")]
impl GqlMessage {
    async fn id(&self) -> ID {
        self.id.clone()
    }

    async fn role(&self) -> MessageRole {
        self.role
    }

    async fn content(&self) -> &str {
        &self.content
    }

    /// Attachments carried by this message — lets chat history re-render
    /// the file chips after a reload.
    async fn files(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<GqlFileUpload>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        let id: i64 = self
            .id
            .0
            .parse()
            .map_err(|_| async_graphql::Error::new("invalid message id"))?;
        Ok(files::files_for_message(&conn, id)?
            .into_iter()
            .map(|row| GqlFileUpload { row })
            .collect())
    }
}

// ---------------------------------------------------------------------------
// Subscription: streaming chat
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, SimpleObject)]
pub struct ConversationMessageChunk {
    pub conversation_id: ID,
    pub previous_message_id: ID,
    pub message_id: ID,
    pub message_chunk: String,
    pub done: Option<bool>,
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "SubscriptionConversationSuccess")]
pub struct SubscriptionConversationSuccess {
    pub data: ConversationMessageChunk,
}

#[derive(Union)]
pub enum SubscriptionConversationResult {
    Error(GqlError),
    SubscriptionConversationSuccess(SubscriptionConversationSuccess),
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Derives a conversation title from the user's first prompt: whitespace
/// collapsed, hard-truncated on a word boundary with an ellipsis. A
/// summarizer model will take over title generation later; users can always
/// rename via the sidebar.
pub(crate) fn conversation_title(prompt: &str) -> String {
    let collapsed = prompt.split_whitespace().collect::<Vec<_>>().join(" ");

    if collapsed.is_empty() {
        return "Untitled chat".to_string();
    }

    const MAX_CHARS: usize = 50;
    if collapsed.chars().count() <= MAX_CHARS {
        return collapsed;
    }

    let head: String = collapsed.chars().take(MAX_CHARS).collect();
    let cut = head.rfind(' ').unwrap_or(MAX_CHARS);
    format!("{}…", head[..cut].trim_end())
}

pub(crate) fn select_messages(
    conn: &Connection,
    conversation_id: i64,
) -> rusqlite::Result<Vec<GqlMessage>> {
    // Attachments ride along in one batched query so history re-renders
    // chips after reload.
    let mut files_stmt = conn.prepare(
        "SELECT m.id, f.id, f.original_name, f.file_name, f.mime_type, f.size, f.kind,
                f.status, f.processed_at, f.created_at
         FROM messages m
         JOIN files f ON f.message_id = m.id
         WHERE m.conversation_id = ?1
         ORDER BY f.id ASC",
    )?;
    let mut files_by_message: std::collections::HashMap<i64, Vec<files::FileRow>> =
        Default::default();
    files_stmt
        .query_map([conversation_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                files::FileRow {
                    id: row.get(1)?,
                    original_name: row.get(2)?,
                    file_name: row.get(3)?,
                    mime_type: row.get(4)?,
                    size: row.get(5)?,
                    kind: row.get(6)?,
                    status: row.get(7)?,
                    processed_at: row.get(8)?,
                    created_at: row.get(9)?,
                },
            ))
        })?
        .for_each(|entry| {
            if let Ok((message_id, row)) = entry {
                files_by_message.entry(message_id).or_default().push(row);
            }
        });

    let mut stmt = conn.prepare(
        "SELECT id, role, content FROM messages
         WHERE conversation_id = ?1 ORDER BY id ASC",
    )?;
    let rows = stmt
        .query_map([conversation_id], |row| {
            Ok(GqlMessage {
                id: ID(row.get::<_, i64>(0)?.to_string()),
                role: MessageRole::parse(&row.get::<_, String>(1)?),
                content: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn insert_message(
    conn: &Connection,
    conversation_id: i64,
    role: &str,
    content: &str,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![conversation_id, role, content, now_iso()],
    )?;
    Ok(conn.last_insert_rowid())
}

/// One-item stream carrying an `Error` union arm (mirrors the old Pothos
/// behavior where subscription errors arrived as union payloads).
fn error_stream(
    message: impl Into<String> + Send + 'static,
) -> ReceiverStream<SubscriptionConversationResult> {
    let (tx, rx) = tokio::sync::mpsc::channel(1);
    tokio::spawn(async move {
        let _ = tx
            .send(SubscriptionConversationResult::Error(GqlError::new(
                message,
            )))
            .await;
    });
    ReceiverStream::new(rx)
}

pub struct Subscription;

#[Subscription]
impl Subscription {
    /// Starts (or continues) a chat turn. `conversationId` omitted creates a
    /// conversation; the new user message and an empty assistant message are
    /// persisted up front, then provider chunks stream over this subscription.
    ///
    /// `fileIds` are uploads sent with this turn (the composer uploads them
    /// right before subscribing). They are attached to the user message here;
    /// file chunks from this conversation ground the turn. `message` may be
    /// empty when files are attached — the model then receives a synthesized
    /// instruction while the bubble keeps just the chips.
    ///
    /// Run safety: one reply per conversation at a time — a second send while
    /// a reply is streaming gets an `Error` arm instead of racing it. Stop
    /// works two ways: dropping the subscription (stop button unsubscribe /
    /// disconnect) drops the receiver below and the pump aborts on the next
    /// send attempt, and the `stopRun` mutation cancels the run outright via
    /// the run registry — which also aborts when no chunk is flowing. Either
    /// way the partial reply is persisted.
    async fn conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: Option<i64>,
        message: String,
        file_ids: Option<Vec<i64>>,
        project_id: Option<i64>,
    ) -> async_graphql::Result<ReceiverStream<SubscriptionConversationResult>> {
        let db = ctx.data::<Db>()?.clone();
        let conn = db.get()?;

        let file_ids = file_ids.unwrap_or_default();
        let attached_files: Vec<files::FileRow> = {
            let mut rows = Vec::with_capacity(file_ids.len());
            for file_id in &file_ids {
                if let Some(row) = files::get_file(&conn, *file_id)? {
                    rows.push(row);
                }
            }
            rows
        };
        let has_files = !attached_files.is_empty();

        let conversation_id = match conversation_id {
            Some(conversation_id) => {
                let exists: Option<i64> = conn
                    .query_row(
                        "SELECT id FROM conversations WHERE id = ?1",
                        [conversation_id],
                        |row| row.get(0),
                    )
                    .optional()?;
                match exists {
                    Some(_) => conversation_id,
                    None => return Ok(error_stream("Conversation not found")),
                }
            }
            None => {
                // A first send can open the chat inside a project; the
                // project must exist so a lying client can't invent one.
                let scoped_project = match project_id {
                    Some(project_id) => {
                        let exists: Option<i64> = conn
                            .query_row(
                                "SELECT id FROM projects WHERE id = ?1",
                                [project_id],
                                |row| row.get(0),
                            )
                            .optional()?;
                        if exists.is_none() {
                            return Ok(error_stream("Project not found"));
                        }
                        Some(project_id)
                    }
                    None => None,
                };
                let now = now_iso();
                // A file-only first message titles the thread from its first
                // file; otherwise from the prompt.
                let title = match message.trim().is_empty() && has_files {
                    true => conversation_title(&attached_files[0].original_name),
                    false => conversation_title(&message),
                };
                conn.execute(
                    "INSERT INTO conversations (title, created_at, updated_at, project_id)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![title, now, now, scoped_project],
                )?;
                conn.last_insert_rowid()
            }
        };

        let provider = match OpenAiCompatProvider::from_settings(
            db::get_setting(&conn, "provider.baseUrl").unwrap_or_default(),
            db::get_setting(&conn, "provider.apiKey").unwrap_or_default(),
            db::get_setting(&conn, "provider.model").unwrap_or_default(),
        ) {
            Some(provider) => provider,
            None => {
                return Ok(error_stream(
                    "Chat provider is not configured — set it up in Settings",
                ))
            }
        };

        // One run per conversation: claim the slot before touching the
        // transcript so a double send can't interleave two replies. The
        // listener drives the pump's abort on `stopRun`; the guard frees the
        // slot on every exit path — including a resolver error before the
        // pump ever spawns, so a failed send can't wedge the chat.
        let runs = ctx.data::<Arc<RunRegistry>>()?.clone();
        let stop_signal = match runs.try_register(conversation_id) {
            Some(stop_signal) => stop_signal,
            None => {
                return Ok(error_stream(
                    "A reply is already being generated in this chat — stop it first or wait for it to finish",
                ))
            }
        };
        let run_guard = runs::finish_guard(runs.clone(), conversation_id);

        let history = select_messages(&conn, conversation_id)?;
        let user_message_id = insert_message(&conn, conversation_id, "USER", &message)?;
        let assistant_message_id = insert_message(&conn, conversation_id, "ASSISTANT", "")?;

        if has_files {
            files::link_to_message(&conn, &file_ids, user_message_id)?;
        }

        // The model's user turn: the prompt, or a synthesized instruction for
        // a file-only send (the persisted bubble keeps its empty text).
        let prompt_for_provider = match message.trim().is_empty() && has_files {
            true => "Please read the attached file(s) and respond.".to_string(),
            false => message.clone(),
        };

        // Project scope: instructions frame every turn; knowledge chunks
        // ground it (below). Plain chats keep both empty.
        let (project_name, project_instructions) = match conn
            .query_row(
                "SELECT p.name, p.instructions FROM projects p
                 JOIN conversations c ON c.project_id = p.id WHERE c.id = ?1",
                [conversation_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?
        {
            Some((name, instructions)) if !instructions.trim().is_empty() => {
                (name, Some(instructions))
            }
            Some((name, _)) => (name, None),
            None => (String::new(), None),
        };

        // Ground the turn: embed the prompt once and pull top-4 memories
        // (global) + top-4 chunks from this conversation's attachments +
        // top-4 chunks from the project's knowledge folder (similarity ≥ 0.5)
        // as system context. A file-only send has nothing meaningful to
        // embed, so it takes the conversation's opening chunks and skips
        // memories. Embedding failures degrade to an ungrounded turn instead
        // of failing chat (e.g. the model is still downloading).
        let embedder = ctx.data::<Arc<dyn Embedder>>()?.clone();
        let grounding = if message.trim().is_empty() && has_files {
            (
                Vec::new(),
                retrieval::conversation_chunks_head(&db, conversation_id).unwrap_or_default(),
                Vec::new(),
            )
        } else {
            match embedder.embed(&prompt_for_provider).await {
                Ok(query_embedding) => {
                    let input = RetrievalInput {
                        db: &db,
                        query_embedding: &query_embedding,
                        conversation_id,
                    };
                    let memories = retrieval::related_memories(&input).unwrap_or_default();
                    let chunks = retrieval::related_file_chunks(&input).unwrap_or_default();
                    let project = retrieval::related_project_chunks(&input).unwrap_or_default();
                    (memories, chunks, project)
                }
                Err(err) => {
                    eprintln!("[privait] retrieval skipped, embedding failed: {err}");
                    (Vec::new(), Vec::new(), Vec::new())
                }
            }
        };

        let mut request_messages: Vec<ChatMessage> = history
            .into_iter()
            .map(|m| ChatMessage {
                role: match m.role {
                    MessageRole::Assistant => ChatRole::Assistant,
                    MessageRole::System => ChatRole::System,
                    MessageRole::User => ChatRole::User,
                },
                content: m.content,
            })
            .collect();

        let (related_memories, related_chunks, related_project) = grounding;

        // The project's instructions frame every chat in the project.
        if let Some(instructions) = project_instructions {
            request_messages.push(ChatMessage {
                role: ChatRole::System,
                content: format!(
                    "The user is working in the project \"{}\". Follow these project instructions:\n{}",
                    project_name, instructions
                ),
            });
        }
        if !related_memories.is_empty() {
            request_messages.push(ChatMessage {
                role: ChatRole::System,
                content: format!(
                    "Here are some related memories: {}",
                    related_memories.join("\n")
                ),
            });
        }
        if !related_chunks.is_empty() {
            request_messages.push(ChatMessage {
                role: ChatRole::System,
                content: format!(
                    "Here are some related file chunks: {}",
                    related_chunks.join("\n")
                ),
            });
        }
        if !related_project.is_empty() {
            request_messages.push(ChatMessage {
                role: ChatRole::System,
                content: format!(
                    "Here are some related chunks from this project's knowledge: {}",
                    related_project.join("\n")
                ),
            });
        }

        request_messages.push(ChatMessage {
            role: ChatRole::User,
            content: prompt_for_provider,
        });

        let (tx, rx) = tokio::sync::mpsc::channel::<SubscriptionConversationResult>(64);
        let chunk_db = db.clone();
        // Exists in the real app (lib.rs); None in test schemas without a
        // queue — background distillation is skipped there.
        let chat_jobs = ctx
            .data::<Option<Arc<crate::jobs::Jobs>>>()
            .ok()
            .cloned()
            .flatten();

        // Bound on time-to-first-chunk so a hung provider can't leave the
        // composer spinning forever; overridable for tests.
        let first_chunk_timeout = ctx
            .data::<FirstChunkTimeout>()
            .map(|t| t.0)
            .unwrap_or(Duration::from_secs(30));
        tokio::spawn(async move {
            // Frees the conversation's run slot whenever the pump ends
            // (done, error, subscriber dropped, cancelled, panic).
            let _run_guard = run_guard;

            let request = ChatRequest {
                model: provider.model().to_string(),
                messages: request_messages,
            };

            let mut accumulated = String::new();
            let mut failed = false;
            let mut stopped = false;
            // Incremental persistence: flush the partial reply to the
            // assistant row while streaming, so a killed process (Cmd+Q)
            // keeps everything generated up to the last flush. The final
            // write at the end of the pump stays the source of truth.
            let mut last_flush = tokio::time::Instant::now();
            const FLUSH_INTERVAL: Duration = Duration::from_millis(500);

            // Connection, response headers, and the first chunk share one
            // budget: a provider that stalls anywhere before streaming must
            // surface as an Error arm instead of an endless spinner. Once
            // streaming, slower generations are expected. Stop races the
            // open phase so a quick stop aborts the connect too.
            let opened = tokio::select! {
                _ = runs::cancelled(stop_signal.clone()) => {
                    stopped = true;
                    None
                }
                open_outcome = tokio::time::timeout(first_chunk_timeout, async {
                    let mut stream = provider.stream_chat(request).await?;
                    let first = stream.next().await;
                    Ok::<_, crate::provider::ProviderError>((stream, first))
                }) => match open_outcome {
                    Ok(Ok(outcome)) => Some(outcome),
                    Ok(Err(err)) => {
                        let _ = tx
                            .send(SubscriptionConversationResult::Error(GqlError::new(
                                err.to_string(),
                            )))
                            .await;
                        failed = true;
                        None
                    }
                    Err(_) => {
                        let _ = tx
                            .send(SubscriptionConversationResult::Error(GqlError::new(
                                format!(
                                    "Provider did not respond within {}s",
                                    first_chunk_timeout.as_secs()
                                ),
                            )))
                            .await;
                        failed = true;
                        None
                    }
                }
            };

            if let Some((mut stream, first)) = opened {
                let mut pending_first = Some(first);
                loop {
                    let item = match pending_first.take() {
                        Some(item) => item,
                        None => {
                            // Stop must abort promptly even when the
                            // provider has stopped sending chunks.
                            tokio::select! {
                                _ = runs::cancelled(stop_signal.clone()) => {
                                    stopped = true;
                                    break;
                                }
                                item = stream.next() => item,
                            }
                        }
                    };

                    if runs::is_cancelled(&stop_signal) {
                        stopped = true;
                        break;
                    }

                    match item {
                        Some(Ok(chunk)) => {
                            let emitted = tx
                                .send(SubscriptionConversationResult::SubscriptionConversationSuccess(
                                    SubscriptionConversationSuccess {
                                        data: ConversationMessageChunk {
                                            conversation_id: ID(conversation_id.to_string()),
                                            previous_message_id: ID(user_message_id.to_string()),
                                            message_id: ID(assistant_message_id.to_string()),
                                            message_chunk: chunk.clone(),
                                            done: Some(false),
                                        },
                                    },
                                ))
                                .await;
                            if emitted.is_err() {
                                // Subscriber went away (stop button or
                                // disconnect) — abort the request and
                                // keep what streamed so far.
                                failed = true;
                                break;
                            }
                            accumulated.push_str(&chunk);

                            if last_flush.elapsed() >= FLUSH_INTERVAL {
                                if let Ok(conn) = chunk_db.get() {
                                    let _ = conn.execute(
                                        "UPDATE messages SET content = ?1 WHERE id = ?2",
                                        params![accumulated, assistant_message_id],
                                    );
                                }
                                last_flush = tokio::time::Instant::now();
                            }
                        }
                        Some(Err(err)) => {
                            let _ = tx
                                .send(SubscriptionConversationResult::Error(GqlError::new(
                                    err.to_string(),
                                )))
                                .await;
                            failed = true;
                            break;
                        }
                        // Provider closed the stream — treat as done.
                        None => break,
                    }
                }

                if !failed {
                    let _ = tx
                        .send(
                            SubscriptionConversationResult::SubscriptionConversationSuccess(
                                SubscriptionConversationSuccess {
                                    data: ConversationMessageChunk {
                                        conversation_id: ID(conversation_id.to_string()),
                                        previous_message_id: ID(user_message_id.to_string()),
                                        message_id: ID(assistant_message_id.to_string()),
                                        message_chunk: String::new(),
                                        done: Some(true),
                                    },
                                },
                            ),
                        )
                        .await;
                }
            }

            // Persist whatever was generated (full, partial, or nothing — a
            // stop that landed before the first chunk deletes the empty
            // placeholder instead of leaving a ghost bubble).
            let content = accumulated;
            let produced_reply = !content.is_empty();
            if let Ok(conn) = chunk_db.get() {
                if stopped && content.is_empty() {
                    let _ =
                        conn.execute("DELETE FROM messages WHERE id = ?1", [assistant_message_id]);
                } else {
                    let _ = conn.execute(
                        "UPDATE messages SET content = ?1 WHERE id = ?2",
                        params![content, assistant_message_id],
                    );
                }
            }

            // Post-chat distillation: the automatic memory path. Skipped for
            // incognito chats and failed/empty turns; the queue worker
            // re-checks incognito (this job may sit behind others).
            if !failed && produced_reply {
                if let Some(jobs) = chat_jobs {
                    if let Err(err) = jobs
                        .push_job(crate::jobs::AppJob::DistillMemory { conversation_id })
                        .await
                    {
                        eprintln!(
                            "distill job enqueue failed for conversation {conversation_id}: {err}"
                        );
                    }
                }
            }
        });

        Ok(ReceiverStream::new(rx))
    }
}

/// Time budget for the provider's first streamed chunk; a hung provider
/// surfaces as an Error arm instead of a stuck composer.
#[derive(Debug, Clone, Copy)]
pub struct FirstChunkTimeout(pub Duration);

impl Default for FirstChunkTimeout {
    fn default() -> Self {
        Self(Duration::from_secs(30))
    }
}
