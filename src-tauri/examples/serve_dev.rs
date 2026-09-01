//! Dev helper: serves the GraphQL API on `http://127.0.0.1:3000` from the
//! real app data dir **without the per-launch token**, so the plain-web
//! frontend (`cd src/frontend && pnpm dev`) can talk to it for UI work.
//!
//! Localhost only, and launched manually — never bundled with the app.
//!
//! Usage: `cargo run --example serve_dev`

use privait_lib::{db, embeddings, files, jobs, schema, server, storage};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let port = 3000u16;

    // The web frontend expects the API at http://localhost:3000.
    let listener = std::net::TcpListener::bind(("127.0.0.1", port))?;

    let home = std::env::var("HOME").expect("HOME not set");
    let data_dir =
        std::path::PathBuf::from(home).join("Library/Application Support/app.privait.client");
    let db = db::init(&data_dir)?;

    let jobs = jobs::Jobs::init(&data_dir.join("jobs.db")).await?;
    let file_storage = Arc::new(storage::Storage::fs(&data_dir.join("files"))?);
    let embedder: Arc<dyn embeddings::Embedder> =
        Arc::new(embeddings::FastEmbedder::new(data_dir.join("models")));

    // Same startup sweep the app runs: uploads happen on send, so stored-
    // but-never-attached files are dead ends.
    files::gc_orphan_uploads(&db, &file_storage).await;

    tokio::spawn(jobs::run_worker(
        jobs.clone(),
        jobs::PipelineDeps {
            db: db.clone(),
            storage: file_storage.clone(),
            embedder: embedder.clone(),
        },
    ));

    let schema = schema::build_schema_with_context(
        schema::SchemaContext {
            db,
            storage: Some(file_storage),
            embedder,
        },
        schema::FirstChunkTimeout::default().0,
    );

    let router = server::router_without_auth(schema);
    println!("dev API on http://127.0.0.1:{port}/graphql (NO token auth)");
    server::serve_router(listener, router).await?;

    Ok(())
}
