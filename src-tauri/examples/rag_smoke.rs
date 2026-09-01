//! RAG smoke test against the real app data dir: embeds a query with the
//! real bge-small model and prints the top-4 matching chunks/memories.
//!
//! Usage: `cargo run --example rag_smoke "your query" [app-data-dir]`

use privait_lib::embeddings::Embedder as _;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let query = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "what do the uploaded files say about embeddings?".to_string());

    let data_dir = std::env::args()
        .nth(2)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var("HOME").expect("HOME not set");
            std::path::PathBuf::from(home).join("Library/Application Support/app.privait.client")
        });

    let db = privait_lib::db::init(&data_dir)?;
    let embedder = privait_lib::embeddings::FastEmbedder::new(data_dir.join("models"));

    let started = std::time::Instant::now();
    let query_embedding = embedder.embed(&query).await?;
    println!(
        "query embedded in {:.1?} (dim {})",
        started.elapsed(),
        query_embedding.len()
    );

    let input = privait_lib::retrieval::RetrievalInput {
        db: &db,
        query_embedding: &query_embedding,
    };

    let chunks = privait_lib::retrieval::related_file_chunks(&input).map_err(|e| e.to_string())?;
    println!("\ntop file chunks (≥0.5 similarity):");
    for chunk in &chunks {
        println!("  • {}", chunk.replace('\n', " "));
    }
    if chunks.is_empty() {
        println!("  (none)");
    }

    let memories = privait_lib::retrieval::related_memories(&input).map_err(|e| e.to_string())?;
    println!("\ntop memories (≥0.5 similarity):");
    for memory in &memories {
        println!("  • {memory}");
    }
    if memories.is_empty() {
        println!("  (none)");
    }

    if chunks.is_empty() && memories.is_empty() {
        eprintln!("\n✗ no retrieval hits (upload a file first)");
        std::process::exit(1);
    }
    println!("\n✓ retrieval works against the real embeddings");
    Ok(())
}
