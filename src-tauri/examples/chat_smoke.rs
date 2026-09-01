//! End-to-end chat smoke test against the real app data dir:
//! settings → subscription resolver → provider SSE → persisted messages.
//!
//! Usage: `cargo run --example chat_smoke [app-data-dir]`
//! (defaults to the macOS Tauri app data dir)

use futures_util::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let data_dir = std::env::args()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var("HOME").expect("HOME not set");
            std::path::PathBuf::from(home).join("Library/Application Support/app.privait.client")
        });

    let db = privait_lib::db::init(&data_dir)?;
    {
        let conn = db.get()?;
        let read = |key: &str| {
            privait_lib::db::get_setting(&conn, key)
                .ok()
                .flatten()
                .unwrap_or_default()
        };
        let (base_url, api_key, model) = (
            read("provider.baseUrl"),
            read("provider.apiKey"),
            read("provider.model"),
        );
        println!("provider.baseUrl = {base_url}");
        println!("provider.model   = {model}");
        if api_key.is_empty() {
            println!("provider.apiKey  = (none — local server)");
        } else {
            let len = api_key.chars().count().min(6);
            let prefix: String = api_key.chars().take(len).collect();
            println!("provider.apiKey  = {prefix}…");
        }
        if base_url.is_empty() || model.is_empty() {
            eprintln!("✗ provider is not configured (save it in Settings first)");
            std::process::exit(1);
        }
    }

    let schema = privait_lib::schema::build_schema(db.clone());
    let request = async_graphql::Request::new(
        r#"
        subscription Chat($conversationId: Int, $message: String!) {
            conversation(conversationId: $conversationId, message: $message) {
                __typename
                ... on SubscriptionConversationSuccess {
                    data { conversationId messageId messageChunk done }
                }
                ... on Error { message }
            }
        }
        "#,
    )
    .variables(async_graphql::Variables::from_value(
        async_graphql::value!({ "conversationId": null, "message": "Reply with exactly: pong" }),
    ));

    println!("\nstreaming:");
    let started = std::time::Instant::now();
    let mut stream = schema.execute_stream(request);
    let mut reply = String::new();
    let mut chunk_count = 0usize;
    let mut conversation_id = None;

    while let Some(response) = stream.next().await {
        let result = response.into_result();
        if let Err(errors) = &result {
            eprintln!("✗ graphql errors: {errors:?}");
            std::process::exit(1);
        }
        let data = serde_json::to_value(&result.unwrap().data)?;
        let item = &data["conversation"];
        match item["__typename"].as_str() {
            Some("SubscriptionConversationSuccess") => {
                let chunk_data = &item["data"];
                if chunk_data["done"].as_bool() == Some(true) {
                    println!(
                        "\n[done after {:.1?}, {chunk_count} chunks]",
                        started.elapsed()
                    );
                } else {
                    if conversation_id.is_none() {
                        conversation_id = chunk_data["conversationId"].as_str().map(String::from);
                    }
                    let chunk = chunk_data["messageChunk"].as_str().unwrap_or_default();
                    chunk_count += 1;
                    print!("{chunk}");
                    reply.push_str(chunk);
                }
            }
            Some("Error") => {
                eprintln!(
                    "\n✗ provider/resolver error: {}",
                    item["message"].as_str().unwrap_or("?")
                );
                std::process::exit(1);
            }
            other => eprintln!("\n✗ unexpected payload: {other:?}"),
        }
    }

    let conn = db.get()?;
    let persisted: String = conn.query_row(
        "SELECT content FROM messages WHERE role = 'ASSISTANT' ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    )?;
    let history: String = conn.query_row(
        "SELECT group_concat(role || ':' || substr(content, 1, 40), ' | ') FROM messages
         WHERE conversation_id = (SELECT MAX(id) FROM conversations)",
        [],
        |row| row.get(0),
    )?;

    println!("\n\nverification:");
    println!("  streamed reply : {reply:?}");
    println!("  persisted reply: {persisted:?}");
    println!("  message history: {history}");
    println!(
        "  conversation   : {} (visible in the app sidebar)",
        conversation_id.as_deref().unwrap_or("?")
    );

    if persisted == reply && !reply.is_empty() {
        println!("\n✓ chat works end-to-end");
    } else {
        eprintln!("\n✗ streamed reply did not persist correctly");
        std::process::exit(1);
    }

    Ok(())
}
