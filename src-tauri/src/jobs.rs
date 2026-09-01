//! Job queue: all apalis usage lives here so version churn can't leak into
//! resolvers (tauri_mvp.md decision). The queue owns its own `jobs.db`
//! (sqlx/apalis); the content DB stays rusqlite.

use std::path::Path;
use std::sync::Arc;

use apalis::prelude::{TaskSink, WorkerBuilder, WorkerBuilderExt};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;

use crate::chunker::{self, ChunkOptions};
use crate::db::{self, Db};
use crate::embeddings::Embedder;
use crate::files::FileRow;
use crate::storage::Storage;

/// All apalis usage is routed through this module so version churn can't leak
/// into resolvers (see tauri_mvp.md decisions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessFileJob {
    pub file_id: i64,
}

type Storage_ = apalis_sqlite::SqliteStorage<
    ProcessFileJob,
    apalis_codec::json::JsonCodec<apalis_sqlite::CompactType>,
    apalis_sqlite::fetcher::SqliteFetcher,
>;

/// Handle to the job queue; cloneable, shared with resolvers via schema data.
#[derive(Clone)]
pub struct Jobs {
    storage: Storage_,
}

impl Jobs {
    /// Opens (or creates) `jobs.db` and its apalis tables.
    pub async fn init(path: &Path) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("sqlite://{}?mode=rwc", path.display());
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await?;

        // apalis runs its own table migrations in `jobs.db`.
        apalis_sqlite::SqliteStorage::<(), (), ()>::setup(&pool).await?;

        Ok(Self {
            storage: apalis_sqlite::SqliteStorage::new(&pool),
        })
    }

    /// Enqueues a file for processing (extract → chunk → embed → `file_chunks`).
    pub async fn push_job(
        &self,
        job: ProcessFileJob,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut storage = self.storage.clone();
        storage.push(job).await?;
        Ok(())
    }

    pub fn storage(&self) -> Storage_ {
        self.storage.clone()
    }
}

/// Everything the process-file worker needs to do its work.
#[derive(Clone)]
pub struct PipelineDeps {
    pub db: Db,
    pub storage: Arc<Storage>,
    pub embedder: Arc<dyn Embedder>,
}

/// Runs the file-processing worker; blocks until the task is cancelled.
pub async fn run_worker(jobs: Jobs, deps: PipelineDeps) {
    if let Err(err) = WorkerBuilder::new("process-file")
        .backend(jobs.storage())
        .concurrency(1)
        .build(move |job: ProcessFileJob| {
            let deps = deps.clone();
            async move {
                if let Err(err) = process_uploaded_file(&deps, job.file_id).await {
                    eprintln!("process-file failed for file {}: {err}", job.file_id);
                }
            }
        })
        .run()
        .await
    {
        eprintln!("process-file worker stopped: {err}");
    }
}

/// Extracts text, chunks it (cl100k_base, 512/64 — the ported chunker),
/// embeds each chunk, and stores the vectors. Mirrors
/// `src/server/jobs/process-file.ts` step for step.
pub async fn process_uploaded_file(deps: &PipelineDeps, file_id: i64) -> Result<(), String> {
    let row: FileRow = {
        let conn = deps.db.get().map_err(|err| err.to_string())?;
        crate::files::get_file(&conn, file_id)
            .map_err(|err| err.to_string())?
            .ok_or_else(|| "File not found".to_string())?
    };

    let bytes = deps
        .storage
        .read(&row.file_name)
        .await
        .map_err(|err| err.to_string())?;

    let text = extract_text(&bytes, &row.kind)?;

    let conn = deps.db.get().map_err(|err| err.to_string())?;
    let chunks =
        chunker::stream_chunks(&text, ChunkOptions::default()).map_err(|err| err.to_string())?;

    let mut count = 0usize;
    for chunk in chunks {
        let embedding = deps
            .embedder
            .embed(&chunk.text)
            .await
            .map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, ?3)",
            rusqlite::params![db::embedding_to_blob(&embedding), chunk.text, file_id],
        )
        .map_err(|err| err.to_string())?;
        count += 1;
    }
    drop(conn);

    let conn = deps.db.get().map_err(|err| err.to_string())?;
    conn.execute(
        "UPDATE files SET status = 'PROCESSED', processed_at = ?1 WHERE id = ?2",
        rusqlite::params![now_iso(), file_id],
    )
    .map_err(|err| err.to_string())?;

    println!("Processed {count} chunks for file {file_id}");
    Ok(())
}

/// PDF → pdf-extract, TEXT → utf-8 (lossy, as `Buffer.toString('utf-8')`).
fn extract_text(bytes: &[u8], kind: &str) -> Result<String, String> {
    match kind {
        "PDF" => pdf_extract::extract_text_from_mem(bytes).map_err(|err| err.to_string()),
        "TEXT" => Ok(String::from_utf8_lossy(bytes).into_owned()),
        other => Err(format!("unsupported file kind: {other}")),
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    use super::*;

    use crate::embeddings::FakeEmbedder;
    use crate::storage::Storage as FileStorage;
    use tempfile::TempDir;

    #[tokio::test]
    async fn worker_processes_pushed_jobs() {
        let dir = TempDir::new().unwrap();
        let jobs = Jobs::init(&dir.path().join("jobs.db")).await.unwrap();

        let processed = Arc::new(AtomicBool::new(false));
        let flag = processed.clone();

        let worker = WorkerBuilder::new("test-worker")
            .backend(jobs.storage())
            .concurrency(1)
            .build(move |_job: ProcessFileJob| {
                let flag = flag.clone();
                async move {
                    flag.store(true, Ordering::SeqCst);
                }
            })
            .run();
        tokio::spawn(worker);

        jobs.push_job(ProcessFileJob { file_id: 42 }).await.unwrap();

        for _ in 0..50 {
            if processed.load(Ordering::SeqCst) {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        panic!("worker did not process the pushed job");
    }

    fn deps(dir: &TempDir, embedder: Arc<dyn Embedder>) -> (Db, Arc<FileStorage>, PipelineDeps) {
        let db = crate::db::init(dir.path()).unwrap();
        let storage = Arc::new(FileStorage::memory().unwrap());
        let pipeline = PipelineDeps {
            db: db.clone(),
            storage: storage.clone(),
            embedder,
        };
        (db, storage, pipeline)
    }

    #[tokio::test]
    async fn processes_a_text_file_into_chunks_and_marks_it_processed() {
        let dir = TempDir::new().unwrap();
        // Deterministic embedder: first component = token count (any stable
        // function works; this test asserts pipeline behavior, not vectors).
        let embedder = Arc::new(FakeEmbedder::new(|text| {
            let mut vector = vec![0.0f32; crate::db::EMBEDDING_DIM];
            vector[0] = text.len() as f32;
            vector
        }));
        let (db, storage, pipeline) = deps(&dir, embedder);

        let row = crate::files::store_upload(
            &db,
            &storage,
            b"The quick brown fox jumps over the lazy dog.".to_vec(),
            "story.txt",
            "text/plain",
        )
        .await
        .unwrap();

        process_uploaded_file(&pipeline, row.id).await.unwrap();

        let conn = db.get().unwrap();
        let (status, processed_at): (String, Option<String>) = conn
            .query_row(
                "SELECT status, processed_at FROM files WHERE id = ?1",
                [row.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "PROCESSED");
        assert!(processed_at.is_some());

        let (chunks, dims): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), (SELECT length(embedding) FROM file_chunks LIMIT 1) / 4 FROM file_chunks WHERE file_id = ?1",
                [row.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(chunks > 0);
        assert_eq!(dims, 384, "vectors are stored as 384 f32s");

        let stored: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT content FROM file_chunks WHERE file_id = ?1 ORDER BY rowid")
                .unwrap();
            stmt.query_map([row.id], |r| r.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert!(stored
            .iter()
            .all(|chunk| chunk.contains("quick brown fox") || chunk.contains("lazy dog")));
    }

    #[tokio::test]
    async fn missing_file_fails_without_touching_status() {
        let dir = TempDir::new().unwrap();
        let embedder = Arc::new(FakeEmbedder::new(|_| vec![0.0; crate::db::EMBEDDING_DIM]));
        let (_db, _storage, pipeline) = deps(&dir, embedder);

        let err = process_uploaded_file(&pipeline, 404).await.unwrap_err();
        assert_eq!(err, "File not found");
    }

    #[tokio::test]
    async fn corrupt_pdf_fails_with_a_readable_error() {
        let dir = TempDir::new().unwrap();
        let embedder = Arc::new(FakeEmbedder::new(|_| vec![0.0; crate::db::EMBEDDING_DIM]));
        let (db, storage, pipeline) = deps(&dir, embedder);

        let row = crate::files::store_upload(
            &db,
            &storage,
            b"definitely not a pdf".to_vec(),
            "fake.pdf",
            "application/pdf",
        )
        .await
        .unwrap();

        assert!(process_uploaded_file(&pipeline, row.id).await.is_err());

        let conn = db.get().unwrap();
        let status: String = conn
            .query_row("SELECT status FROM files WHERE id = ?1", [row.id], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(status, "UPLOADED", "failed processing must not flip status");
    }

    #[test]
    fn text_extraction_branches_by_kind() {
        assert_eq!(extract_text(b"plain", "TEXT").unwrap(), "plain".to_string());
        assert!(extract_text(b"junk", "PDF").is_err());
        assert!(extract_text(b"junk", "MOVIE").is_err());
    }
}
