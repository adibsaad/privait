//! Job queue: all apalis usage lives here so version churn can't leak into
//! resolvers (docs/architecture.md decision). The queue owns its own `jobs.db`
//! (sqlx/apalis); the content DB stays rusqlite.
//!
//! The file pipeline moved to `files.rs` (the chat-composer path processes
//! uploads inline); the worker stays wired for the Reflect phase's
//! scheduled jobs but nothing pushes to it today.

use std::path::Path;

use apalis::prelude::{TaskSink, WorkerBuilder, WorkerBuilderExt};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;

pub use crate::files::PipelineDeps;

/// All apalis usage is routed through this module so version churn can't leak
/// into resolvers (see docs/architecture.md decisions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessFileJob {
    pub file_id: i64,
}

type Storage_ = apalis_sqlite::SqliteStorage<
    ProcessFileJob,
    apalis_codec::json::JsonCodec<apalis_sqlite::CompactType>,
    apalis_sqlite::fetcher::SqliteFetcher,
>;

/// Handle to the job queue; cloneable, shared via schema data if a resolver
/// ever needs it again.
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

    /// Enqueues a job.
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

/// Runs the file-processing worker; blocks until the task is cancelled.
pub async fn run_worker(jobs: Jobs, deps: PipelineDeps) {
    if let Err(err) = WorkerBuilder::new("process-file")
        .backend(jobs.storage())
        .concurrency(1)
        .build(move |job: ProcessFileJob| {
            let deps = deps.clone();
            async move {
                if let Err(err) = crate::files::process_uploaded_file(&deps, job.file_id).await {
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

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    use super::*;

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

    #[tokio::test]
    async fn worker_processes_files_through_the_shared_pipeline() {
        use crate::embeddings::FakeEmbedder;
        use crate::storage::Storage as FileStorage;

        let dir = TempDir::new().unwrap();
        let jobs = Jobs::init(&dir.path().join("jobs.db")).await.unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = Arc::new(FileStorage::memory().unwrap());
        let embedder: Arc<dyn crate::embeddings::Embedder> = Arc::new(FakeEmbedder::new(|text| {
            let mut vector = vec![0.0f32; crate::db::EMBEDDING_DIM];
            vector[0] = text.len() as f32;
            vector
        }));

        let row = crate::files::store_upload(
            &db,
            &storage,
            b"queued processing still works end to end".to_vec(),
            "queued.txt",
            "text/plain",
        )
        .await
        .unwrap();

        let worker_db = db.clone();
        let worker_storage = storage.clone();
        let worker_embedder = embedder.clone();
        let worker = WorkerBuilder::new("test-worker")
            .backend(jobs.storage())
            .concurrency(1)
            .build(move |job: ProcessFileJob| {
                let deps = PipelineDeps {
                    db: worker_db.clone(),
                    storage: worker_storage.clone(),
                    embedder: worker_embedder.clone(),
                };
                async move {
                    let _ = crate::files::process_uploaded_file(&deps, job.file_id).await;
                }
            })
            .run();
        tokio::spawn(worker);

        jobs.push_job(ProcessFileJob { file_id: row.id })
            .await
            .unwrap();

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
        loop {
            let conn = db.get().unwrap();
            let status: String = conn
                .query_row("SELECT status FROM files WHERE id = ?1", [row.id], |r| {
                    r.get(0)
                })
                .unwrap();
            if status == "PROCESSED" {
                return;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "worker never processed file {}",
                row.id
            );
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
}
