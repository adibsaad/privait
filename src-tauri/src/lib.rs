pub mod chunker;
pub mod db;
pub mod embeddings;
pub mod files;
pub mod jobs;
pub mod provider;
pub mod retrieval;
pub mod runs;
pub mod schema;
pub mod server;
pub mod storage;

use serde::Serialize;
use tauri::Manager;

/// Connection details for the in-process API server, handed to the webview
/// via the `server_info` command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub base_url: String,
    pub token: String,
}

#[tauri::command]
fn server_info(info: tauri::State<'_, ServerInfo>) -> ServerInfo {
    info.inner().clone()
}

/// HTML of the cargo-about-generated third-party license notices bundled
/// with the app (`src-tauri/resources/licenses.html`, regenerated with
/// `cd src-tauri && cargo about generate about.hbs > resources/licenses.html`).
#[tauri::command]
fn third_party_licenses(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .resolve(
            "resources/licenses.html",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|err| format!("failed to resolve licenses resource: {err}"))?;
    std::fs::read_to_string(path).map_err(|err| format!("failed to read licenses: {err}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|err| format!("failed to resolve app data dir: {err}"))?;

            let db =
                db::init(&data_dir).map_err(|err| format!("failed to open database: {err}"))?;

            let jobs = tauri::async_runtime::block_on(jobs::Jobs::init(&data_dir.join("jobs.db")))
                .map_err(|err| format!("failed to open job queue: {err}"))?;

            // Files live as plain files under app-data/files; the embedding
            // model cache lives under app-data/models (downloaded on first
            // use, not at startup).
            let storage = std::sync::Arc::new(
                storage::Storage::fs(&data_dir.join("files"))
                    .map_err(|err| format!("failed to open file storage: {err}"))?,
            );
            let embedder: std::sync::Arc<dyn embeddings::Embedder> =
                std::sync::Arc::new(embeddings::FastEmbedder::new(data_dir.join("models")));

            // Uploads happen on send; anything stored but never attached to a
            // message is a dead end (aborted send) — sweep it at startup.
            {
                let db = db.clone();
                let storage = storage.clone();
                tauri::async_runtime::spawn(async move {
                    files::gc_orphan_uploads(&db, &storage).await;
                });
            }

            let worker_jobs = jobs.clone();
            tauri::async_runtime::spawn(jobs::run_worker(
                worker_jobs,
                jobs::PipelineDeps {
                    db: db.clone(),
                    storage: storage.clone(),
                    embedder: embedder.clone(),
                },
            ));

            let token = server::generate_token();
            let listener =
                server::bind().map_err(|err| format!("failed to bind local API server: {err}"))?;
            let port = listener.local_addr()?.port();
            let base_url = format!("http://127.0.0.1:{port}");
            println!("API server listening on {base_url}");

            let schema = schema::build_schema_with_context(
                schema::SchemaContext {
                    db,
                    storage: Some(storage),
                    embedder,
                },
                schema::FirstChunkTimeout::default().0,
            );
            let listener_token = token.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = server::serve(listener, schema, listener_token).await {
                    eprintln!("API server stopped: {err}");
                }
            });

            app.manage(ServerInfo { base_url, token });
            app.manage(jobs);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![server_info, third_party_licenses])
        .run(tauri::generate_context!())
        .expect("error while running Privait");
}
