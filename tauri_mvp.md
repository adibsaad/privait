# Privait — Tauri MVP Plan

Rebuild the current app (React + Fastify/Postgres/pgvector/SQS/Redis/S3, see `src/server`) as a Tauri desktop app per [roadmap.md](roadmap.md) phase 1: **desktop shell with chat + file/RAG parity, everything in-process**. This doc is the build checklist; vision and principles stay in [vision.md](vision.md).

## MVP Scope

Feature parity with what works today — nothing more:

| Feature today (web app) | Tauri MVP |
|---|---|
| Magic-link email auth | **Dropped.** Single user, local app. No login. |
| Chat: multiple conversations, persisted messages, token streaming, thread sidebar (new/rename/delete) | Rebuilt; rename/archive now **persisted** (they were client-only before) |
| Message edit UI / branch picker | UI kept; branch persistence still out of scope (was never server-backed) |
| RAG grounding: top-4 Memories + top-4 file chunks injected as system context | Rebuilt on sqlite-vec |
| File upload (PDF/TXT/CSV/MD/HTML ≤5MB) → extract → chunk → embed → status PROCESSED → list/delete | Rebuilt in-process (job queue + local FS instead of SQS + S3) |
| Local inference (SmolLM2-360M via node-llama-cpp, nomic-embed embeddings) | Provider abstraction (below); OpenAI-compatible provider for MVP, local providers before RC |
| Theme toggle, toasts, error page | Kept as-is |

Out of scope (later phases): journal/calendar/vault (roadmap 2), Memories CRUD UI, chat attachments (UI scaffolding exists but was never wired), tool calling, Reflect/Think pillars, sync, auto-update, code signing.

## Architecture

```
┌────────────────── Tauri 2 shell ──────────────────┐
│  Webview: React frontend (kept, small diffs)      │
│    Apollo → http://127.0.0.1:<port>/graphql       │
│  Rust core (src-tauri):                           │
│    axum + async-graphql  ← replaces Fastify/Pothos│
│    SQLite + sqlite-vec   ← replaces Postgres/pgvector
│    tokio broadcast       ← replaces Redis pub/sub │
│    apalis workers         ← replaces SQS worker    │
│    OpenDAL (fs backend)  ← replaces S3/RustFS     │
│    provider trait        ← replaces node-llama-cpp│
└───────────────────────────────────────────────────┘
```

### Stack mapping (old → new)

| Today | Tauri | Notes |
|---|---|---|
| Fastify + graphql-yoga + Pothos | axum + async-graphql (in-process, localhost only) | Existing `schema.graphql` is the porting spec |
| Subscriptions over graphql-sse | async-graphql subscriptions over WebSocket (`graphql-ws` protocol) | Frontend swaps `SSELink` → `GraphQLWsLink`; chunk payload shape unchanged |
| Postgres + pgvector (7 tables) | SQLite + sqlite-vec (5 tables) | User/MagicLink machinery deleted |
| Redis pub/sub | tokio broadcast channels | Redis was only used for subscription fan-out |
| SQS worker (`process-file`) | apalis-sqlite workers (own `jobs.db` file) | Task fns replace `jobs/handler.ts`; retries/timeouts/cron built in |
| S3/RustFS | OpenDAL `Operator` (services-fs) over app-data-dir `files/` | Original name already lives in the `files` table — drop the object-metadata trick |
| node-llama-cpp (chat + embed) | Rust provider abstraction (below) | |
| unpdf | `pdf-extract` (pure Rust) | Swap to pdfium-render if extraction quality disappoints |
| tiktoken cl100k_base 512/64 | `tiktoken-rs`, same params | |
| Magic-link auth (JWT, localStorage) | deleted | |

### Decisions (inherited from roadmap + made here)

- **Keep the GraphQL API contract** (roadmap decision): async-graphql re-implements the current schema so `apollo-chat-runtime.tsx` and typed-document-node/GraphQLSP workflow survive. Alternatives rejected for now: Tauri commands + events (more idiomatic, but rewrites the whole Apollo data layer), and `tauri-plugin-graphql` (right idea — async-graphql over IPC, no socket — but released versions target Tauri v1/async-graphql 5, it's a dormant single-maintainer project with no stability guarantee, and only ships a urql adapter; revisit if it gains Tauri 2 support).
- **Harden the localhost server:** bind `127.0.0.1` and require a random per-launch token (checked by axum middleware) so no other local process can reach the GraphQL endpoint; the webview learns the base URL from a Tauri command.
- **Streaming transport:** WebSocket subscriptions (async-graphql native), not SSE.
- **Embeddings stay local from day one:** `fastembed-rs` (pure-Rust ONNX, bge-small-en-v1.5 — the model we already download but never use). Cloud embeddings would violate "private by default" for a background pipeline. Provider-based embeddings can slot in behind the abstraction later.
- **Chat provider abstraction:**

```rust
#[async_trait]
trait ChatProvider {
    fn id(&self) -> &str;
    async fn stream_chat(&self, req: ChatRequest) -> Result<MessageStream>; // Stream<Item = String>
    async fn stream_chat_with_tools(...) // reserved, not in MVP
}
```
  MVP ships one impl: `OpenAiCompatProvider` (reqwest, SSE parsing, configurable `base_url` + `api_key`). One client covers OpenRouter/OpenAI **and** ollama / LM Studio / llama.cpp-server (all speak OpenAI-compatible HTTP) — so local-via-local-server works immediately; a native in-process llama.cpp binding (e.g. `llama-cpp-2`) plus a model manager is the "before RC" work. Provider config lives in a settings table/UI (keychain for API keys later).
- **Repo layout:** keep `src/frontend/` where it is; add `src-tauri/`. `src/server/` stays frozen until parity, then deleted (git history keeps it; enables behavior diffing during the rebuild). Docker compose / Procfile / overmind removed at parity.
- **Job queue: apalis** (apalis-sqlite), not a hand-rolled loop — direct replacement for the SQS mental model, with retries, timeouts, and graceful shutdown for free; apalis-cron covers scheduled jobs (weekly reviews in the Reflect phase) later. Contain the 1.0-rc API churn: pin the exact version, route all usage through our own `push_job`/handler module. The queue lives in its own `jobs.db` file (apalis uses sqlx; the content DB stays rusqlite for sqlite-vec extension loading — don't mix two SQLite stacks on one file).
- **Storage: OpenDAL** (`services-fs` feature only) over the app-data-dir `files/` — one `Operator` API (write/read/stat/delete/list) replaces `services/s3.ts`, files stay plain files on disk (vision principle 2), tests use the built-in memory service instead of tempdirs, and the Beyond-phase sync/cloud-backup work becomes a backend swap. Pin the version (0.x churn) and keep it behind our own small storage module.
- **Data:** fresh start, no migration (today's data is throwaway dev data). App data lives in the OS app-data dir: `privait.db`, `jobs.db`, `files/`, `models/`.

### SQLite data model

```
conversations(id, title, created_at, updated_at)
messages(id, conversation_id → conversations, role, content, created_at)
files(id, original_name, file_name, mime_type, size, kind, status, processed_at, created_at)
file_chunks(id, file_id → files, content, embedding f32[384])        -- sqlite-vec vec0, cosine
memories(id, content, embedding f32[384])                            -- sqlite-vec vec0, cosine
settings(key, value)                                                 -- provider config
```
Job queue tables live in a separate `jobs.db` managed by apalis — the content DB holds only user-visible data.

Note: embedding dim becomes 384 (bge-small) instead of 768 (nomic). Single-user → no `user_id` anywhere; no soft deletes.

### Porting spec: GraphQL surface

Queries: `currentUser` (resolve locally), `conversations`, `conversation(id)`, `files`.
Mutations: `deleteConversation(id)`, `uploadFile(file)`, `deleteFileUpload(id)`. (`magicLink`/`completeMagicLink` deleted.)
Subscription: `conversation(conversationId, message)` → `ConversationMessageChunk { conversationId, previousMessageId, messageId, messageChunk, done }` — preserve exactly; it drives `apollo-chat-runtime.tsx`.
Errors: keep the `Error { message }` / `XSuccess` union pattern.

## Milestones

### M0 — Scaffold
- [ ] Add `src-tauri/` (Tauri 2 + axum + async-graphql skeleton), wire `devUrl` → Vite :4000
- [ ] Rust server boots in-process on a free localhost port; frontend gets the URL via a Tauri command; app opens to existing UI
- [ ] CI: add `cargo fmt/clippy/test` jobs; keep existing pnpm jobs (docker-compose steps removed at parity, not now)

### M1 — Core plumbing
- [ ] SQLite migrations + rusqlite pool (content DB), sqlite-vec extension loaded; apalis worker runtime boots with its own `jobs.db`
- [ ] async-graphql schema skeleton: error unions, `Upload` scalar (multipart), `currentUser`, settings storage
- [ ] Frontend: repoint Apollo (httpLink uri, `GraphQLWsLink`, upload link), delete login/magic-link pages, `AuthRoute`, jwt hook
- [ ] Streaming smoke test: trivial subscription round-trips to the webview

### M2 — Chat parity
- [ ] Port `ChatProvider` trait + `OpenAiCompatProvider` (streaming SSE → broadcast channel)
- [ ] Resolvers: `conversations`, `conversation`, `deleteConversation`, `conversation` subscription (create conversation, persist USER + ASSISTANT messages, stream chunks, finalize)
- [ ] Frontend: verify `apollo-chat-runtime.tsx` works with minimal diffs; persist rename/archive; stop-generation (kill switch on backend)
- [ ] Port chunker + streaming unit tests from `src/server/llm/chunker.test.ts`

### M3 — Files + RAG parity
- [ ] `uploadFile`/`files`/`deleteFileUpload` → OpenDAL fs operator + `files` table, same validation (5MB, MIME allowlist)
- [ ] `process-file` apalis task: pdf-extract / read text → tiktoken-rs chunk (512/64) → fastembed-rs embeddings → `file_chunks`
- [ ] Retrieval: cosine top-4 memories + top-4 chunks (≥0.5) injected as system context in the chat pipeline
- [ ] Files page parity: status UPLOADED→PROCESSED, delete removes file + chunks

### M4 — Ship the shell
- [ ] Schema parity check: introspected async-graphql schema diffs clean against old `schema.graphql` (minus auth)
- [ ] Settings UI (provider base URL / API key / model) + provider smoke-tested against OpenRouter and a local ollama
- [ ] `tauri build` → dmg (macOS first), app icon, AGPL notices
- [ ] Delete `src/server/`, docker/, Procfile, ElasticMQ/Mailpit/RustFS refs; update README + CI
- [ ] Manual smoke checklist passes: cold start < 2s, chat streams, file processes end-to-end, no network except provider calls

## Testing & verification

- **Rust:** unit tests (chunker params, embedding store, `push_job`/handler dispatch), integration tests for resolvers against in-memory SQLite.
- **Objective parity gate:** generated-schema diff (M4) + side-by-side manual run of old web app vs Tauri app performing the same chat/file flows.
- **Frontend:** existing vitest suite keeps passing; add a runtime test for the swapped link chain.
- **Privacy check:** no outbound requests except configured provider base URL (verify via logs + Little Snitch/manual).

## Risks / open questions

- **sqlite-vec maturity** — fallback: LanceDB (Rust-native). Decide early in M1 with a perf/robustness spike.
- **PDF extraction quality** — `pdf-extract` is rough; pdfium-render (bundled dylib) is the fallback.
- **Local-server dependency for local chat** — OpenAI-compat provider means ollama/LM Studio users must run that server until the native llama.cpp binding lands (pre-RC). Acceptable for MVP; call it out in UI copy.
- **API key storage** — settings table for MVP, OS keychain (or Tauri stronghold) before RC.
- **apalis is 1.0-rc** — pin the exact version; all usage goes through our own `push_job`/handler module so churn can't leak into resolvers.
- **WS subscriptions in webview** — verify no CORS/origin friction between the Tauri webview and the localhost axum server early (M1 smoke test exists for this).