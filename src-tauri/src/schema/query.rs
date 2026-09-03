//! Read side of the schema.

use async_graphql::{Context, Object};
use rusqlite::OptionalExtension;

use crate::db::Db;
use crate::files;

use super::chat::GqlConversation;
use super::files::GqlFileUpload;
use super::memories::{GqlMemory, GqlSearchResult};
use super::projects::{self, get_project, GqlProject};
use super::settings::GqlSettings;
use super::user::LocalUser;

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

        let mut stmt = conn.prepare(
            "SELECT id, title, archived, project_id FROM conversations ORDER BY id ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(GqlConversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    archived: row.get::<_, i64>(2)? != 0,
                    project_id: row.get(3)?,
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
                "SELECT id, title, archived, project_id FROM conversations WHERE id = ?1",
                [conversation_id],
                |row| {
                    Ok(GqlConversation {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        archived: row.get::<_, i64>(2)? != 0,
                        project_id: row.get(3)?,
                    })
                },
            )
            .optional()?)
    }

    /// All projects, oldest first — the sidebar's project groups.
    async fn projects(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<GqlProject>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        Ok(projects::list_projects(&conn)?)
    }

    async fn project(
        &self,
        ctx: &Context<'_>,
        project_id: i64,
    ) -> async_graphql::Result<Option<GqlProject>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        Ok(get_project(&conn, project_id)?)
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

    /// All stored memories, newest first. Every memory is visible here —
    /// distilled ones carry the chat that produced them.
    async fn memories(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<GqlMemory>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        Ok(crate::memories::list_memories(&conn)?
            .into_iter()
            .map(GqlMemory::from)
            .collect())
    }

    /// Full-text search over transcripts: project-scoped by default (the
    /// project of the conversation asking), `wholeVault` widens to all
    /// chats, incognito chats always excluded. Tool-loop exposure lands in
    /// 0004.
    async fn search_history(
        &self,
        ctx: &Context<'_>,
        query: String,
        conversation_id: i64,
        whole_vault: Option<bool>,
    ) -> async_graphql::Result<Vec<GqlSearchResult>> {
        let db = ctx.data::<Db>()?;
        Ok(crate::retrieval::search_history(
            db,
            &query,
            conversation_id,
            whole_vault.unwrap_or(false),
        )?
        .into_iter()
        .map(GqlSearchResult::from)
        .collect())
    }
}
