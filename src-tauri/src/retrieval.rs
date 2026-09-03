//! Chat grounding: nearest-neighbor retrieval over stored memories and
//! processed file chunks — the desktop port of `src/server/llm/query-embedding.ts`.
//! KNN top-4 per source; the similarity threshold (≥ 0.5 cosine) is enforced
//! in SQL — vec0's query planner leaves `distance` constraints unconsumed, so
//! SQLite applies them per-row on the KNN stream (pinned by a db.rs test).
//! Conversation scoping stays app-side: a JOIN defeats vec0's fast KNN path.

use crate::db::{self, Db, EMBEDDING_DIM};

pub const RETRIEVAL_LIMIT: usize = 4;
pub const MIN_SIMILARITY: f64 = 0.5;
/// Largest cosine distance that still counts as a match — inclusive edge,
/// same tolerance as the old app-side filter
/// (`1.0 - distance >= MIN_SIMILARITY - ε` ⇔ `distance <= MAX_DISTANCE`).
pub const MAX_DISTANCE: f64 = 1.0 - MIN_SIMILARITY + f64::EPSILON;
/// Settings key for the per-turn tunable memory threshold (files keep the
/// pinned threshold — the vec0 distance/tolerance behavior is unit-pinned).
pub const THRESHOLD_SETTING: &str = "retrieval.threshold";

pub struct RetrievalInput<'a> {
    pub db: &'a Db,
    /// The query embedding (computed once per turn for both sources).
    pub query_embedding: &'a [f32],
    /// The conversation asking. File chunks are scoped to it; memories stay
    /// global.
    pub conversation_id: i64,
}

/// Per-turn similarity threshold for memories (0.0–1.0 cosine). Read from
/// settings so it's tunable without a rebuild; invalid/absent values fall
/// back to the pinned default. Incognito conversations read no memories.
fn memory_max_distance(db: &Db, conversation_id: i64) -> Option<f64> {
    let conn = db.get().ok()?;
    let incognito: i64 = conn
        .query_row(
            "SELECT incognito FROM conversations WHERE id = ?1",
            [conversation_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if incognito != 0 {
        return None;
    }
    let threshold = db::get_setting(&conn, THRESHOLD_SETTING)
        .ok()
        .flatten()
        .and_then(|raw| raw.parse::<f64>().ok())
        .filter(|t| (0.0..=1.0).contains(t))
        .unwrap_or(MIN_SIMILARITY);
    Some(1.0 - threshold + f64::EPSILON)
}

/// Top-4 memory contents by cosine similarity, most similar first.
pub fn related_memories(input: &RetrievalInput<'_>) -> Result<Vec<String>, String> {
    if input.query_embedding.len() != EMBEDDING_DIM {
        return Ok(Vec::new());
    }
    let Some(max_distance) = memory_max_distance(input.db, input.conversation_id) else {
        return Ok(Vec::new());
    };
    let conn = input.db.get().map_err(|err| err.to_string())?;
    let query_blob = db::embedding_to_blob(input.query_embedding);
    // Bare KNN on the virtual table (a JOIN defeats vec0's fast path — see
    // the module docs); contents fetched app-side, like file chunks.
    let mut stmt = conn
        .prepare(
            "SELECT rowid, memory_id FROM memories_vec
             WHERE embedding MATCH ?1 AND distance <= ?2 ORDER BY distance LIMIT ?3",
        )
        .map_err(|err| err.to_string())?;
    let knn: Vec<(i64, i64)> = stmt
        .query_map(
            rusqlite::params![query_blob, max_distance, RETRIEVAL_LIMIT as i64],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    knn.into_iter()
        .map(|(_, memory_id)| {
            conn.query_row(
                "SELECT content FROM memories WHERE id = ?1",
                [memory_id],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())
        })
        .collect()
}

/// One full-text search hit: the conversation, message, and a highlighted
/// snippet. Raw transcripts are searched in place — never copied into the
/// memory layer.
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub conversation_id: i64,
    pub conversation_title: String,
    pub message_id: i64,
    pub snippet: String,
}

/// Full-text search over message transcripts. Scoped to the calling
/// conversation's project when it has one; `whole_vault` widens to all
/// chats. Incognito conversations are always excluded.
pub fn search_history(
    db: &Db,
    query: &str,
    conversation_id: i64,
    whole_vault: bool,
) -> Result<Vec<SearchHit>, String> {
    let conn = db.get().map_err(|err| err.to_string())?;

    // Incognito chats are invisible to search, whichever scope applies.
    let incognito_sql = if whole_vault {
        "WHERE c.incognito = 0".to_string()
    } else {
        let project_id: Option<i64> = conn
            .query_row(
                "SELECT project_id FROM conversations WHERE id = ?1 AND project_id IS NOT NULL",
                [conversation_id],
                |row| row.get(0),
            )
            .ok();
        match project_id {
            Some(project_id) => format!("WHERE c.incognito = 0 AND c.project_id = {project_id}"),
            None => "WHERE c.incognito = 0".to_string(),
        }
    };

    let fts_query = fts_quote(query);
    let sql = format!(
        "SELECT m.id, m.conversation_id, c.title, snippet(messages_fts, 0, '', '', '…', 12)
         FROM messages_fts f
         JOIN messages m ON m.id = f.rowid
         JOIN conversations c ON c.id = m.conversation_id
         {incognito_sql} AND messages_fts MATCH ?1
         ORDER BY rank LIMIT 20"
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([fts_query], |row| {
            Ok(SearchHit {
                message_id: row.get(0)?,
                conversation_id: row.get(1)?,
                conversation_title: row.get(2)?,
                snippet: row.get(3)?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

/// Wraps the query in phrase quotes so punctuation doesn't read as FTS
/// syntax; a quirk-free search beats a clever one.
fn fts_quote(query: &str) -> String {
    let cleaned: String = query
        .chars()
        .map(|c| if c == '"' { ' ' } else { c })
        .collect();
    format!("\"{}\"", cleaned.trim())
}
/// Top-4 file-chunk contents from this conversation's attachments, most
/// similar first.
///
/// vec0 KNN only optimizes bare queries on the virtual table (a JOIN makes
/// it reject both parameterized and literal LIMITs), so this runs KNN over
/// all chunks and filters to the conversation app-side — bounded by a
/// desktop-scale corpus, and exactly correct (a distant chunk from another
/// chat can't crowd out a close one from this chat). The similarity
/// threshold lives in SQL (see the module docs).
pub fn related_file_chunks(input: &RetrievalInput<'_>) -> Result<Vec<String>, String> {
    if input.query_embedding.len() != EMBEDDING_DIM {
        return Ok(Vec::new());
    }

    let conn = input.db.get().map_err(|err| err.to_string())?;
    let conversation_file_ids: Vec<i64> = {
        let mut stmt = conn
            .prepare(
                "SELECT f.id FROM files f
                 JOIN messages m ON m.id = f.message_id
                 WHERE m.conversation_id = ?1",
            )
            .map_err(|err| err.to_string())?;
        let ids = stmt
            .query_map([input.conversation_id], |row| row.get(0))
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;
        ids
    };
    if conversation_file_ids.is_empty() {
        return Ok(Vec::new());
    }

    knn_chunks_filtered(&conn, input.query_embedding, &conversation_file_ids)
}

/// The project this conversation belongs to, if any.
fn conversation_project(conn: &rusqlite::Connection, conversation_id: i64) -> Option<i64> {
    conn.query_row(
        "SELECT project_id FROM conversations WHERE id = ?1 AND project_id IS NOT NULL",
        [conversation_id],
        |row| row.get::<_, i64>(0),
    )
    .ok()
}

/// Top-4 file-chunk contents from the conversation's project knowledge
/// folder, most similar first. Plain chats (no project) get nothing here.
/// Same app-side scoping as `related_file_chunks` — the KNN runs over the
/// whole chunk table and filters to the project's knowledge files.
pub fn related_project_chunks(input: &RetrievalInput<'_>) -> Result<Vec<String>, String> {
    if input.query_embedding.len() != EMBEDDING_DIM {
        return Ok(Vec::new());
    }
    let conn = input.db.get().map_err(|err| err.to_string())?;
    let Some(project_id) = conversation_project(&conn, input.conversation_id) else {
        return Ok(Vec::new());
    };

    let knowledge_file_ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM files WHERE project_id = ?1")
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([project_id], |row| row.get(0))
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?
    };
    if knowledge_file_ids.is_empty() {
        return Ok(Vec::new());
    }

    knn_chunks_filtered(&conn, input.query_embedding, &knowledge_file_ids)
}

/// KNN over every chunk (vec0 needs its k unscoped), filtered app-side to the
/// allowed file ids. See `related_file_chunks` for why the JOIN stays out.
fn knn_chunks_filtered(
    conn: &rusqlite::Connection,
    query_embedding: &[f32],
    file_ids: &[i64],
) -> Result<Vec<String>, String> {
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM file_chunks", [], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    if total == 0 {
        return Ok(Vec::new());
    }

    let query_blob = db::embedding_to_blob(query_embedding);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT rowid, file_id FROM file_chunks
             WHERE embedding MATCH ?1 AND distance <= ?2 ORDER BY distance LIMIT {total}"
        ))
        .map_err(|err| err.to_string())?;
    let knn: Vec<(i64, i64)> = stmt
        .query_map(rusqlite::params![query_blob, MAX_DISTANCE], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    knn.into_iter()
        .filter(|(_, file_id)| file_ids.contains(file_id))
        .take(RETRIEVAL_LIMIT)
        .map(|(rowid, _)| chunk_content(conn, rowid))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())
}

fn chunk_content(conn: &rusqlite::Connection, rowid: i64) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT content FROM file_chunks WHERE rowid = ?1",
        [rowid],
        |row| row.get(0),
    )
}

/// Chunks from the conversation's files with no similarity filter — used for
/// file-only turns (nothing meaningful to embed), oldest chunks first.
pub fn conversation_chunks_head(db: &Db, conversation_id: i64) -> Result<Vec<String>, String> {
    let conn = db.get().map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT fc.content FROM file_chunks fc
             JOIN files f ON f.id = fc.file_id
             JOIN messages m ON m.id = f.message_id
             WHERE m.conversation_id = ?1 ORDER BY fc.rowid LIMIT ?2",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(
            rusqlite::params![conversation_id, RETRIEVAL_LIMIT as i64],
            |row| row.get::<_, String>(0),
        )
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::embeddings::{Embedder, FakeEmbedder};

    fn sparse(lead: f32, second: f32) -> Vec<f32> {
        let mut embedding = vec![0.0f32; EMBEDDING_DIM];
        embedding[0] = lead;
        embedding[1] = second;
        embedding
    }

    /// Seeds memories directly.
    fn seed_memories(pool: &Db, rows: &[(&str, Vec<f32>)]) {
        let conn = pool.get().unwrap();
        for (content, vector) in rows {
            conn.execute(
                "INSERT INTO memories (content, source, created_at, updated_at)
                 VALUES (?1, 'manual', '0', '0')",
                [content],
            )
            .unwrap();
            let memory_id = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO memories_vec (embedding, memory_id) VALUES (?1, ?2)",
                rusqlite::params![db::embedding_to_blob(vector), memory_id],
            )
            .unwrap();
        }
    }

    /// Creates a conversation + user message + file, then its chunks. Files
    /// only ground through this chain now. Returns the conversation id.
    fn seed_chat_file(pool: &Db, chunks: &[(&str, Vec<f32>)]) -> i64 {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO conversations (title, created_at, updated_at)
             VALUES ('chat', '0', '0')",
            [],
        )
        .unwrap();
        let conversation_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at)
             VALUES (?1, 'USER', 'see attachment', '0')",
            [conversation_id],
        )
        .unwrap();
        let message_id = conn.last_insert_rowid();
        let file_name = format!("doc-{conversation_id}.txt");
        conn.execute(
            "INSERT INTO files (original_name, file_name, mime_type, size, kind, status,
                                processed_at, created_at, message_id)
             VALUES (?1, ?2, 'text/plain', 1, 'TEXT', 'PROCESSED', '0', '0', ?3)",
            rusqlite::params!["doc.txt", file_name, message_id],
        )
        .unwrap();
        let file_id = conn.last_insert_rowid();
        for (content, vector) in chunks {
            conn.execute(
                "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, ?3)",
                rusqlite::params![db::embedding_to_blob(vector), content, file_id],
            )
            .unwrap();
        }
        conversation_id
    }

    #[tokio::test]
    async fn returns_top_matches_above_the_similarity_threshold() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed_memories(
            &pool,
            &[
                ("exact", sparse(1.0, 0.0)),
                ("near", sparse(0.9, 0.1)),
                ("weak", sparse(0.3, 0.9)),
                ("orthogonal", sparse(0.0, 1.0)),
            ],
        );

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
            conversation_id: 1,
        };
        let memories = related_memories(&input).unwrap();

        // "weak" (similarity ~0.316) and "orthogonal" (0.0) fall below 0.5.
        assert_eq!(memories, vec!["exact".to_string(), "near".to_string()]);
    }

    #[tokio::test]
    async fn similarity_at_the_threshold_boundary_is_included() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        // "borderline" sits exactly at similarity 0.5 (60°) — the inclusive
        // edge MAX_DISTANCE's epsilon tolerance protects.
        seed_memories(
            &pool,
            &[
                ("exact", sparse(1.0, 0.0)),
                ("borderline", sparse(0.5, 0.75f32.sqrt())),
                ("orthogonal", sparse(0.0, 1.0)),
            ],
        );

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
            conversation_id: 1,
        };
        let memories = related_memories(&input).unwrap();

        assert_eq!(
            memories,
            vec!["exact".to_string(), "borderline".to_string()]
        );
    }

    #[tokio::test]
    async fn caps_at_four_most_similar_when_more_pass() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        // Five rows clear the threshold; the LIMIT-consumed k must reach the
        // first four and stop there ("fifth" passes but doesn't fit).
        seed_memories(
            &pool,
            &[
                ("first", sparse(1.0, 0.0)),
                ("second", sparse(0.9, 0.1)),
                ("third", sparse(0.8, 0.2)),
                ("fourth", sparse(0.7, 0.3)),
                ("fifth", sparse(0.6, 0.4)),
                ("weak", sparse(0.3, 0.9)),
            ],
        );

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
            conversation_id: 1,
        };
        let memories = related_memories(&input).unwrap();

        assert_eq!(
            memories,
            vec![
                "first".to_string(),
                "second".to_string(),
                "third".to_string(),
                "fourth".to_string()
            ]
        );
    }

    #[tokio::test]
    async fn file_chunk_retrieval_is_scoped_to_the_conversation() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed_chat_file(
            &pool,
            &[
                ("far", sparse(0.0, 1.0)),
                ("best", sparse(1.0, 0.0)),
                ("mid", sparse(0.5, 0.75f32.sqrt())),
            ],
        );
        let other = seed_chat_file(&pool, &[("other chat secret", sparse(1.0, 0.0))]);

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
            conversation_id: 1,
        };
        let chunks = related_file_chunks(&input).unwrap();

        // The other chat's file is invisible from conversation 1; below-
        // threshold rows drop.
        assert_eq!(chunks, vec!["best".to_string(), "mid".to_string()]);
        assert!(!chunks.contains(&"other chat secret".to_string()));
        let _ = other;
    }

    #[tokio::test]
    async fn file_chunks_head_ignores_similarity() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed_chat_file(
            &pool,
            &[
                ("first chunk", sparse(0.0, 1.0)),
                ("second chunk", sparse(0.0, 1.0)),
                ("third chunk", sparse(0.0, 1.0)),
            ],
        );

        // Orthogonal to everything — still returned, in stored order.
        let chunks = conversation_chunks_head(&pool, 1).unwrap();
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0], "first chunk");
    }

    #[tokio::test]
    async fn dimension_mismatch_returns_no_results() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed_memories(&pool, &[("exact", sparse(1.0, 0.0))]);

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &[1.0; 8],
            conversation_id: 1,
        };
        assert!(related_memories(&input).unwrap().is_empty());
    }

    #[tokio::test]
    async fn embedder_output_wires_into_retrieval() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed_memories(
            &pool,
            &[
                ("apple note", sparse(1.0, 0.0)),
                ("banana note", sparse(0.0, 1.0)),
            ],
        );

        let embedder = FakeEmbedder::by_keyword(&["apple", "banana"]);
        let query = embedder.embed("talking about apples").await.unwrap();

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &query,
            conversation_id: 1,
        };
        let memories = related_memories(&input).unwrap();
        assert_eq!(memories, vec!["apple note".to_string()]);
    }

    #[tokio::test]
    async fn memory_threshold_is_tunable_per_turn() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        // Borderline match: similarity exactly 0.5 — cleared by the default,
        // silenced by anything higher.
        seed_memories(&pool, &[("borderline", sparse(0.5, 0.75f32.sqrt()))]);

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
            conversation_id: 1,
        };
        assert_eq!(related_memories(&input).unwrap(), vec!["borderline"]);

        {
            let conn = pool.get().unwrap();
            db::set_setting(&conn, THRESHOLD_SETTING, "0.95").unwrap();
            assert!(related_memories(&input).unwrap().is_empty());
            db::set_setting(&conn, THRESHOLD_SETTING, "0.5").unwrap();
            assert_eq!(related_memories(&input).unwrap(), vec!["borderline"]);
            // Invalid values fall back to the pinned default.
            db::set_setting(&conn, THRESHOLD_SETTING, "not-a-number").unwrap();
            assert_eq!(related_memories(&input).unwrap(), vec!["borderline"]);
        }
    }

    #[tokio::test]
    async fn incognito_conversations_read_no_memories() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();
        {
            let conn = pool.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at, incognito)
                 VALUES (1, 'private', '0', '0', 1)",
                [],
            )
            .unwrap();
        }
        seed_memories(&pool, &[("apple note", sparse(1.0, 0.0))]);

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
            conversation_id: 1,
        };
        assert!(
            related_memories(&input).unwrap().is_empty(),
            "incognito chats read no memories"
        );
    }

    #[tokio::test]
    async fn search_history_scopes_projects_and_hides_incognito() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();
        {
            let conn = pool.get().unwrap();
            for project_id in [1i64, 2i64] {
                conn.execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, 'p', '0', '0')",
                    [project_id],
                )
                .unwrap();
            }
            let conversation = |id: i64, project_id: Option<i64>, incognito: bool, title: &str| {
                conn.execute(
                    "INSERT INTO conversations (id, title, created_at, updated_at, project_id, incognito)
                     VALUES (?1, ?4, '0', '0', ?2, ?3)",
                    rusqlite::params![id, project_id, incognito as i64, title],
                )
                .unwrap();
            };
            conversation(1, Some(1), false, "project chat");
            conversation(2, Some(1), false, "project sibling");
            conversation(3, Some(2), false, "other project");
            conversation(4, None, false, "plain chat");
            conversation(5, None, true, "incognito");
            let message = |id: i64, conversation_id: i64, content: &str| {
                conn.execute(
                    "INSERT INTO messages (id, conversation_id, role, content, created_at)
                     VALUES (?1, ?2, 'USER', ?3, '0')",
                    rusqlite::params![id, conversation_id, content],
                )
                .unwrap();
            };
            message(1, 1, "the march burnout spiraled hard");
            message(2, 2, "still tired from the march burnout");
            message(3, 3, "march plans for the other project");
            message(4, 4, "march came and went");
            message(5, 5, "secret march journal");
        }

        // Project-scoped by default: the asking chat's project only.
        let hits = search_history(&pool, "march", 1, false).unwrap();
        let conversation_ids: Vec<i64> = hits.iter().map(|hit| hit.conversation_id).collect();
        assert_eq!(conversation_ids.len(), 2);
        assert!(conversation_ids.contains(&1));
        assert!(conversation_ids.contains(&2));

        // Whole vault: everything except the incognito chat.
        let hits = search_history(&pool, "march", 1, true).unwrap();
        let conversation_ids: Vec<i64> = hits.iter().map(|hit| hit.conversation_id).collect();
        assert_eq!(conversation_ids.len(), 4);
        assert!(!conversation_ids.contains(&5));

        // No matches → empty, not an error.
        let hits = search_history(&pool, "zebra", 1, true).unwrap();
        assert!(hits.is_empty());

        // A phrase with FTS punctuation doesn't explode; quoted, it matches
        // only the adjacent phrase (not the sibling message's wording).
        let hits = search_history(&pool, "burnout (spiraled)", 1, false).unwrap();
        assert_eq!(hits.len(), 1);
    }
}
