pub mod chunker;
pub mod db;
pub mod jobs;
pub mod provider;
pub mod schema;
pub mod server;

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
            tauri::async_runtime::spawn(jobs::run_worker(jobs.clone()));

            let token = server::generate_token();
            let listener =
                server::bind().map_err(|err| format!("failed to bind local API server: {err}"))?;
            let port = listener.local_addr()?.port();
            let base_url = format!("http://127.0.0.1:{port}");
            println!("API server listening on {base_url}");

            let schema = schema::build_schema(db);
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
        .invoke_handler(tauri::generate_handler![server_info])
        .run(tauri::generate_context!())
        .expect("error while running Privait");
}
