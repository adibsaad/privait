use std::{path::Path, sync::Once};

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{Connection, OptionalExtension};

/// Content database connection pool. One shared `privait.db` file.
pub type Db = Pool<SqliteConnectionManager>;

/// Embedding width shared by the vec0 tables and the embedder (bge-small).
pub const EMBEDDING_DIM: usize = 384;

static REGISTER_VEC: Once = Once::new();

// Statically linked by build.rs from the vendored sqlite-vec amalgamation
// (SQLITE_CORE); registering it as an auto-extension loads `vec0` into every
// new connection, including pooled ones.
unsafe extern "C" {
    fn sqlite3_vec_init(
        db: *mut rusqlite::ffi::sqlite3,
        err_msg: *mut *mut std::os::raw::c_char,
        api: *const rusqlite::ffi::sqlite3_api_routines,
    ) -> std::os::raw::c_int;
}

fn register_vec_extension() {
    REGISTER_VEC.call_once(|| {
        type EntryFn = unsafe extern "C" fn(
            *mut rusqlite::ffi::sqlite3,
            *mut *mut std::os::raw::c_char,
            *const rusqlite::ffi::sqlite3_api_routines,
        ) -> std::os::raw::c_int;

        // SAFETY: `sqlite3_vec_init` is compiled into this binary by build.rs
        // and matches the `sqlite3_auto_extension` entry-point signature.
        let init: EntryFn = unsafe { std::mem::transmute(sqlite3_vec_init as *const ()) };
        let code = unsafe { rusqlite::ffi::sqlite3_auto_extension(Some(init)) };
        assert_eq!(
            code,
            rusqlite::ffi::SQLITE_OK,
            "failed to register the sqlite-vec extension"
        );
    });
}

/// Opens (or creates) the content database in `dir` and applies migrations.
pub fn init(dir: &Path) -> Result<Db, Box<dyn std::error::Error + Send + Sync>> {
    register_vec_extension();
    std::fs::create_dir_all(dir)?;

    let manager = SqliteConnectionManager::file(dir.join("privait.db")).with_init(|conn| {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )
    });
    let pool = Pool::builder().max_size(4).build(manager)?;

    let conn = pool.get()?;
    migrate(&conn)?;
    Ok(pool)
}

const MIGRATIONS: &[&str] = &[
    // v1 — initial schema (single user, no soft deletes)
    "CREATE TABLE conversations (
        id          INTEGER PRIMARY KEY,
        title       TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    CREATE TABLE messages (
        id               INTEGER PRIMARY KEY,
        conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role             TEXT NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM')),
        content          TEXT NOT NULL,
        created_at       TEXT NOT NULL
    );
    CREATE TABLE files (
        id             INTEGER PRIMARY KEY,
        original_name  TEXT NOT NULL,
        file_name      TEXT NOT NULL UNIQUE,
        mime_type      TEXT NOT NULL,
        size           INTEGER NOT NULL,
        kind           TEXT NOT NULL CHECK (kind IN ('PDF', 'TEXT')),
        status         TEXT NOT NULL CHECK (status IN ('UPLOADED', 'PROCESSED')),
        processed_at   TEXT,
        created_at     TEXT NOT NULL
    );
    CREATE TABLE settings (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE file_chunks USING vec0(
        embedding float[384] distance_metric=cosine,
        +content TEXT,
        +file_id INTEGER
    );
CREATE VIRTUAL TABLE memories USING vec0(
        embedding float[384] distance_metric=cosine,
        +content TEXT
    );",
    // v2 — thread archive state (rename/archive are persisted from M2 on)
    "ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;",
    // v3 — files attach to the user message that carries them (per-chat
    // grounding scopes through messages; chips re-render from this link)
    "ALTER TABLE files ADD COLUMN message_id INTEGER NULL REFERENCES messages(id) ON DELETE CASCADE;
     CREATE INDEX idx_files_message ON files(message_id);",
    // v4 — projects: the workspace container. Chats keep working without one
    // (SET NULL on project delete); knowledge files are project-scoped
    // attachments (CASCADE on project delete).
    "CREATE TABLE projects (
        id            INTEGER PRIMARY KEY,
        name          TEXT NOT NULL,
        instructions  TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
     );
     ALTER TABLE conversations ADD COLUMN project_id INTEGER NULL REFERENCES projects(id) ON DELETE SET NULL;
     CREATE INDEX idx_conversations_project ON conversations(project_id);
     ALTER TABLE files ADD COLUMN project_id INTEGER NULL REFERENCES projects(id) ON DELETE CASCADE;
     CREATE INDEX idx_files_project ON files(project_id);",
];

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    for (index, sql) in MIGRATIONS.iter().enumerate() {
        let target = (index + 1) as i64;
        if version < target {
            conn.execute_batch(sql)?;
            conn.pragma_update(None, "user_version", target)?;
        }
    }

    Ok(())
}

/// Serializes an embedding as a little-endian f32 blob for sqlite-vec.
pub fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|v| v.to_le_bytes()).collect()
}

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use tempfile::TempDir;

    fn temp_db() -> (TempDir, Db) {
        let dir = TempDir::new().unwrap();
        let pool = init(dir.path()).unwrap();
        (dir, pool)
    }

    #[test]
    fn migrations_are_idempotent() {
        let (_dir, pool) = temp_db();
        let conn = pool.get().unwrap();

        let first: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(first, MIGRATIONS.len() as i64);

        migrate(&conn).unwrap();
        let second: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(second, first);
    }

    #[test]
    fn vec0_knn_returns_nearest_with_aux_columns() {
        let (_dir, pool) = temp_db();
        let conn = pool.get().unwrap();

        let sparse = |lead: f32, second: f32| {
            let mut embedding = vec![0.0f32; 384];
            embedding[0] = lead;
            embedding[1] = second;
            embedding_to_blob(&embedding)
        };

        // (1,0,…) should match (1,0,…) best under cosine, (0,1,…) worst.
        for (content, vector) in [
            ("a", sparse(1.0, 0.0)),
            ("b", sparse(0.9, 0.1)),
            ("c", sparse(0.0, 1.0)),
        ] {
            conn.execute(
                "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, 7)",
                rusqlite::params![vector, content],
            )
            .unwrap();
        }

        let query_blob = sparse(1.0, 0.0);
        let mut stmt = conn
            .prepare(
                "SELECT rowid, distance, content, file_id FROM file_chunks
                 WHERE embedding MATCH ?1 ORDER BY distance LIMIT 2",
            )
            .unwrap();
        let results: Vec<(i64, f64, String, i64)> = stmt
            .query_map(rusqlite::params![query_blob], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].2, "a");
        assert_eq!(results[1].2, "b");
        assert!(results[0].1 < results[1].1);
        assert_eq!(results[0].3, 7);
    }

    #[test]
    fn vec0_deletes_by_aux_column() {
        let (_dir, pool) = temp_db();
        let conn = pool.get().unwrap();

        let embedding = embedding_to_blob(&vec![1.0f32; 384]);

        conn.execute(
            "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, 'a', 1)",
            rusqlite::params![embedding],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, 'b', 2)",
            rusqlite::params![embedding],
        )
        .unwrap();

        conn.execute("DELETE FROM file_chunks WHERE file_id = 1", [])
            .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM file_chunks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn settings_round_trip() {
        let (_dir, pool) = temp_db();
        let conn = pool.get().unwrap();

        assert_eq!(get_setting(&conn, "provider.baseUrl").unwrap(), None);

        set_setting(&conn, "provider.baseUrl", "http://localhost:11434/v1").unwrap();
        set_setting(&conn, "provider.apiKey", "sk-test").unwrap();
        set_setting(&conn, "provider.baseUrl", "http://127.0.0.1:11434/v1").unwrap();

        assert_eq!(
            get_setting(&conn, "provider.baseUrl").unwrap().as_deref(),
            Some("http://127.0.0.1:11434/v1")
        );
    }

    #[test]
    fn deleting_conversation_cascades_to_messages() {
        let (_dir, pool) = temp_db();
        let conn = pool.get().unwrap();

        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (1, 't', '0', '0')",
            [],
        )
        .unwrap();
        for role in ["USER", "ASSISTANT"] {
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (NULL, 1, ?1, 'hello', '0')",
                [role],
            )
            .unwrap();
        }

        conn.execute("DELETE FROM conversations WHERE id = 1", [])
            .unwrap();

        let messages: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))
            .unwrap();
        assert_eq!(messages, 0, "messages must cascade with their conversation");
    }

    #[test]
    fn cosine_knn_distances_support_the_half_similarity_threshold() {
        let (_dir, pool) = temp_db();
        let conn = pool.get().unwrap();

        // 384-dim unit vectors at distinct angles from the query (1,0,…):
        // "keep" at 0° (cosine distance 0, similarity 1), "borderline" at 60°
        // (distance 0.5, similarity 0.5), "drop" at 90° (distance 1) —
        // mirroring the M3 retrieval filter (similarity ≥ 0.5).
        let sparse = |lead: f32, second: f32| {
            let mut embedding = vec![0.0f32; 384];
            embedding[0] = lead;
            embedding[1] = second;
            embedding_to_blob(&embedding)
        };

        for (content, vector) in [
            ("keep", sparse(1.0, 0.0)),
            ("borderline", sparse(0.5, 0.75f32.sqrt())),
            ("drop", sparse(0.0, 1.0)),
        ] {
            conn.execute(
                "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, 1)",
                rusqlite::params![vector, content],
            )
            .unwrap();
        }

        let query_blob = sparse(1.0, 0.0);
        let mut stmt = conn
            .prepare(
                "SELECT content, distance FROM file_chunks
                 WHERE embedding MATCH ?1 ORDER BY distance LIMIT 4",
            )
            .unwrap();
        let knn: Vec<(String, f64)> = stmt
            .query_map(rusqlite::params![query_blob], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();

        // Similarity = 1 - distance: "keep" and "borderline" sit inside the
        // inclusive 0.5 edge, "drop" fails it.
        let above_threshold: Vec<&str> = knn
            .iter()
            .filter(|(_, distance)| (1.0 - *distance) >= 0.5 - f64::EPSILON)
            .map(|(content, _)| content.as_str())
            .collect();

        assert!(above_threshold.contains(&"keep"));
        assert!(above_threshold.contains(&"borderline"));
        assert!(!above_threshold.contains(&"drop"));
        assert_eq!(knn.len(), 3);
    }

    #[test]
    fn vec0_knn_applies_the_distance_filter_in_sql() {
        let (_dir, pool) = temp_db();
        let conn = pool.get().unwrap();

        // Unit vectors at exact angles from the query (1,0,…), in stored
        // order unrelated to rank: "far" (0.6) ranks before "hidden" (0.3).
        // cosine distance = 1 - cos θ, so unit(lead) has distance 1 - lead.
        let unit = |lead: f32| {
            let mut embedding = vec![0.0f32; 384];
            embedding[0] = lead;
            embedding[1] = (1.0 - lead * lead).sqrt();
            embedding_to_blob(&embedding)
        };

        for (content, lead) in [
            ("far", 0.4f32),     // distance 0.6 — fails
            ("borderline", 0.5), // distance 0.5 — inclusive edge, passes
            ("orthogonal", 0.0), // distance 1.0 — fails
            ("exact", 1.0),      // distance 0.0
            ("hidden", 0.7),     // distance 0.3 — passes, rank 4 of 5
        ] {
            conn.execute(
                "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, 1)",
                rusqlite::params![unit(lead), content],
            )
            .unwrap();
        }

        let query_blob = unit(1.0);

        // Literal threshold in the KNN query's WHERE: SQLite core filters
        // per-row (vec0 leaves distance constraints unconsumed). Strict
        // comparison sidesteps f32 rounding at the 0.5 edge.
        let mut stmt = conn
            .prepare(
                "SELECT content FROM file_chunks
                 WHERE embedding MATCH ?1 AND distance < 0.4 ORDER BY distance LIMIT 10",
            )
            .unwrap();
        let literal: Vec<String> = stmt
            .query_map([query_blob.clone()], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(literal, vec!["exact", "hidden"]);

        // Parameterized threshold (what retrieval.rs ships).
        let mut stmt = conn
            .prepare(
                "SELECT content FROM file_chunks
                 WHERE embedding MATCH ?1 AND distance <= ?2 ORDER BY distance LIMIT 10",
            )
            .unwrap();
        let parameterized: Vec<String> = stmt
            .query_map(rusqlite::params![query_blob, 0.5 + f64::EPSILON], |row| {
                row.get(0)
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(parameterized, vec!["exact", "hidden", "borderline"]);
    }
}
