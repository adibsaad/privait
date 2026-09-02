# Privait

Privait is a private, local-first AI workspace — a Tauri desktop app (Rust core, React frontend) with chat, file grounding (RAG), and local embeddings. All data lives on your device; the only network traffic is to the chat provider you configure.

## Architecture

- **Shell:** Tauri 2 wrapping the React UI (`src/frontend/`)
- **Core:** in-process Rust server (`src-tauri/`) — axum + async-graphql, SQLite + sqlite-vec, apalis job queue, OpenDAL local file storage, fastembed (bge-small) embeddings
- **Inference:** any OpenAI-compatible provider (OpenRouter, ollama, LM Studio, …) configured in Settings

See [roadmap.md](roadmap.md), [vision.md](vision.md), and [tauri_mvp.md](tauri_mvp.md) for direction and history.

## Dev

1. Install pnpm and Rust (rustup)
2. Run `pnpm install`
3. Run `pnpm app:dev` — boots Vite (:4000) and the Tauri window with the in-process API server

Frontend-only work can also run against a token-free server backed by the real app DB: `cargo run --example serve_dev` (in `src-tauri/`), then `pnpm start:frontend`.

Useful commands:

- `pnpm codegen` — regenerate typed GraphQL documents from `src-tauri/schema.snapshot.graphql`
- `pnpm schema:parity` — gate that the GraphQL schema still matches the original Fastify/Pothos contract (runs in CI)
- `pnpm test` — frontend vitest suite
- `cd src-tauri && cargo test` — Rust test suite

## Build

Run `pnpm app:build` — produces the `.app` and `.dmg` under `src-tauri/target/release/bundle/`.

Third-party license notices: regenerate with `cd src-tauri && cargo about generate about.hbs > resources/licenses.html`.

## License

[AGPL-3.0](LICENSE)