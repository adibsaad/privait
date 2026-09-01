//! Chat grounding: nearest-neighbor retrieval over stored memories and
//! processed file chunks — the desktop port of `src/server/llm/query-embedding.ts`.
//! KNN top-4 per source with an app-side similarity filter (≥ 0.5, cosine);
//! vec0 does not accept `distance` as a WHERE filter, so the threshold is
//! applied to the returned rows (pinned by a db.rs test).

use crate::db::{self, Db, EMBEDDING_DIM};

pub const RETRIEVAL_LIMIT: usize = 4;
pub const MIN_SIMILARITY: f64 = 0.5;

pub struct RetrievalInput<'a> {
    pub db: &'a Db,
    /// The query embedding (computed once per turn for both sources).
    pub query_embedding: &'a [f32],
}

/// Top-4 memory contents by cosine similarity, most similar first.
pub fn related_memories(input: &RetrievalInput<'_>) -> Result<Vec<String>, String> {
    related_contents(
        input,
        "SELECT content, distance FROM memories
         WHERE embedding MATCH ?1 ORDER BY distance LIMIT ?2",
    )
}

/// Top-4 file-chunk contents by cosine similarity, most similar first.
pub fn related_file_chunks(input: &RetrievalInput<'_>) -> Result<Vec<String>, String> {
    related_contents(
        input,
        "SELECT content, distance FROM file_chunks
         WHERE embedding MATCH ?1 ORDER BY distance LIMIT ?2",
    )
}

fn related_contents(input: &RetrievalInput<'_>, sql: &str) -> Result<Vec<String>, String> {
    if input.query_embedding.len() != EMBEDDING_DIM {
        return Ok(Vec::new());
    }

    let conn = input.db.get().map_err(|err| err.to_string())?;
    let query_blob = db::embedding_to_blob(input.query_embedding);
    let mut stmt = conn.prepare(sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(
            rusqlite::params![query_blob, RETRIEVAL_LIMIT as i64],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
        )
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    Ok(rows
        .into_iter()
        .filter(|(_, distance)| 1.0 - distance >= MIN_SIMILARITY - f64::EPSILON)
        .map(|(content, _)| content)
        .collect())
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

    fn seed(pool: &Db, rows: &[(&str, Vec<f32>)], table: &str) {
        let conn = pool.get().unwrap();
        for (content, vector) in rows {
            match table {
                "memories" => conn
                    .execute(
                        "INSERT INTO memories (embedding, content) VALUES (?1, ?2)",
                        rusqlite::params![db::embedding_to_blob(vector), content],
                    )
                    .unwrap(),
                "file_chunks" => conn
                    .execute(
                        "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, 1)",
                        rusqlite::params![db::embedding_to_blob(vector), content],
                    )
                    .unwrap(),
                other => panic!("unknown table {other}"),
            };
        }
    }

    #[tokio::test]
    async fn returns_top_matches_above_the_similarity_threshold() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed(
            &pool,
            &[
                ("exact", sparse(1.0, 0.0)),
                ("near", sparse(0.9, 0.1)),
                ("weak", sparse(0.3, 0.9)),
                ("orthogonal", sparse(0.0, 1.0)),
            ],
            "memories",
        );

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
        };
        let memories = related_memories(&input).unwrap();

        // "weak" (similarity ~0.316) and "orthogonal" (0.0) fall below 0.5.
        assert_eq!(memories, vec!["exact".to_string(), "near".to_string()]);
    }

    #[tokio::test]
    async fn file_chunk_retrieval_is_filtered_and_ordered() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed(
            &pool,
            &[
                ("far", sparse(0.0, 1.0)),
                ("best", sparse(1.0, 0.0)),
                ("mid", sparse(0.5, 0.75f32.sqrt())),
            ],
            "file_chunks",
        );

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &sparse(1.0, 0.0),
        };
        let chunks = related_file_chunks(&input).unwrap();

        assert_eq!(chunks, vec!["best".to_string(), "mid".to_string()]);
    }

    #[tokio::test]
    async fn dimension_mismatch_returns_no_results() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed(&pool, &[("exact", sparse(1.0, 0.0))], "memories");

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &[1.0; 8],
        };
        assert!(related_memories(&input).unwrap().is_empty());
    }

    #[tokio::test]
    async fn embedder_output_wires_into_retrieval() {
        let dir = tempfile::TempDir::new().unwrap();
        let pool = crate::db::init(dir.path()).unwrap();

        seed(
            &pool,
            &[
                ("apple note", sparse(1.0, 0.0)),
                ("banana note", sparse(0.0, 1.0)),
            ],
            "memories",
        );

        let embedder = FakeEmbedder::by_keyword(&["apple", "banana"]);
        let query = embedder.embed("talking about apples").await.unwrap();

        let input = RetrievalInput {
            db: &pool,
            query_embedding: &query,
        };
        let memories = related_memories(&input).unwrap();
        assert_eq!(memories, vec!["apple note".to_string()]);
    }
}
