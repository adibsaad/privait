//! Job queue: all apalis usage lives here so version churn can't leak into
//! resolvers (docs/architecture.md decision). The queue owns its own `jobs.db`
//! (sqlx/apalis); the content DB stays rusqlite.
//!
//! The file pipeline moved to `files.rs` (the chat-composer path processes
//! uploads inline; the queue still carries fallback jobs). 0003 adds the
//! post-chat memory distillation job.

use std::path::Path;

use apalis::prelude::{TaskSink, WorkerBuilder, WorkerBuilderExt};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;

pub use crate::files::PipelineDeps;

/// What the distillation worker needs beyond the queue: content db, file
/// storage, and the local embedder.
#[derive(Clone)]
pub struct WorkerDeps {
    pub db: crate::db::Db,
    pub storage: std::sync::Arc<crate::storage::Storage>,
    pub embedder: std::sync::Arc<dyn crate::embeddings::Embedder>,
}

/// All apalis usage is routed through this module so version churn can't leak
/// into resolvers (see docs/architecture.md decisions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AppJob {
    /// Fallback path for the inline upload pipeline.
    ProcessFile {
        file_id: i64,
    },
    /// Post-chat memory distillation: proposes memories from the
    /// conversation's last exchange.
    DistillMemory {
        conversation_id: i64,
    },
}

type Storage_ = apalis_sqlite::SqliteStorage<
    AppJob,
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
        job: AppJob,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut storage = self.storage.clone();
        storage.push(job).await?;
        Ok(())
    }

    pub fn storage(&self) -> Storage_ {
        self.storage.clone()
    }
}

/// Runs the background worker (file fallback + memory distillation); blocks
/// until the task is cancelled.
pub async fn run_worker(jobs: Jobs, deps: WorkerDeps) {
    if let Err(err) = WorkerBuilder::new("background-worker")
        .backend(jobs.storage())
        .concurrency(1)
        .build(move |job: AppJob| {
            let deps = deps.clone();
            async move {
                match job {
                    AppJob::ProcessFile { file_id } => {
                        let pipeline = PipelineDeps {
                            db: deps.db.clone(),
                            storage: deps.storage.clone(),
                            embedder: deps.embedder.clone(),
                        };
                        if let Err(err) =
                            crate::files::process_uploaded_file(&pipeline, file_id).await
                        {
                            eprintln!("process-file failed for file {file_id}: {err}");
                        }
                    }
                    AppJob::DistillMemory { conversation_id } => {
                        if let Err(err) = run_distillation(&deps, conversation_id).await {
                            eprintln!(
                                "memory distillation failed for conversation {conversation_id}: {err}"
                            );
                        }
                    }
                }
            }
        })
        .run()
        .await
    {
        eprintln!("background worker stopped: {err}");
    }
}

/// Distills one conversation using the provider configured in settings.
async fn run_distillation(deps: &WorkerDeps, conversation_id: i64) -> Result<(), String> {
    let conn = deps.db.get().map_err(|err| err.to_string())?;
    if crate::memories::is_incognito(&conn, conversation_id) {
        return Ok(());
    }
    // Re-binding: the connection must not be held across awaits (rusqlite
    // is !Sync), and the provider is built fresh from settings.
    drop(conn);
    let provider = crate::provider::OpenAiCompatProvider::from_settings(
        {
            let conn = deps.db.get().map_err(|err| err.to_string())?;
            (
                crate::db::get_setting(&conn, "provider.baseUrl").unwrap_or_default(),
                crate::db::get_setting(&conn, "provider.apiKey").unwrap_or_default(),
                crate::db::get_setting(&conn, "provider.model").unwrap_or_default(),
            )
        }
        .0,
        {
            let conn = deps.db.get().map_err(|err| err.to_string())?;
            crate::db::get_setting(&conn, "provider.apiKey").unwrap_or_default()
        },
        {
            let conn = deps.db.get().map_err(|err| err.to_string())?;
            crate::db::get_setting(&conn, "provider.model").unwrap_or_default()
        },
    )
    .ok_or_else(|| "provider not configured".to_string())?;
    crate::memories::distill_conversation(&deps.db, deps.embedder.as_ref(), &provider, conversation_id)
        .await?;
    Ok(())
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
            .build(move |_job: AppJob| {
                let flag = flag.clone();
                async move {
                    flag.store(true, Ordering::SeqCst);
                }
            })
            .run();
        tokio::spawn(worker);

        jobs.push_job(AppJob::ProcessFile { file_id: 42 }).await.unwrap();

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
            .build(move |job: AppJob| {
                let worker_db = worker_db.clone();
                let worker_storage = worker_storage.clone();
                let worker_embedder = worker_embedder.clone();
                async move {
                    if let AppJob::ProcessFile { file_id } = job {
                        let deps = PipelineDeps {
                            db: worker_db,
                            storage: worker_storage,
                            embedder: worker_embedder,
                        };
                        let _ = crate::files::process_uploaded_file(&deps, file_id).await;
                    }
                }
            })
            .run();
        tokio::spawn(worker);

        jobs.push_job(AppJob::ProcessFile { file_id: row.id })
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
