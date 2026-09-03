//! Read side of the schema.

use async_graphql::{Context, Object};
use rusqlite::OptionalExtension;

use crate::db::Db;
use crate::files;

use super::chat::GqlConversation;
use super::files::GqlFileUpload;
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
