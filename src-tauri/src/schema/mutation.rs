//! Write side of the schema: conversation lifecycle, settings, uploads,
//! and the run stop.

use std::io::Read;
use std::sync::Arc;

use async_graphql::{Context, InputObject, Object, SimpleObject, Union, Upload};
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::{self, Db};
use crate::embeddings::Embedder;
use crate::files;
use crate::runs::RunRegistry;
use crate::storage::Storage;

use super::files::GqlFileUpload;
use super::settings::{GqlSettings, SettingsInput};
use super::GqlError;

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

        // The uploads belong to the chat: drop their vectors and storage
        // bytes too. The files rows themselves cascade through the messages
        // when the conversation goes.
        match files::drop_conversation_files_db(&conn, conversation_id) {
            Ok(storage_keys) => {
                if let Some(storage) = match ctx.data::<Option<Arc<Storage>>>() {
                    Ok(Some(storage)) => Some(storage.clone()),
                    _ => None,
                } {
                    for key in storage_keys {
                        if let Err(err) = storage.delete(&key).await {
                            eprintln!("[privait] storage delete failed for {key}: {err}");
                        }
                    }
                }
            }
            Err(err) => {
                return MutationDeleteConversationResult::Error(GqlError::new(err.to_string()))
            }
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

    /// Server-side half of the stop button: cancels the conversation's
    /// in-flight reply; the pump task then persists whatever streamed so
    /// far. `false` when no reply is in flight (late stop press).
    async fn stop_run(&self, ctx: &Context<'_>, conversation_id: i64) -> bool {
        match ctx.data::<Arc<RunRegistry>>() {
            Ok(runs) => runs.cancel(conversation_id),
            Err(_) => false,
        }
    }
}
