# Privait — Roadmap

See [vision.md](vision.md) for mission, principles, and product pillars.

## Architecture Direction

Today Privait is a client/server web app (React + Fastify/Postgres/pgvector/SQS/Redis/S3). That stack was shaped like a multi-user cloud product. The destination is a **Tauri desktop app** — Rust backend, TypeScript frontend — single-user, everything in-process:

- **Shell:** Tauri (Rust) wrapping the existing React UI.
- **Core:** a Rust backend replaces the Node server; the cloud services move in-process:
  - Postgres/pgvector → SQLite + sqlite-vec (or LanceDB)
  - SQS worker → in-process job queue
  - Redis pub/sub → in-process events
  - S3 → local filesystem
  - Fastify/Pothos → a Rust GraphQL server (e.g., async-graphql) implementing the same API contract
- **Inference:** a provider abstraction from day one. The MVP ships OpenAI-compatible providers (OpenRouter and no-logging/zero-retention providers) to accelerate early development; llama.cpp (or ollama) plugs into the same interface, and local inference must land before RC.
- **What carries over:** the React frontend survives largely intact (the assistant-ui runtime is the reusable heart); the existing GraphQL schema becomes the porting spec for the Rust core.

## Roadmap Sketch

1. **Desktop shell** — Tauri app (Rust core, TypeScript frontend), local SQLite, file-based note storage. Rebuild the existing chat + file functionality on the new stack; inference via OpenAI-compatible providers (OpenRouter etc.), with the provider abstraction built so llama.cpp/ollama can land before RC.
2. **Journal core** — daily entries, calendar, Markdown vault, search. The app must stand alone as a good journal.
3. **Remember** — embedding pipeline over the vault, grounded chat, inspectable Memories.
4. **Reflect** — weekly reviews, pattern surfacing, guided prompts from real history.
5. **Think** — structured thinking modes, visible reasoning.
6. **Beyond** — optional E2E-encrypted sync, plugins/themes, mobile companion.

## Decisions

- **Core:** Rust backend, TypeScript frontend, in a Tauri shell. No Node sidecar.
- **Editor:** a rich Markdown editor (CodeMirror-based), not a plain textarea.
- **Model strategy:** OpenAI-compatible providers (e.g., OpenRouter) for the MVP to accelerate early development; llama.cpp/ollama built behind the same provider abstraction. Some form of local inference must ship before RC.
- **License:** AGPL-3.0.