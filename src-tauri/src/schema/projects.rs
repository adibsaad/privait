//! Project domain: the workspace container that groups chats, carries
//! per-project instructions, and holds a knowledge folder grounded into its
//! chats.

use async_graphql::{Context, Object, ID};
use rusqlite::OptionalExtension;

use crate::db::Db;

use super::chat::GqlConversation;

/// A project container: name, per-project instructions, and its chats.
/// Knowledge files live on the files table (project_id scoping), not here.
#[derive(Debug, Clone)]
pub struct GqlProject {
    pub id: i64,
    pub name: String,
    pub instructions: String,
    pub created_at: String,
    pub updated_at: String,
}

const PROJECT_COLUMNS: &str = "id, name, instructions, created_at, updated_at";

fn project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GqlProject> {
    Ok(GqlProject {
        id: row.get(0)?,
        name: row.get(1)?,
        instructions: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub(crate) fn get_project(
    conn: &rusqlite::Connection,
    project_id: i64,
) -> rusqlite::Result<Option<GqlProject>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"
    ))?;
    stmt.query_row([project_id], project_from_row).optional()
}

pub(crate) fn list_projects(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<GqlProject>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PROJECT_COLUMNS} FROM projects ORDER BY created_at ASC, id ASC"
    ))?;
    let rows = stmt.query_map([], project_from_row)?;
    rows.collect()
}

#[Object(name = "Project")]
impl GqlProject {
    async fn id(&self) -> ID {
        ID(self.id.to_string())
    }

    async fn name(&self) -> &str {
        &self.name
    }

    async fn instructions(&self) -> &str {
        &self.instructions
    }

    async fn created_at(&self) -> &str {
        &self.created_at
    }

    async fn updated_at(&self) -> &str {
        &self.updated_at
    }

    /// This project's live chats, newest first (archive state lives on the
    /// conversation rows; archived chats stay out of the project stat here).
    async fn conversations(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<GqlConversation>> {
        let db = ctx.data::<Db>()?;
        let conn = db.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, archived, project_id FROM conversations
             WHERE project_id = ?1 AND archived = 0
             ORDER BY updated_at DESC, id DESC",
        )?;
        let rows = stmt
            .query_map([self.id], |row| {
                Ok(GqlConversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    archived: row.get(2)?,
                    project_id: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}
