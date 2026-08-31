use std::path::Path;

use apalis::prelude::{TaskSink, WorkerBuilder, WorkerBuilderExt};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;

/// All apalis usage is routed through this module so version churn can't leak
/// into resolvers (see tauri_mvp.md decisions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessFileJob {
    pub file_id: i64,
}

type Storage = apalis_sqlite::SqliteStorage<
    ProcessFileJob,
    apalis_codec::json::JsonCodec<apalis_sqlite::CompactType>,
    apalis_sqlite::fetcher::SqliteFetcher,
>;

/// Handle to the job queue; cloneable, shared with resolvers via schema data.
#[derive(Clone)]
pub struct Jobs {
    storage: Storage,
}

impl Jobs {
    /// Opens (or creates) `jobs.db` and its apalis tables.
    pub async fn init(path: &Path) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("sqlite://{}?mode=rwc", path.display());
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await?;

        // SAFETY-free: apalis runs its own table migrations in `jobs.db`.
        apalis_sqlite::SqliteStorage::<(), (), ()>::setup(&pool).await?;

        Ok(Self {
            storage: apalis_sqlite::SqliteStorage::new(&pool),
        })
    }

    /// Enqueues a file for processing (extract → chunk → embed, in M3).
    pub async fn push_job(
        &self,
        job: ProcessFileJob,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut storage = self.storage.clone();
        storage.push(job).await?;
        Ok(())
    }

    pub fn storage(&self) -> Storage {
        self.storage.clone()
    }
}

/// Runs the file-processing worker; blocks until the task is cancelled.
pub async fn run_worker(jobs: Jobs) {
    if let Err(err) = WorkerBuilder::new("process-file")
        .backend(jobs.storage())
        .concurrency(1)
        .build(handle_process_file)
        .run()
        .await
    {
        eprintln!("process-file worker stopped: {err}");
    }
}

async fn handle_process_file(_job: ProcessFileJob) {
    // Placeholder until the M3 pipeline (pdf-extract / tiktoken-rs / fastembed-rs).
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
}
