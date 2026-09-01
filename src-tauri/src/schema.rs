use std::io::Read;
use std::sync::Arc;
use std::time::Duration;

use async_graphql::{
    Context, Enum, InputObject, Object, SimpleObject, Subscription, Union, Upload, ID,
};
use futures_util::StreamExt;
use rusqlite::{params, Connection, OptionalExtension};
use tokio_stream::wrappers::ReceiverStream;

use crate::db::{self, Db};
use crate::embeddings::Embedder;
use crate::files::{self, FileRow};
use crate::provider::{ChatMessage, ChatProvider, ChatRequest, ChatRole, OpenAiCompatProvider};
use crate::retrieval::{self, RetrievalInput};
use crate::storage::Storage;

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
// Files (M3): same surface as the old schema — FileUpload { id, originalName,
// type, status, createdAt }, enums FileType/FileStatus.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Enum)]
#[graphql(name = "FileType", rename_items = "SCREAMING_SNAKE_CASE")]
pub enum GqlFileType {
    Pdf,
    Text,
}

impl GqlFileType {
    fn parse(raw: &str) -> Self {
        match raw {
            "PDF" => GqlFileType::Pdf,
            _ => GqlFileType::Text,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Enum)]
#[graphql(name = "FileStatus", rename_items = "SCREAMING_SNAKE_CASE")]
pub enum GqlFileStatus {
    Uploaded,
    Processed,
}

impl GqlFileStatus {
    fn parse(raw: &str) -> Self {
        match raw {
            "PROCESSED" => GqlFileStatus::Processed,
            _ => GqlFileStatus::Uploaded,
        }
    }
}

pub struct GqlFileUpload {
    pub row: FileRow,
}

#[Object(name = "FileUpload")]
impl GqlFileUpload {
    async fn id(&self) -> ID {
        ID(self.row.id.to_string())
    }

    async fn original_name(&self) -> &str {
        &self.row.original_name
    }

    #[graphql(name = "type")]
    async fn file_type(&self) -> GqlFileType {
        GqlFileType::parse(&self.row.kind)
    }

    async fn status(&self) -> GqlFileStatus {
        GqlFileStatus::parse(&self.row.status)
    }

    async fn created_at(&self) -> &str {
        &self.row.created_at
    }
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

    /// All uploaded files, oldest first (matches the old resolver's ordering).
    async fn files(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<GqlFileUpload>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        Ok(files::list_files(&conn)?
            .into_iter()
            .map(|row| GqlFileUpload { row })
            .collect())
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

#[derive(SimpleObject)]
#[graphql(name = "MutationUploadFileSuccess")]
pub struct MutationUploadFileSuccess {
    pub data: GqlFileUpload,
}

#[derive(Union)]
pub enum MutationUploadFileResult {
    Error(GqlError),
    MutationUploadFileSuccess(MutationUploadFileSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationDeleteFileUploadSuccess")]
pub struct MutationDeleteFileUploadSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationDeleteFileUploadResult {
    Error(GqlError),
    MutationDeleteFileUploadSuccess(MutationDeleteFileUploadSuccess),
}

/// `input: FileUploadInput!` — kept for the old schema's shape even though it
/// only carries the upload.
#[derive(Debug, InputObject)]
pub struct FileUploadInput {
    pub file: Upload,
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

    /// Persists a validated upload (5MB cap, MIME allowlist) to storage and
    /// the `files` table, then runs the extract → chunk → embed pipeline
    /// inline and returns the PROCESSED row. Upload happens on send, so the
    /// user is waiting on the result — background processing (the apalis
    /// worker) is no longer in this path. On pipeline failure the upload is
    /// rolled back so nothing lingers unprocessed.
    async fn upload_file(
        &self,
        ctx: &Context<'_>,
        input: FileUploadInput,
    ) -> MutationUploadFileResult {
        let storage = match ctx.data::<Option<Arc<Storage>>>() {
            Ok(Some(storage)) => storage.clone(),
            Ok(None) | Err(_) => {
                return MutationUploadFileResult::Error(GqlError::new(
                    "File storage is not available",
                ))
            }
        };
        let embedder = match ctx.data::<Arc<dyn Embedder>>() {
            Ok(embedder) => embedder.clone(),
            Err(err) => return MutationUploadFileResult::Error(GqlError::new(err.message)),
        };
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationUploadFileResult::Error(GqlError::new(err.message)),
        };

        let upload = match input.file.value(ctx) {
            Ok(upload) => upload,
            Err(err) => return MutationUploadFileResult::Error(GqlError::new(err.to_string())),
        };

        let original_name = if upload.filename.is_empty() {
            "unknown".to_string()
        } else {
            upload.filename.clone()
        };
        let mime_type = upload
            .content_type
            .clone()
            .unwrap_or_else(|| "application/octet-stream".to_string());

        let mut bytes = Vec::new();
        if upload.into_read().read_to_end(&mut bytes).is_err() {
            return MutationUploadFileResult::Error(GqlError::new("Failed to upload file"));
        }

        let row = match files::store_upload(db, &storage, bytes, &original_name, &mime_type).await {
            Ok(row) => row,
            Err(message) => return MutationUploadFileResult::Error(GqlError::new(message)),
        };

        let deps = files::PipelineDeps {
            db: db.clone(),
            storage,
            embedder,
        };
        if let Err(message) = files::process_uploaded_file(&deps, row.id).await {
            let _ = files::delete_upload(db, &deps.storage, row.id).await;
            return MutationUploadFileResult::Error(GqlError::new(format!(
                "Could not process file: {message}"
            )));
        }

        let refreshed_row: Result<Option<files::FileRow>, String> = (|| {
            let conn = db.get().map_err(|err| err.to_string())?;
            files::get_file(&conn, row.id).map_err(|err| err.to_string())
        })();
        match refreshed_row {
            Ok(Some(row)) => {
                MutationUploadFileResult::MutationUploadFileSuccess(MutationUploadFileSuccess {
                    data: GqlFileUpload { row },
                })
            }
            Ok(None) => MutationUploadFileResult::Error(GqlError::new("Failed to upload file")),
            Err(err) => MutationUploadFileResult::Error(GqlError::new(err)),
        }
    }

    /// Removes the upload, its stored bytes, and its vector chunks.
    async fn delete_file_upload(
        &self,
        ctx: &Context<'_>,
        file_id: i64,
    ) -> MutationDeleteFileUploadResult {
        let storage = match ctx.data::<Option<Arc<Storage>>>() {
            Ok(Some(storage)) => storage.clone(),
            Ok(None) | Err(_) => {
                return MutationDeleteFileUploadResult::Error(GqlError::new(
                    "File storage is not available",
                ))
            }
        };
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationDeleteFileUploadResult::Error(GqlError::new(err.message)),
        };

        match files::delete_upload(db, &storage, file_id).await {
            Ok(_) => MutationDeleteFileUploadResult::MutationDeleteFileUploadSuccess(
                MutationDeleteFileUploadSuccess { data: true },
            ),
            Err(message) => MutationDeleteFileUploadResult::Error(GqlError::new(message)),
        }
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
    /// Kill switch: dropping the subscription (stop button / disconnect)
    /// drops the receiver below; the pump task notices the failed send,
    /// aborts the provider request, and persists the partial reply.
    async fn conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: Option<i64>,
        message: String,
        file_ids: Option<Vec<i64>>,
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
                let now = now_iso();
                // A file-only first message titles the thread from its first
                // file; otherwise from the prompt.
                let title = match message.trim().is_empty() && has_files {
                    true => conversation_title(&attached_files[0].original_name),
                    false => conversation_title(&message),
                };
                conn.execute(
                    "INSERT INTO conversations (title, created_at, updated_at) VALUES (?1, ?2, ?3)",
                    params![title, now, now],
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

        if has_files {
            files::link_to_message(&conn, &file_ids, user_message_id)?;
        }

        // The model's user turn: the prompt, or a synthesized instruction for
        // a file-only send (the persisted bubble keeps its empty text).
        let prompt_for_provider = match message.trim().is_empty() && has_files {
            true => "Please read the attached file(s) and respond.".to_string(),
            false => message.clone(),
        };

        // Ground the turn: embed the prompt once and pull top-4 memories
        // (global) + top-4 chunks from this conversation's attachments
        // (similarity ≥ 0.5) as system context. A file-only send has nothing
        // meaningful to embed, so it takes the conversation's opening chunks
        // and skips memories. Embedding failures degrade to an ungrounded
        // turn instead of failing chat (e.g. the model is still downloading).
        let embedder = ctx.data::<Arc<dyn Embedder>>()?.clone();
        let grounding = if message.trim().is_empty() && has_files {
            (
                Vec::new(),
                retrieval::conversation_chunks_head(&db, conversation_id).unwrap_or_default(),
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
                    (memories, chunks)
                }
                Err(err) => {
                    eprintln!("[privait] retrieval skipped, embedding failed: {err}");
                    (Vec::new(), Vec::new())
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

        let (related_memories, related_chunks) = grounding;
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

        request_messages.push(ChatMessage {
            role: ChatRole::User,
            content: prompt_for_provider,
        });

        let (tx, rx) = tokio::sync::mpsc::channel::<SubscriptionConversationResult>(64);
        let chunk_db = db.clone();

        // Bound on time-to-first-chunk so a hung provider can't leave the
        // composer spinning forever; overridable for tests.
        let first_chunk_timeout = ctx
            .data::<FirstChunkTimeout>()
            .map(|t| t.0)
            .unwrap_or(Duration::from_secs(30));
        tokio::spawn(async move {
            let request = ChatRequest {
                model: provider.model().to_string(),
                messages: request_messages,
            };

            let mut accumulated = String::new();
            let mut failed = false;

            // Connection, response headers, and the first chunk share one
            // budget: a provider that stalls anywhere before streaming must
            // surface as an Error arm instead of an endless spinner. Once
            // streaming, slower generations are expected.
            let opened = match tokio::time::timeout(first_chunk_timeout, async {
                let mut stream = provider.stream_chat(request).await?;
                let first = stream.next().await;
                Ok::<_, crate::provider::ProviderError>((stream, first))
            })
            .await
            {
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
            };

            if let Some((mut stream, first)) = opened {
                let mut pending_first = Some(first);
                loop {
                    let item = match pending_first.take() {
                        Some(item) => item,
                        None => stream.next().await,
                    };

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

/// Time budget for the provider's first streamed chunk; a hung provider
/// surfaces as an Error arm instead of a stuck composer.
#[derive(Debug, Clone, Copy)]
pub struct FirstChunkTimeout(pub Duration);

impl Default for FirstChunkTimeout {
    fn default() -> Self {
        Self(Duration::from_secs(30))
    }
}

pub type AppSchema = async_graphql::Schema<Query, Mutation, Subscription>;

/// Everything the schema's resolvers reach for beyond the content DB.
/// `storage` is `None` only in test/dev schemas that never touch uploads —
/// the resolvers surface a clean `Error` arm in that case.
pub struct SchemaContext {
    pub db: Db,
    pub storage: Option<Arc<Storage>>,
    pub embedder: Arc<dyn Embedder>,
}

pub fn build_schema(db: Db) -> AppSchema {
    build_schema_with_timeout(db, FirstChunkTimeout::default().0)
}

pub fn build_schema_with_timeout(db: Db, timeout: Duration) -> AppSchema {
    let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
        vec![0.0; db::EMBEDDING_DIM]
    }));
    build_schema_with_context(
        SchemaContext {
            db,
            storage: None,
            embedder,
        },
        timeout,
    )
}

pub fn build_schema_with_context(ctx: SchemaContext, timeout: Duration) -> AppSchema {
    async_graphql::Schema::build(Query, Mutation, Subscription)
        .data(ctx.db)
        .data(ctx.storage)
        .data(ctx.embedder)
        .data(FirstChunkTimeout(timeout))
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::time::Duration;

    use axum::response::IntoResponse;
    use serde_json::json;
    use tower::ServiceExt;

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

    #[tokio::test]
    async fn subscription_fails_loudly_when_the_provider_never_responds() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            // Squat on the port: connections are accepted but nothing is
            // ever read — the provider appears hung.
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            tokio::spawn(async move {
                loop {
                    let (socket, _) = listener.accept().await.unwrap();
                    tokio::spawn(async move {
                        socket.writable().await.unwrap();
                        tokio::time::sleep(Duration::from_secs(10)).await;
                    });
                }
            });
            let base_url = format!("http://{addr}/v1");
            seed_provider_settings(&conn, &base_url).await;
        }

        // 300ms budget instead of the default 30s.
        let schema = build_schema_with_timeout(db.clone(), Duration::from_millis(300));
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));

        let started = std::time::Instant::now();
        let first = tokio::time::timeout(Duration::from_secs(5), stream.next())
            .await
            .unwrap()
            .unwrap();
        let elapsed = started.elapsed();

        let payload = payload_item(first);
        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert!(
            error_message(&payload).unwrap().contains("did not respond"),
            "got: {:?}",
            error_message(&payload)
        );
        assert!(elapsed < Duration::from_secs(2), "took {elapsed:?}");

        // The empty assistant placeholder stays empty; user message intact.
        let conn = db.get().unwrap();
        let assistant: Option<String> = conn
            .query_row(
                "SELECT content FROM messages WHERE role = 'ASSISTANT' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(assistant, Some(String::new()));
    }

    const SUBSCRIPTION_QUERY: &str = r#"
        subscription ConversationSub($conversationId: Int, $message: String!, $fileIds: [Int!]) {
            conversation(conversationId: $conversationId, message: $message, fileIds: $fileIds) {
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
        subscription_request_with_files(conversation_id, message, &[])
    }

    fn subscription_request_with_files(
        conversation_id: Option<i64>,
        message: &str,
        file_ids: &[i64],
    ) -> async_graphql::Request {
        async_graphql::Request::new(SUBSCRIPTION_QUERY).variables(
            async_graphql::Variables::from_value(async_graphql::value!({
                "message": message,
                "conversationId": conversation_id,
                "fileIds": file_ids,
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

    // -----------------------------------------------------------------------
    // M3 — files + RAG
    // -----------------------------------------------------------------------

    fn upload_context(
        db: Db,
        storage: crate::storage::Storage,
        embedder: Arc<dyn Embedder>,
    ) -> AppSchema {
        build_schema_with_context(
            SchemaContext {
                db,
                storage: Some(Arc::new(storage)),
                embedder,
            },
            FirstChunkTimeout::default().0,
        )
    }

    /// Builds a graphql-multipart-request-spec body for a single upload.
    fn multipart_body(
        boundary: &str,
        mutation: &str,
        variables: serde_json::Value,
        file_field: &str,
        file_name: &str,
        mime: &str,
        bytes: &[u8],
    ) -> Vec<u8> {
        let mut body = Vec::new();
        let open = format!("--{boundary}\r\n");
        body.extend_from_slice(open.as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"operations\"\r\n\r\n");
        body.extend_from_slice(
            json!({ "query": mutation, "variables": variables })
                .to_string()
                .as_bytes(),
        );
        body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"map\"\r\n\r\n");
        body.extend_from_slice(
            json!({ "0": [format!("variables.{file_field}")] })
                .to_string()
                .as_bytes(),
        );
        body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!(
                "Content-Disposition: form-data; name=\"0\"; filename=\"{file_name}\"\r\n\
                 Content-Type: {mime}\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        body
    }

    async fn post_multipart(
        router: &mut axum::Router,
        token: &str,
        body: Vec<u8>,
        boundary: &str,
    ) -> serde_json::Value {
        use axum::body::Body;
        use http_body_util::BodyExt;

        let request = axum::http::Request::post("/graphql")
            .header(
                axum::http::header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::from(body))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();
        assert_eq!(response.status(), 200);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    const UPLOAD_MUTATION: &str = r#"
        mutation UploadFile($file: Upload!) {
            uploadFile(input: { file: $file }) {
                __typename
                ... on MutationUploadFileSuccess { data { id originalName type status } }
                ... on Error { message }
            }
        }
    "#;

    #[tokio::test]
    async fn upload_via_multipart_stores_and_lists_the_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let schema = upload_context(
            db,
            crate::storage::Storage::memory().unwrap(),
            Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
                vec![0.0; db::EMBEDDING_DIM]
            })),
        );
        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());

        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "notes.md",
            "text/markdown",
            b"# hello",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;

        let result = &payload["data"]["uploadFile"];
        assert_eq!(result["__typename"], json!("MutationUploadFileSuccess"));
        assert_eq!(result["data"]["originalName"], json!("notes.md"));
        assert_eq!(result["data"]["type"], json!("TEXT"));
        assert_eq!(result["data"]["status"], json!("PROCESSED"));

        // The file list query sees the new row.
        let response = router
            .oneshot(
                axum::http::Request::post("/graphql")
                    .header(axum::http::header::CONTENT_TYPE, "application/json")
                    .header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"))
                    .body(axum::body::Body::from(
                        json!({ "query": "{ files { id originalName status type } }" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = http_body_util::BodyExt::collect(response.into_body())
            .await
            .unwrap()
            .to_bytes();
        let payload: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let files = payload["data"]["files"].as_array().unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0]["originalName"], json!("notes.md"));
        assert_eq!(files[0]["status"], json!("PROCESSED"));
        assert_eq!(files[0]["type"], json!("TEXT"));
    }

    #[tokio::test]
    async fn upload_rejects_disallowed_mime_and_oversize_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let schema = upload_context(
            db,
            crate::storage::Storage::memory().unwrap(),
            Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
                vec![0.0; db::EMBEDDING_DIM]
            })),
        );
        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());

        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "evil.zip",
            "application/zip",
            b"PK",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;
        assert_eq!(payload["data"]["uploadFile"]["__typename"], json!("Error"));
        assert_eq!(
            payload["data"]["uploadFile"]["message"],
            json!("Only PDF and text files are allowed")
        );

        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "big.txt",
            "text/plain",
            &vec![b'a'; crate::files::MAX_FILE_SIZE + 1],
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;
        assert_eq!(payload["data"]["uploadFile"]["__typename"], json!("Error"));
        assert_eq!(
            payload["data"]["uploadFile"]["message"],
            json!("File size exceeds 5MB limit")
        );
    }

    #[tokio::test]
    async fn upload_processes_inline_and_returns_processed() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|text| {
            let mut vector = vec![0.0f32; db::EMBEDDING_DIM];
            vector[0] = text.len() as f32;
            vector
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());
        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "doc.txt",
            "text/plain",
            b"grounded chat needs embeddings for this text.",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;
        let result = &payload["data"]["uploadFile"];

        // Inline processing: the mutation returns the row already PROCESSED
        // with its vectors in place — the send path never polls.
        assert_eq!(result["__typename"], json!("MutationUploadFileSuccess"));
        assert_eq!(result["data"]["status"], json!("PROCESSED"));
        let file_id: i64 = result["data"]["id"].as_str().unwrap().parse().unwrap();

        let chunks: i64 = {
            let conn = db.get().unwrap();
            conn.query_row(
                "SELECT COUNT(*) FROM file_chunks WHERE file_id = ?1",
                [file_id],
                |row| row.get(0),
            )
            .unwrap()
        };
        assert!(chunks > 0);
    }

    #[tokio::test]
    async fn upload_pipeline_failure_rolls_back_and_reports() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        // Valid multipart file whose contents are not a real PDF.
        let storage = crate::storage::Storage::memory().unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());
        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "broken.pdf",
            "application/pdf",
            b"not really a pdf",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;

        assert_eq!(payload["data"]["uploadFile"]["__typename"], json!("Error"));
        assert!(
            payload["data"]["uploadFile"]["message"]
                .as_str()
                .unwrap()
                .contains("Could not process file"),
            "got: {:?}",
            payload["data"]["uploadFile"]["message"]
        );

        // Rolled back: no half-processed row lingers.
        let rows: i64 = {
            let conn = db.get().unwrap();
            conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(rows, 0);
    }

    #[tokio::test]
    async fn delete_file_upload_removes_row_bytes_and_chunks() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();
        let schema = upload_context(
            db.clone(),
            storage.clone(),
            Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
                vec![0.0; db::EMBEDDING_DIM]
            })),
        );

        let row = crate::files::store_upload(
            &db,
            &storage,
            b"content".to_vec(),
            "gone.txt",
            "text/plain",
        )
        .await
        .unwrap();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, 'chunk', ?2)",
                rusqlite::params![db::embedding_to_blob(&vec![1.0; db::EMBEDDING_DIM]), row.id],
            )
            .unwrap();
        }

        let response = schema
            .execute(format!(
                "mutation {{ deleteFileUpload(fileId: {}) {{ __typename
                    ... on MutationDeleteFileUploadSuccess {{ data }}
                    ... on Error {{ message }} }} }}",
                row.id
            ))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteFileUpload"]["data"],
            json!(true)
        );

        let conn = db.get().unwrap();
        let (rows, chunks): (i64, i64) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM files), (SELECT COUNT(*) FROM file_chunks WHERE file_id = ?1)",
                [row.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(rows, 0);
        assert_eq!(chunks, 0);
        assert!(storage.read(&row.file_name).await.is_err());

        // A second delete reports the old error verbatim.
        let response = schema
            .execute(format!(
                "mutation {{ deleteFileUpload(fileId: {}) {{ __typename ... on Error {{ message }} }} }}",
                row.id
            ))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteFileUpload"]["message"],
            json!("File not found")
        );
    }

    /// Mock provider that also records the request body so tests can assert
    /// the exact message list (grounding, order, history) sent to the model.
    async fn spawn_capturing_mock_provider(
        chunks: Vec<&'static str>,
    ) -> (String, Arc<std::sync::Mutex<Option<serde_json::Value>>>) {
        use bytes::Bytes;

        let captured: Arc<std::sync::Mutex<Option<serde_json::Value>>> =
            Arc::new(std::sync::Mutex::new(None));
        let tap = captured.clone();

        let app = axum::Router::new().route(
            "/v1/chat/completions",
            axum::routing::post(move |body: String| {
                let tap = tap.clone();
                let chunks = chunks.clone();
                async move {
                    *tap.lock().unwrap() = serde_json::from_str(&body).ok();

                    let frames: Vec<Bytes> = chunks
                        .iter()
                        .map(|chunk| {
                            let payload = json!({ "choices": [{ "delta": { "content": chunk } }] })
                                .to_string();
                            Bytes::from(format!("data: {payload}\n\n"))
                        })
                        .chain(std::iter::once(Bytes::from("data: [DONE]\n\n")))
                        .collect();

                    (
                        [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                        axum::body::Body::from_stream(futures_util::stream::iter(
                            frames.into_iter().map(Ok::<_, std::io::Error>),
                        )),
                    )
                        .into_response()
                }
            }),
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (base_url, captured)
    }

    #[tokio::test]
    async fn subscription_grounds_chat_with_related_memories_and_chunks() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();

        let embedder = crate::embeddings::FakeEmbedder::by_keyword(&["apple", "banana"]);
        let embedder: Arc<dyn Embedder> = Arc::new(embedder);

        {
            let conn = db.get().unwrap();

            let store = |slot: usize| {
                let mut vector = vec![0.0f32; db::EMBEDDING_DIM];
                vector[slot] = 1.0;
                vector
            };
            for (content, slot) in [("apple memory", 0usize), ("banana memory", 1usize)] {
                conn.execute(
                    "INSERT INTO memories (embedding, content) VALUES (?1, ?2)",
                    rusqlite::params![db::embedding_to_blob(&store(slot)), content],
                )
                .unwrap();
            }

            // Persisted conversation with an attached file: chat 7's chunks
            // must ground chat 7 and only chat 7.
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (7, 'attached chat', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 7, 'USER', 'here is my file', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id, original_name, file_name, mime_type, size, kind,
                                    status, processed_at, created_at, message_id)
                 VALUES (1, 'notes.txt', 'notes.txt', 'text/plain', 1, 'TEXT',
                         'PROCESSED', '0', '0', 1)",
                [],
            )
            .unwrap();
            for (content, slot) in [("apple chunk", 0usize), ("banana chunk", 1usize)] {
                conn.execute(
                    "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, 1)",
                    rusqlite::params![db::embedding_to_blob(&store(slot)), content],
                )
                .unwrap();
            }
        }

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["grounded"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let schema = upload_context(db, crate::storage::Storage::memory().unwrap(), embedder);
        let mut stream =
            schema.execute_stream(subscription_request(Some(7), "tell me about apples"));

        let mut saw_done = false;
        while let Some(response) = stream.next().await {
            let payload = payload_item(response);
            if payload["conversation"]["data"]["done"].as_bool() == Some(true) {
                saw_done = true;
            }
        }
        assert!(saw_done);

        let request = captured.lock().unwrap().clone().unwrap();
        let messages = request["messages"].as_array().unwrap();
        let contents: Vec<&str> = messages
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default())
            .collect();

        // Only the apple rows clear the 0.5 threshold; both system messages
        // ride between the history and the user turn.
        assert_eq!(
            contents,
            vec![
                "here is my file",
                "Here are some related memories: apple memory",
                "Here are some related file chunks: apple chunk",
                "tell me about apples",
            ]
        );
        assert_eq!(messages[1]["role"], json!("system"));
        assert_eq!(messages[2]["role"], json!("system"));
        assert_eq!(messages[3]["role"], json!("user"));
    }

    #[tokio::test]
    async fn subscription_skips_grounding_when_nothing_matches() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["plain"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db, crate::storage::Storage::memory().unwrap(), embedder);
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        while stream.next().await.is_some() {}

        let request = captured.lock().unwrap().clone().unwrap();
        let messages = request["messages"].as_array().unwrap();
        assert_eq!(
            messages.len(),
            1,
            "no system context when retrieval is empty"
        );
        assert_eq!(messages[0]["role"], json!("user"));
        assert_eq!(messages[0]["content"], json!("hi"));
    }

    #[tokio::test]
    async fn file_ids_attach_to_the_user_message_and_ground_the_turn() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();

        // Two uploads (as the composer would create on send) plus a decoy.
        let first = crate::files::store_upload(
            &db,
            &storage,
            b"attachment one".to_vec(),
            "one.txt",
            "text/plain",
        )
        .await
        .unwrap();
        let second = crate::files::store_upload(
            &db,
            &storage,
            b"attachment two".to_vec(),
            "two.txt",
            "text/plain",
        )
        .await
        .unwrap();
        let _decoy = crate::files::store_upload(
            &db,
            &storage,
            b"not part of this send".to_vec(),
            "decoy.txt",
            "text/plain",
        )
        .await
        .unwrap();

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["ok"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        let mut stream = schema.execute_stream(subscription_request_with_files(
            None,
            "what did I attach?",
            &[first.id, second.id],
        ));
        while stream.next().await.is_some() {}

        // Both files ended up on the persisted user message.
        let conn = db.get().unwrap();
        let user_message_id: i64 = conn
            .query_row(
                "SELECT id FROM messages WHERE role = 'USER' ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let linked: Vec<String> = crate::files::files_for_message(&conn, user_message_id)
            .unwrap()
            .into_iter()
            .map(|row| row.original_name)
            .collect();
        assert_eq!(linked, vec!["one.txt".to_string(), "two.txt".to_string()]);

        // The decoy stays unattached.
        let orphans: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE message_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphans, 1);

        // History re-renders the chips: Message.files carries both.
        let response = schema
            .execute(
                "{ conversation(conversationId: 1) { messages { role files { originalName } } } }"
                    .to_string(),
            )
            .await
            .into_result()
            .unwrap();
        let data = serde_json::to_value(&response.data).unwrap();
        let user_message = data["conversation"]["messages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["role"] == json!("USER"))
            .unwrap();
        assert_eq!(
            user_message["files"].as_array().unwrap().len(),
            2,
            "chips persist on the user message: {user_message}"
        );

        // The provider saw the same two files' turn (capturing mock drew no
        // chunks, so grounding contributed nothing — verified separately).
        let request = captured.lock().unwrap().clone().unwrap();
        let contents: Vec<&str> = request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default())
            .collect();
        assert!(contents.contains(&"what did I attach?"));
    }

    #[tokio::test]
    async fn file_only_send_synthesizes_the_prompt_and_titles_from_the_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let _storage = crate::storage::Storage::memory().unwrap();

        // A processed attachment whose chunks will ground via the head path.
        let storage = crate::storage::Storage::memory().unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let file = crate::files::store_upload(
            &db,
            &storage,
            b"the marble archive opens at dusk only".to_vec(),
            "archive-notes.md",
            "text/markdown",
        )
        .await
        .unwrap();
        // Run the inline pipeline so the chunk exists for the head retrieval.
        crate::files::process_uploaded_file(
            &crate::files::PipelineDeps {
                db: db.clone(),
                storage: std::sync::Arc::new(storage.clone()),
                embedder: embedder.clone(),
            },
            file.id,
        )
        .await
        .unwrap();

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["read it"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        // File-only send: empty message + the upload's id.
        let mut stream =
            schema.execute_stream(subscription_request_with_files(None, "", &[file.id]));
        while stream.next().await.is_some() {}

        let request = captured.lock().unwrap().clone().unwrap();
        let messages = request["messages"].as_array().unwrap();
        let contents: Vec<&str> = messages
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default())
            .collect();

        // The provider receives the synthesized instruction plus the chat's
        // opening chunks (no similarity filter); no memories system message.
        assert_eq!(
            contents,
            vec![
                "Here are some related file chunks: the marble archive opens at dusk only",
                "Please read the attached file(s) and respond.",
            ]
        );

        // The persisted user bubble keeps its empty text; the thread takes
        // its title from the file.
        let conn = db.get().unwrap();
        let (user_content, title): (String, String) = conn
            .query_row(
                "SELECT (SELECT content FROM messages WHERE role = 'USER' ORDER BY id DESC LIMIT 1),
                        (SELECT title FROM conversations ORDER BY id DESC LIMIT 1)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(user_content, "");
        assert_eq!(title, "archive-notes.md");
    }

    /// Creates a persisted message owned by a real conversation row (files'
    /// message_id is FK-checked) and returns its id.
    fn seed_message(pool: &Db, conversation_id: i64) -> i64 {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at)
         VALUES (?1, 'chat', '0', '0')
         ON CONFLICT(id) DO NOTHING",
            [conversation_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES (?1, 'USER', 'history', '0')",
            [conversation_id],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[tokio::test]
    async fn relinking_is_idempotent_and_ignores_claimed_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();

        let file =
            crate::files::store_upload(&db, &storage, b"content".to_vec(), "one.txt", "text/plain")
                .await
                .unwrap();

        {
            let conn = db.get().unwrap();
            let message_one = seed_message(&db, 1);
            let message_two = seed_message(&db, 2);

            let first = crate::files::link_to_message(&conn, &[file.id], message_one).unwrap();
            assert_eq!(first.len(), 1);

            // Same ids again: no-op. Another message can't steal the
            // attachment (message_id IS NULL guard).
            let again = crate::files::link_to_message(&conn, &[file.id], message_one).unwrap();
            assert!(again.is_empty());
            let stolen = crate::files::link_to_message(&conn, &[file.id], message_two).unwrap();
            assert!(stolen.is_empty());

            let owner: i64 = conn
                .query_row(
                    "SELECT message_id FROM files WHERE id = ?1",
                    [file.id],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(owner, message_one);
        }
    }

    #[tokio::test]
    async fn orphan_gc_removes_uploads_never_attached_to_a_message() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();

        let orphan = crate::files::store_upload(
            &db,
            &storage,
            b"never sent".to_vec(),
            "orphan.txt",
            "text/plain",
        )
        .await
        .unwrap();
        let attached =
            crate::files::store_upload(&db, &storage, b"kept".to_vec(), "kept.txt", "text/plain")
                .await
                .unwrap();
        {
            let message_id = seed_message(&db, 1);
            let conn = db.get().unwrap();
            crate::files::link_to_message(&conn, &[attached.id], message_id).unwrap();
        }

        let removed = crate::files::gc_orphan_uploads(&db, &storage).await;
        assert_eq!(removed, 1);

        let conn = db.get().unwrap();
        let remaining: Vec<String> = {
            let mut stmt = conn.prepare("SELECT file_name FROM files").unwrap();
            stmt.query_map([], |r| r.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(remaining, vec![attached.file_name.clone()]);
        assert!(storage.read(&orphan.file_name).await.is_err());
        assert!(storage.read(&attached.file_name).await.is_ok());
    }

    #[tokio::test]
    async fn files_query_returns_rows_in_upload_order() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        {
            let conn = db.get().unwrap();
            for (name, file_name) in [("first.md", "a.md"), ("second.txt", "b.txt")] {
                conn.execute(
                    "INSERT INTO files (original_name, file_name, mime_type, size, kind, status, created_at)
                     VALUES (?1, ?2, 'text/plain', 4, 'TEXT', 'PROCESSED', '0')",
                    rusqlite::params![name, file_name],
                )
                .unwrap();
            }
        }

        let schema = schema_with(db);
        let response = schema
            .execute("{ files { originalName status type createdAt } }")
            .await
            .into_result()
            .unwrap();
        let data = serde_json::to_value(&response.data).unwrap();
        let files = data["files"].as_array().unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0]["originalName"], json!("first.md"));
        assert_eq!(files[0]["status"], json!("PROCESSED"));
        assert_eq!(files[0]["type"], json!("TEXT"));
        assert_eq!(files[1]["originalName"], json!("second.txt"));
    }
}
