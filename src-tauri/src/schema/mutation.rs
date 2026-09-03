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
use super::memories::{
    GqlMemory, MemoryUpdateInput, MutationCreateMemoryResult, MutationCreateMemorySuccess,
    MutationDeleteMemoryResult, MutationDeleteMemorySuccess, MutationUpdateMemoryResult,
    MutationUpdateMemorySuccess,
};
use super::projects::{get_project, GqlProject};
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

// Project CRUD surface (0002): every mutation follows the same success
// shape — `{ data: true }` — except createProject, which returns the row.

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationCreateProjectSuccess")]
pub struct MutationCreateProjectSuccess {
    pub data: GqlProject,
}

#[derive(Union)]
pub enum MutationCreateProjectResult {
    Error(GqlError),
    MutationCreateProjectSuccess(MutationCreateProjectSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationRenameProjectSuccess")]
pub struct MutationRenameProjectSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationRenameProjectResult {
    Error(GqlError),
    MutationRenameProjectSuccess(MutationRenameProjectSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationUpdateProjectInstructionsSuccess")]
pub struct MutationUpdateProjectInstructionsSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationUpdateProjectInstructionsResult {
    Error(GqlError),
    MutationUpdateProjectInstructionsSuccess(MutationUpdateProjectInstructionsSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationDeleteProjectSuccess")]
pub struct MutationDeleteProjectSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationDeleteProjectResult {
    Error(GqlError),
    MutationDeleteProjectSuccess(MutationDeleteProjectSuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationAddProjectKnowledgeSuccess")]
pub struct MutationAddProjectKnowledgeSuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationAddProjectKnowledgeResult {
    Error(GqlError),
    MutationAddProjectKnowledgeSuccess(MutationAddProjectKnowledgeSuccess),
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

    /// Creates a project: name + optional instructions. Local-only container
    /// for chats and knowledge.
    async fn create_project(
        &self,
        ctx: &Context<'_>,
        name: String,
        instructions: Option<String>,
    ) -> MutationCreateProjectResult {
        let name = name.trim();
        if name.is_empty() {
            return MutationCreateProjectResult::Error(GqlError::new(
                "Project name must not be empty",
            ));
        }

        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationCreateProjectResult::Error(GqlError::new(err.message)),
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => return MutationCreateProjectResult::Error(GqlError::new(err.to_string())),
        };

        let now = chrono::Utc::now().to_rfc3339();
        match conn.execute(
            "INSERT INTO projects (name, instructions, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            rusqlite::params![name, instructions.unwrap_or_default(), now],
        ) {
            Ok(_) => {
                let id = conn.last_insert_rowid();
                match get_project(&conn, id) {
                    Ok(Some(project)) => {
                        MutationCreateProjectResult::MutationCreateProjectSuccess(
                            MutationCreateProjectSuccess { data: project },
                        )
                    }
                    Ok(None) => MutationCreateProjectResult::Error(GqlError::new(
                        "project row vanished after insert",
                    )),
                    Err(err) => {
                        MutationCreateProjectResult::Error(GqlError::new(err.to_string()))
                    }
                }
            }
            Err(err) => MutationCreateProjectResult::Error(GqlError::new(err.to_string())),
        }
    }

    async fn rename_project(
        &self,
        ctx: &Context<'_>,
        project_id: i64,
        name: String,
    ) -> MutationRenameProjectResult {
        let name = name.trim();
        if name.is_empty() {
            return MutationRenameProjectResult::Error(GqlError::new(
                "Project name must not be empty",
            ));
        }

        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationRenameProjectResult::Error(GqlError::new(err.message)),
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => return MutationRenameProjectResult::Error(GqlError::new(err.to_string())),
        };

        if let Some(err) = project_error(&conn, project_id) {
            return MutationRenameProjectResult::Error(err);
        }

        match conn.execute(
            "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, chrono::Utc::now().to_rfc3339(), project_id],
        ) {
            Ok(_) => MutationRenameProjectResult::MutationRenameProjectSuccess(
                MutationRenameProjectSuccess { data: true },
            ),
            Err(err) => MutationRenameProjectResult::Error(GqlError::new(err.to_string())),
        }
    }

    /// Sets the project's standing instructions, applied to every chat in
    /// the project.
    async fn update_project_instructions(
        &self,
        ctx: &Context<'_>,
        project_id: i64,
        instructions: String,
    ) -> MutationUpdateProjectInstructionsResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => {
                return MutationUpdateProjectInstructionsResult::Error(GqlError::new(err.message))
            }
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => {
                return MutationUpdateProjectInstructionsResult::Error(GqlError::new(err.to_string()))
            }
        };

        if let Some(err) = project_error(&conn, project_id) {
            return MutationUpdateProjectInstructionsResult::Error(err);
        }

        match conn.execute(
            "UPDATE projects SET instructions = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![instructions, chrono::Utc::now().to_rfc3339(), project_id],
        ) {
            Ok(_) => MutationUpdateProjectInstructionsResult::MutationUpdateProjectInstructionsSuccess(
                MutationUpdateProjectInstructionsSuccess { data: true },
            ),
            Err(err) => MutationUpdateProjectInstructionsResult::Error(GqlError::new(err.to_string())),
        }
    }

    /// Deletes a project: its chats survive as plain chats (project_id goes
    /// NULL) and its knowledge files are removed with their chunks and bytes.
    async fn delete_project(
        &self,
        ctx: &Context<'_>,
        project_id: i64,
    ) -> MutationDeleteProjectResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationDeleteProjectResult::Error(GqlError::new(err.message)),
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => return MutationDeleteProjectResult::Error(GqlError::new(err.to_string())),
        };

        if let Some(err) = project_error(&conn, project_id) {
            return MutationDeleteProjectResult::Error(err);
        }

        match files::drop_project_files_db(&conn, project_id) {
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
            Err(err) => return MutationDeleteProjectResult::Error(GqlError::new(err.to_string())),
        }

        match conn.execute("DELETE FROM projects WHERE id = ?1", [project_id]) {
            Ok(_) => MutationDeleteProjectResult::MutationDeleteProjectSuccess(
                MutationDeleteProjectSuccess { data: true },
            ),
            Err(err) => MutationDeleteProjectResult::Error(GqlError::new(err.to_string())),
        }
    }

    /// Claims uploaded files into the project's knowledge folder (the same
    /// inline extract→chunk→embed upload path as chat attachments). Only
    /// unattached uploads are claimed.
    async fn add_project_knowledge(
        &self,
        ctx: &Context<'_>,
        project_id: i64,
        file_ids: Vec<i64>,
    ) -> MutationAddProjectKnowledgeResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => {
                return MutationAddProjectKnowledgeResult::Error(GqlError::new(err.message))
            }
        };
        let conn = match db.get() {
            Ok(conn) => conn,
            Err(err) => {
                return MutationAddProjectKnowledgeResult::Error(GqlError::new(err.to_string()))
            }
        };

        if let Some(err) = project_error(&conn, project_id) {
            return MutationAddProjectKnowledgeResult::Error(err);
        }

        match files::claim_to_project(&conn, &file_ids, project_id) {
            Ok(_) => MutationAddProjectKnowledgeResult::MutationAddProjectKnowledgeSuccess(
                MutationAddProjectKnowledgeSuccess { data: true },
            ),
            Err(err) => MutationAddProjectKnowledgeResult::Error(GqlError::new(err.to_string())),
        }
    }

    /// Writes a memory by hand — the explicit path (the automatic one is the
    /// post-chat distillation job). Visible in the Memories UI immediately.
    async fn create_memory(
        &self,
        ctx: &Context<'_>,
        content: String,
    ) -> MutationCreateMemoryResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationCreateMemoryResult::Error(GqlError::new(err.message)),
        };
        let embedder = match ctx.data::<Arc<dyn crate::embeddings::Embedder>>() {
            Ok(embedder) => embedder.clone(),
            Err(err) => return MutationCreateMemoryResult::Error(GqlError::new(err.message)),
        };

        match crate::memories::write_memory(
            db,
            embedder.as_ref(),
            &content,
            crate::memories::MemorySource::Manual,
            None,
        )
        .await
        {
            Ok(id) => {
                let conn = match db.get() {
                    Ok(conn) => conn,
                    Err(err) => return MutationCreateMemoryResult::Error(GqlError::new(err.to_string())),
                };
                match crate::memories::get_memory(&conn, id) {
                    Ok(Some(memory)) => {
                        MutationCreateMemoryResult::MutationCreateMemorySuccess(
                            MutationCreateMemorySuccess {
                                data: GqlMemory::from(memory),
                            },
                        )
                    }
                    _ => MutationCreateMemoryResult::Error(GqlError::new("memory vanished")),
                }
            }
            Err(err) => MutationCreateMemoryResult::Error(GqlError::new(err)),
        }
    }

    /// Rewrites a memory; the vector re-embeds (same id).
    async fn update_memory(
        &self,
        ctx: &Context<'_>,
        input: MemoryUpdateInput,
    ) -> MutationUpdateMemoryResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationUpdateMemoryResult::Error(GqlError::new(err.message)),
        };
        let embedder = match ctx.data::<Arc<dyn crate::embeddings::Embedder>>() {
            Ok(embedder) => embedder.clone(),
            Err(err) => return MutationUpdateMemoryResult::Error(GqlError::new(err.message)),
        };
        match crate::memories::update_memory(db, embedder.as_ref(), input.id, &input.content).await
        {
            Ok(_) => MutationUpdateMemoryResult::MutationUpdateMemorySuccess(
                MutationUpdateMemorySuccess { data: true },
            ),
            Err(err) => MutationUpdateMemoryResult::Error(GqlError::new(err)),
        }
    }

    async fn delete_memory(
        &self,
        ctx: &Context<'_>,
        memory_id: i64,
    ) -> MutationDeleteMemoryResult {
        let db = match ctx.data::<Db>() {
            Ok(db) => db,
            Err(err) => return MutationDeleteMemoryResult::Error(GqlError::new(err.message)),
        };
        match crate::memories::delete_memory(db, memory_id).await {
            Ok(_) => MutationDeleteMemoryResult::MutationDeleteMemorySuccess(
                MutationDeleteMemorySuccess { data: true },
            ),
            Err(err) => MutationDeleteMemoryResult::Error(GqlError::new(err)),
        }
    }

    /// Incognito per chat: no memory reads, no distillation writes, no
    /// search hits. Existing memories are untouched.
    async fn set_conversation_incognito(
        &self,
        ctx: &Context<'_>,
        conversation_id: i64,
        incognito: bool,
    ) -> async_graphql::Result<bool> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        conn.execute(
            "UPDATE conversations SET incognito = ?1 WHERE id = ?2",
            rusqlite::params![incognito as i64, conversation_id],
        )?;
        Ok(true)
    }
}

/// Shapes a missing-project failure the same way `conversation_error` does.
fn project_error(conn: &Connection, project_id: i64) -> Option<GqlError> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM projects WHERE id = ?1",
            [project_id],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten();
    if exists.is_none() {
        Some(GqlError::new("Project not found"))
    } else {
        None
    }
}
