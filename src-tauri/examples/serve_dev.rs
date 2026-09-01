//! Dev helper: serves the GraphQL API on `http://127.0.0.1:3000` from the
//! real app data dir **without the per-launch token**, so the plain-web
//! frontend (`cd src/frontend && pnpm dev`) can talk to it for UI work.
//!
//! Localhost only, and launched manually — never bundled with the app.
//!
//! Usage: `cargo run --example serve_dev`

use privait_lib::{db, schema, server};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let port = 3000u16;

    // The web frontend expects the API at http://localhost:3000.
    let listener = std::net::TcpListener::bind(("127.0.0.1", port))?;

    let home = std::env::var("HOME").expect("HOME not set");
    let data_dir =
        std::path::PathBuf::from(home).join("Library/Application Support/app.privait.client");
    let db = db::init(&data_dir)?;

    let router = server::router_without_auth(schema::build_schema(db));
    println!("dev API on http://127.0.0.1:{port}/graphql (NO token auth)");
    server::serve_router(listener, router).await?;

    Ok(())
}
