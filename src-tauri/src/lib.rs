mod server;

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
            let bound = server::BoundServer::bind()
                .map_err(|err| format!("failed to bind local API server: {err}"))?;

            println!("API server listening on {}", bound.base_url);
            app.manage(ServerInfo {
                base_url: bound.base_url.clone(),
                token: bound.token.clone(),
            });

            tauri::async_runtime::spawn(async move {
                if let Err(err) = bound.serve().await {
                    eprintln!("API server stopped: {err}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![server_info])
        .run(tauri::generate_context!())
        .expect("error while running Privait");
}
