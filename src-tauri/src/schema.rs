use async_graphql::{Context, Enum, InputObject, Object, SimpleObject, Subscription, Union, ID};
use futures_util::StreamExt;
use rusqlite::{params, Connection, OptionalExtension};
use tokio_stream::wrappers::ReceiverStream;

use crate::db::{self, Db};
use crate::provider::{ChatMessage, ChatProvider, ChatRequest, ChatRole, OpenAiCompatProvider};

/// Shared failure type behind the `Error { message }` union arm pattern
/// carried over from the existing schema.
#[derive(Debug, Clone, SimpleObject)]
#[graphql(name = "Error")]
pub struct GqlError {
    pub message: String,
}

impl GqlError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

/// The single local user; no auth machinery exists in the desktop app.
#[derive(Debug, Clone, SimpleObject)]
#[graphql(name = "user")]
pub struct LocalUser {
    pub id: ID,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub picture_url: Option<String>,
}

impl LocalUser {
    fn local() -> Self {
        Self {
            id: ID("local".to_string()),
            email: "local@privait.app".to_string(),
            first_name: Some("Privait".to_string()),
            last_name: None,
            picture_url: None,
        }
    }
}

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
pub struct GqlConversation {
    pub id: i64,
    pub title: String,
    pub archived: bool,
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

    async fn messages(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<GqlMessage>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        Ok(select_messages(&conn, self.id)?)
    }
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(name = "Message")]
pub struct GqlMessage {
    pub id: ID,
    pub role: MessageRole,
    pub content: String,
}

#[derive(Debug, Clone, Default, SimpleObject)]
#[graphql(name = "Settings")]
pub struct GqlSettings {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl GqlSettings {
    fn from_conn(conn: &Connection) -> Self {
        let read = |key: &str| {
            db::get_setting(conn, key)
                .ok()
                .flatten()
                .unwrap_or_default()
        };
        Self {
            base_url: read("provider.baseUrl"),
            api_key: read("provider.apiKey"),
            model: read("provider.model"),
        }
    }
}

#[derive(Debug, InputObject)]
pub struct SettingsInput {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

pub struct Query;

#[Object]
impl Query {
    /// Liveness check for the in-process API server.
    async fn health(&self) -> &'static str {
        "ok"
    }

    /// Resolves locally; kept so the frontend's user context keeps working.
    async fn current_user(&self, _ctx: &Context<'_>) -> LocalUser {
        LocalUser::local()
    }

    async fn conversations(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<GqlConversation>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;

        let mut stmt =
            conn.prepare("SELECT id, title, archived FROM conversations ORDER BY id ASC")?;
        let rows = stmt
            .query_map([], |row| {
                Ok(GqlConversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    archived: row.get::<_, i64>(2)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    async fn conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: i64,
    ) -> async_graphql::Result<Option<GqlConversation>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;

        Ok(conn
            .query_row(
                "SELECT id, title, archived FROM conversations WHERE id = ?1",
                [conversation_id],
                |row| {
                    Ok(GqlConversation {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        archived: row.get::<_, i64>(2)? != 0,
                    })
                },
            )
            .optional()?)
    }

    async fn settings(&self, ctx: &Context<'_>) -> async_graphql::Result<GqlSettings> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        Ok(GqlSettings::from_conn(&conn))
    }
}

// ---------------------------------------------------------------------------
// Mutation result unions (Error | XSuccess pattern from the old schema)
// ---------------------------------------------------------------------------

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationDeleteConversationSuccess")]
pub struct MutationDeleteConversationSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationDeleteConversationResult {
    Error(GqlError),
    MutationDeleteConversationSuccess(MutationDeleteConversationSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationRenameConversationSuccess")]
pub struct MutationRenameConversationSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationRenameConversationResult {
    Error(GqlError),
    MutationRenameConversationSuccess(MutationRenameConversationSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationArchiveConversationSuccess")]
pub struct MutationArchiveConversationSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationArchiveConversationResult {
    Error(GqlError),
    MutationArchiveConversationSuccess(MutationArchiveConversationSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationSaveSettingsSuccess")]
pub struct MutationSaveSettingsSuccess {
    pub data: GqlSettings,
}

#[derive(Union)]
pub enum MutationSaveSettingsResult {
    Error(GqlError),
    MutationSaveSettingsSuccess(MutationSaveSettingsSuccess),
}

fn conversation_error(conn: &Connection, conversation_id: i64) -> Option<async_graphql::Error> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM conversations WHERE id = ?1",
            [conversation_id],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();

    if exists.is_none() {
        Some(async_graphql::Error::new("Conversation not found"))
    } else {
        None
    }
}

pub struct Mutation;

#[Object]
impl Mutation {
    async fn delete_conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: i64,
    ) -> MutationDeleteConversationResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationDeleteConversationResult::Error(GqlError::new(err.message)),
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => {
                return MutationDeleteConversationResult::Error(GqlError::new(err.to_string()))
            }
        };

        if let Some(err) = conversation_error(&conn, conversation_id) {
            return MutationDeleteConversationResult::Error(GqlError::new(err.message));
        }

        match conn.execute("DELETE FROM conversations WHERE id = ?1", [conversation_id]) {
            Ok(_) => MutationDeleteConversationResult::MutationDeleteConversationSuccess(
                MutationDeleteConversationSuccess { data: true },
            ),
            Err(err) => MutationDeleteConversationResult::Error(GqlError::new(err.to_string())),
        }
    }

    async fn rename_conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: i64,
        title: String,
    ) -> MutationRenameConversationResult {
        if title.trim().is_empty() {
            return MutationRenameConversationResult::Error(GqlError::new(
                "Title must not be empty",
            ));
        }

        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationRenameConversationResult::Error(GqlError::new(err.message)),
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => {
                return MutationRenameConversationResult::Error(GqlError::new(err.to_string()))
            }
        };

        if let Some(err) = conversation_error(&conn, conversation_id) {
            return MutationRenameConversationResult::Error(GqlError::new(err.message));
        }

        match conn.execute(
            "UPDATE conversations SET title = ?1 WHERE id = ?2",
            params![title, conversation_id],
        ) {
            Ok(_) => MutationRenameConversationResult::MutationRenameConversationSuccess(
                MutationRenameConversationSuccess { data: true },
            ),
            Err(err) => MutationRenameConversationResult::Error(GqlError::new(err.to_string())),
        }
    }

    async fn archive_conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: i64,
        archived: bool,
    ) -> MutationArchiveConversationResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => {
                return MutationArchiveConversationResult::Error(GqlError::new(err.message))
            }
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => {
                return MutationArchiveConversationResult::Error(GqlError::new(err.to_string()))
            }
        };

        if let Some(err) = conversation_error(&conn, conversation_id) {
            return MutationArchiveConversationResult::Error(GqlError::new(err.message));
        }

        match conn.execute(
            "UPDATE conversations SET archived = ?1 WHERE id = ?2",
            params![archived as i64, conversation_id],
        ) {
            Ok(_) => MutationArchiveConversationResult::MutationArchiveConversationSuccess(
                MutationArchiveConversationSuccess { data: true },
            ),
            Err(err) => MutationArchiveConversationResult::Error(GqlError::new(err.to_string())),
        }
    }

    async fn save_settings(
        &self,
        ctx: &Context<'_>,
        input: SettingsInput,
    ) -> MutationSaveSettingsResult {
        let base_url = reqwest::Url::parse(input.base_url.trim());
        let valid = matches!(
            base_url.as_ref().map(|url| url.scheme()),
            Ok("http" | "https")
        );
        if !valid {
            return MutationSaveSettingsResult::Error(GqlError::new(
                "Base URL must be a valid http(s) URL",
            ));
        }

        if input.model.trim().is_empty() {
            return MutationSaveSettingsResult::Error(GqlError::new("Model must not be empty"));
        }

        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationSaveSettingsResult::Error(GqlError::new(err.message)),
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => return MutationSaveSettingsResult::Error(GqlError::new(err.to_string())),
        };

        let writes = [
            ("provider.baseUrl", input.base_url.trim()),
            ("provider.apiKey", input.api_key.trim()),
            ("provider.model", input.model.trim()),
        ];
        for (key, value) in writes {
            if let Err(err) = db::set_setting(&conn, key, value) {
                return MutationSaveSettingsResult::Error(GqlError::new(err.to_string()));
            }
        }

        MutationSaveSettingsResult::MutationSaveSettingsSuccess(MutationSaveSettingsSuccess {
            data: GqlSettings::from_conn(&conn),
        })
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
fn conversation_title(prompt: &str) -> String {
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

fn select_messages(conn: &Connection, conversation_id: i64) -> rusqlite::Result<Vec<GqlMessage>> {
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
    /// Kill switch: dropping the subscription (stop button / disconnect)
    /// drops the receiver below; the pump task notices the failed send,
    /// aborts the provider request, and persists the partial reply.
    async fn conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: Option<i64>,
        message: String,
    ) -> async_graphql::Result<ReceiverStream<SubscriptionConversationResult>> {
        let db = ctx.data::<Db>()?.clone();
        let conn = db.get()?;

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
                let now = now_iso();
                conn.execute(
                    "INSERT INTO conversations (title, created_at, updated_at) VALUES (?1, ?2, ?3)",
                    params![conversation_title(&message), now, now],
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

        let history = select_messages(&conn, conversation_id)?;
        let user_message_id = insert_message(&conn, conversation_id, "USER", &message)?;
        let assistant_message_id = insert_message(&conn, conversation_id, "ASSISTANT", "")?;

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
        request_messages.push(ChatMessage {
            role: ChatRole::User,
            content: message,
        });

        let (tx, rx) = tokio::sync::mpsc::channel::<SubscriptionConversationResult>(64);
        let chunk_db = db.clone();

        tokio::spawn(async move {
            let request = ChatRequest {
                model: provider.model().to_string(),
                messages: request_messages,
            };

            let mut accumulated = String::new();

            match provider.stream_chat(request).await {
                Err(err) => {
                    let _ = tx
                        .send(SubscriptionConversationResult::Error(GqlError::new(
                            err.to_string(),
                        )))
                        .await;
                }
                Ok(mut chunks) => {
                    while let Some(item) = chunks.next().await {
                        match item {
                            Ok(chunk) => {
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
                                    break;
                                }
                                accumulated.push_str(&chunk);
                            }
                            Err(err) => {
                                let _ = tx
                                    .send(SubscriptionConversationResult::Error(GqlError::new(
                                        err.to_string(),
                                    )))
                                    .await;
                                break;
                            }
                        }
                    }

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

            // Persist whatever was generated (full or partial). The empty
            // placeholder row always gets replaced.
            let content = accumulated;
            if let Ok(conn) = chunk_db.get() {
                let _ = conn.execute(
                    "UPDATE messages SET content = ?1 WHERE id = ?2",
                    params![content, assistant_message_id],
                );
            }
        });

        Ok(ReceiverStream::new(rx))
    }
}

pub type AppSchema = async_graphql::Schema<Query, Mutation, Subscription>;

pub fn build_schema(db: Db) -> AppSchema {
    async_graphql::Schema::build(Query, Mutation, Subscription)
        .data(db)
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::time::Duration;

    use axum::response::IntoResponse;
    use serde_json::json;

    use crate::db::Db;

    fn test_db() -> Db {
        let dir = tempfile::TempDir::new().unwrap();
        crate::db::init(dir.path()).unwrap()
    }

    fn schema_with(db: Db) -> AppSchema {
        build_schema(db)
    }

    async fn seed_provider_settings(conn: &Connection, base_url: &str) {
        db::set_setting(conn, "provider.baseUrl", base_url).unwrap();
        db::set_setting(conn, "provider.model", "test-model").unwrap();
    }

    /// Spawns a mock OpenAI-compatible SSE endpoint. Streams `chunks` with
    /// `chunk_delay_ms` between them, then `[DONE]`. Returns the base URL to
    /// put in provider settings.
    async fn spawn_mock_provider(chunks: Vec<&'static str>, chunk_delay_ms: u64) -> String {
        use bytes::Bytes;

        let app = axum::Router::new().route(
            "/v1/chat/completions",
            axum::routing::post(move || async move {
                let frames: Vec<Bytes> = chunks
                    .iter()
                    .flat_map(|chunk| {
                        let payload =
                            json!({ "choices": [{ "delta": { "content": chunk } }] }).to_string();
                        vec![Bytes::from(format!("data: {payload}\n\n"))]
                    })
                    .chain(std::iter::once(Bytes::from("data: [DONE]\n\n")))
                    .collect::<Vec<_>>();
                let chunk_delay_ms = chunk_delay_ms;
                let body_stream =
                    futures_util::stream::iter(frames).then(move |frame| async move {
                        if chunk_delay_ms > 0 {
                            tokio::time::sleep(Duration::from_millis(chunk_delay_ms)).await;
                        }
                        Ok::<_, std::io::Error>(frame)
                    });

                (
                    [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                    axum::body::Body::from_stream(body_stream),
                )
                    .into_response()
            }),
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        base_url
    }

    const SUBSCRIPTION_QUERY: &str = r#"
        subscription ConversationSub($conversationId: Int, $message: String!) {
            conversation(conversationId: $conversationId, message: $message) {
                __typename
                ... on SubscriptionConversationSuccess {
                    data {
                        conversationId
                        previousMessageId
                        messageId
                        messageChunk
                        done
                    }
                }
                ... on Error {
                    message
                }
            }
        }
    "#;

    fn subscription_request(conversation_id: Option<i64>, message: &str) -> async_graphql::Request {
        async_graphql::Request::new(SUBSCRIPTION_QUERY).variables(
            async_graphql::Variables::from_value(async_graphql::value!({
                "message": message,
                "conversationId": conversation_id,
            })),
        )
    }

    fn payload_item(response: async_graphql::Response) -> serde_json::Value {
        let result = response.into_result().unwrap();
        serde_json::to_value(result.data).unwrap()
    }

    fn error_message(payload: &serde_json::Value) -> Option<String> {
        payload
            .get("conversation")
            .and_then(|v| v.get("message"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    }

    #[tokio::test]
    async fn subscription_streams_chunks_and_persists_messages() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["Hello ", "world"], 0).await;
            seed_provider_settings(&conn, &base_url).await;
        }

        let schema = schema_with(db.clone());
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));

        let mut chunks = Vec::new();
        let mut saw_done = false;
        while let Some(response) = stream.next().await {
            let payload = payload_item(response);
            let item = &payload["conversation"];
            match item["__typename"].as_str() {
                Some("SubscriptionConversationSuccess") => {
                    let data = &item["data"];
                    if data["done"].as_bool() == Some(true) {
                        saw_done = true;
                    } else {
                        chunks.push(data["messageChunk"].as_str().unwrap().to_string());
                    }
                }
                other => panic!("unexpected item: {other:?} {item:?}"),
            }
        }

        assert_eq!(chunks, vec!["Hello ", "world"]);
        assert!(saw_done);

        let conn = db.get().unwrap();
        let (conversation_count, title): (i64, String) = conn
            .query_row(
                "SELECT COUNT(*), (SELECT title FROM conversations ORDER BY id DESC LIMIT 1) FROM conversations",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(conversation_count, 1);
        assert_eq!(title, "hi", "title comes from the first prompt");

        let messages = select_messages(&conn, 1).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, MessageRole::User);
        assert_eq!(messages[0].content, "hi");
        assert_eq!(messages[1].role, MessageRole::Assistant);
        assert_eq!(messages[1].content, "Hello world");
    }

    #[tokio::test]
    async fn subscription_continues_an_existing_conversation() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["reply"], 0).await;
            seed_provider_settings(&conn, &base_url).await;
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (7, 'chat', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 7, 'USER', 'earlier', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());
        let mut stream = schema.execute_stream(subscription_request(Some(7), "again"));

        let mut chunks = Vec::new();
        while let Some(response) = stream.next().await {
            let payload = payload_item(response);
            let data = &payload["conversation"]["data"];
            if data["done"].as_bool() != Some(true) {
                chunks.push(
                    data["messageChunk"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string(),
                );
            }
        }

        assert_eq!(chunks, vec!["reply"]);

        let conn = db.get().unwrap();
        let messages = select_messages(&conn, 7).unwrap();
        assert_eq!(messages.len(), 3, "earlier + new user + assistant");
        assert_eq!(messages[0].content, "earlier");
        assert_eq!(messages[2].content, "reply");
    }

    #[tokio::test]
    async fn subscription_reports_missing_conversation_as_error_arm() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let mut stream = schema.execute_stream(subscription_request(Some(404), "hi"));
        let response = stream.next().await.unwrap();
        let payload = payload_item(response);

        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert_eq!(
            error_message(&payload),
            Some("Conversation not found".to_string())
        );
    }

    #[tokio::test]
    async fn subscription_requires_a_configured_provider() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        let response = stream.next().await.unwrap();
        let payload = payload_item(response);

        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert!(error_message(&payload).unwrap().contains("not configured"));
    }

    #[tokio::test]
    async fn subscription_surfaces_provider_errors() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            // Point the provider at a path that 404s.
            let base_url = spawn_mock_provider(vec![], 0).await;
            db::set_setting(&conn, "provider.baseUrl", &format!("{base_url}/nope")).unwrap();
            db::set_setting(&conn, "provider.model", "test-model").unwrap();
        }

        let schema = schema_with(db.clone());
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        let response = stream.next().await.unwrap();
        let payload = payload_item(response);

        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert!(error_message(&payload).unwrap().contains("failed"));
    }

    #[tokio::test]
    async fn dropping_the_subscription_persists_the_partial_reply() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["part-one", " part-two"], 300).await;
            seed_provider_settings(&conn, &base_url).await;
        }

        let schema = schema_with(db.clone());
        let stream = schema.execute_stream(subscription_request(None, "hi"));
        let mut stream = stream.take(1); // stop after the first chunk — the "stop" button

        let first = stream.next().await.unwrap();
        let payload = payload_item(first);
        assert_eq!(
            payload["conversation"]["data"]["messageChunk"].as_str(),
            Some("part-one")
        );

        // Drop the stream = unsubscribe; the backend kill switch must abort
        // the provider request and persist the partial reply.
        drop(stream);

        let conn = db.get().unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            let content: Option<String> = conn
                .query_row(
                    "SELECT content FROM messages WHERE role = 'ASSISTANT' LIMIT 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            if content == Some("part-one".to_string()) {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "assistant message was not persisted as partial: {content:?}"
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    #[tokio::test]
    async fn conversation_queries_return_created_rows() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (3, 'chat', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 3, 'USER', 'hello', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());

        let response = schema
            .execute("{ conversations { id title archived messages { id role content } } }")
            .await
            .into_result()
            .unwrap();
        let data = serde_json::to_value(&response.data).unwrap();
        let conversations = data["conversations"].as_array().unwrap();
        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0]["title"], json!("chat"));
        assert_eq!(conversations[0]["archived"], json!(false));
        assert_eq!(conversations[0]["messages"][0]["content"], json!("hello"));
        assert_eq!(conversations[0]["messages"][0]["role"], json!("USER"));

        let response = schema
            .execute("{ conversation(conversationId: 3) { id title } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["conversation"]["title"],
            json!("chat")
        );

        let response = schema
            .execute("{ conversation(conversationId: 99) { id } }")
            .await
            .into_result()
            .unwrap();
        assert!(serde_json::to_value(&response.data).unwrap()["conversation"].is_null());
    }

    #[tokio::test]
    async fn delete_conversation_mutation_removes_rows() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (3, 'chat', '0', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                "mutation { deleteConversation(conversationId: 3) { __typename
                    ... on MutationDeleteConversationSuccess { data }
                    ... on Error { message } } }",
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteConversation"]["data"],
            json!(true)
        );

        let conn = db.get().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn delete_conversation_reports_missing() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                "mutation { deleteConversation(conversationId: 404) { __typename
                    ... on Error { message } } }",
            )
            .await
            .into_result()
            .unwrap();

        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteConversation"]["message"],
            json!("Conversation not found")
        );
    }

    #[tokio::test]
    async fn rename_and_archive_mutations_persist() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (3, 'chat', '0', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());

        schema
            .execute(
                r#"mutation { renameConversation(conversationId: 3, title: "Renamed") { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        schema
            .execute(
                "mutation { archiveConversation(conversationId: 3, archived: true) { __typename
                    ... on Error { message } } }",
            )
            .await
            .into_result()
            .unwrap();

        let conn = db.get().unwrap();
        let (title, archived): (String, i64) = conn
            .query_row(
                "SELECT title, archived FROM conversations WHERE id = 3",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "Renamed");
        assert_eq!(archived, 1);
    }

    #[tokio::test]
    async fn rename_rejects_blank_title() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                r#"mutation { renameConversation(conversationId: 3, title: "   ") { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();

        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["renameConversation"]["message"],
            json!("Title must not be empty")
        );
    }

    #[tokio::test]
    async fn settings_round_trip_via_schema() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute("{ settings { baseUrl apiKey model } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["baseUrl"],
            json!("")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["apiKey"],
            json!("")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["model"],
            json!("")
        );

        let response = schema
            .execute(
                r#"mutation { saveSettings(input: { baseUrl: "http://localhost:11434/v1", apiKey: "sk-test", model: "smollm2:360m" }) { __typename
                    ... on MutationSaveSettingsSuccess { data { baseUrl apiKey model } }
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["data"]["baseUrl"],
            json!("http://localhost:11434/v1")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["data"]["apiKey"],
            json!("sk-test")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["data"]["model"],
            json!("smollm2:360m")
        );

        let response = schema
            .execute("{ settings { baseUrl apiKey model } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["model"],
            json!("smollm2:360m")
        );
    }

    #[tokio::test]
    async fn save_settings_rejects_bad_base_url_and_empty_model() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                r#"mutation { saveSettings(input: { baseUrl: "not-a-url", apiKey: "", model: "m" }) { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["message"],
            json!("Base URL must be a valid http(s) URL")
        );

        let response = schema
            .execute(
                r#"mutation { saveSettings(input: { baseUrl: "http://x/v1", apiKey: "", model: " " }) { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["message"],
            json!("Model must not be empty")
        );
    }

    #[test]
    fn title_from_prompt_truncates_on_word_boundary() {
        let prompt = "explain how the kill switch aborts the provider request mid stream";

        let title = conversation_title(prompt);

        assert!(title.ends_with('…'));
        assert!(title.chars().count() <= 51);
        let stem = title.trim_end_matches('…');
        assert!(
            prompt.starts_with(stem),
            "cut must stay on a word boundary: {title}"
        );
        assert!(!stem.ends_with(' '));
    }

    #[test]
    fn title_from_prompt_collapses_whitespace() {
        assert_eq!(
            conversation_title("hello\n\n   world \t there"),
            "hello world there"
        );
    }

    #[test]
    fn title_from_prompt_keeps_short_prompts_verbatim() {
        assert_eq!(conversation_title("hi"), "hi");
    }

    #[test]
    fn title_from_prompt_falls_back_for_empty_prompt() {
        assert_eq!(conversation_title(""), "Untitled chat");
        assert_eq!(conversation_title("   \n  "), "Untitled chat");
    }

    /// The checked-in SDL is the porting contract: any schema change must be a
    /// reviewed diff here, and M4's parity gate diffs this against the old
    /// server's `schema.graphql` (minus auth).
    const SNAPSHOT_PATH: &str = "schema.snapshot.graphql";

    fn snapshot_path() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(SNAPSHOT_PATH)
    }

    #[test]
    fn schema_sdl_matches_snapshot() {
        let db = test_db();
        let sdl = build_schema(db).sdl();

        let path = snapshot_path();
        if std::env::var("PRIVAIT_UPDATE_SCHEMA_SNAPSHOT").is_ok() {
            std::fs::write(&path, &sdl).unwrap();
        }

        let expected = std::fs::read_to_string(&path).unwrap_or_else(|err| {
            panic!(
                "missing schema snapshot at {} (set PRIVAIT_UPDATE_SCHEMA_SNAPSHOT=1 and run cargo test to create it): {err}",
                path.display()
            )
        });

        assert_eq!(sdl, expected, "GraphQL schema drifted from {SNAPSHOT_PATH}");
    }
}
