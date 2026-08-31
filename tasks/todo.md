# Tauri MVP — tasks

Source of truth: `tauri_mvp.md`. This file tracks the current milestone's working checklist.

## M0 — Scaffold ✅

- [x] `src-tauri/`: Tauri 2 + axum + async-graphql skeleton (token-auth'd localhost server, free port)
- [x] `tauri.conf.json`: `devUrl` → Vite :4000, `beforeDevCommand` boots frontend
- [x] Tauri command `server_info` returns base URL + per-launch token; frontend `lib/tauri.ts` + `resolveBaseApiUrl()` seam
- [x] `@tauri-apps/cli` (root) + `@tauri-apps/api` (frontend) deps; `pnpm app:dev` script
- [x] CI: `cargo fmt/clippy/test` job added; existing pnpm job untouched
- [x] Verify: cargo fmt/clippy/test green; `pnpm tauri dev` opens existing UI, server boots in-process

## M1 — Core plumbing ✅

- [x] `db.rs`: rusqlite pool (r2d2) over app-data `privait.db`, WAL/FK pragmas, user_version migrations (conversations, messages, files, settings + vec0 `file_chunks`/`memories`)
- [x] sqlite-vec: vendored v0.1.9 amalgamation compiled in build.rs (SQLITE_CORE), registered via `sqlite3_auto_extension` — crates.io wrapper pins rusqlite ^0.31 which conflicts with apalis-sqlite's sqlx (libsqlite3-sys 0.30)
- [x] vec0 spike test: KNN top-k with auxiliary columns (384-dim, cosine)
- [x] `jobs.rs`: sqlx `Pool<Sqlite>` over `jobs.db`, apalis `SqliteStorage<ProcessFileJob>` + `push_job` wrapper, worker boots in background; stub handler until M3
- [x] `schema.rs`: currentUser → local user, shared `Error` object, settings storage, `ping` subscription for the WS smoke
- [x] `server.rs`: WS endpoint (`graphql-transport-ws`, via `GraphQLSubscription` service) token-gated via `?token=` (browser WS can't set headers), multipart-ready body limit (8MB)
- [x] Frontend: async bootstrap → Apollo links (httpLink + GraphQLWsLink + upload link), delete login/magic-link pages, AuthRoute, jwt hook, logout UI; added graphql-ws dep
- [x] Streaming smoke: WS integration test round-trips `ping` (init → ack → 3 ticks → complete); `tauri dev` smoke shows app booting to chat, 6/6 webview GraphQL requests 200, 0×401, dbs created
- [x] Verify: cargo fmt/clippy/test green (13 tests); vite build + eslint green

### Review (M1)

- **sqlite-vec vendoring deviation**: the crates.io `sqlite-vec` crate requires rusqlite ^0.31 while `apalis-sqlite` pulls sqlx 0.8 (libsqlite3-sys ^0.30.1) — incompatible under one `links = "sqlite3"`. Fix: vendor the official v0.1.9 amalgamation (`src-tauri/sqlite-vec/`), compile via build.rs with `SQLITE_CORE`, register with `sqlite3_auto_extension`. Same library, same version; version-pinned by vendoring. Attribution in `src-tauri/sqlite-vec/README.md`.
- **Error union arms + Upload scalar**: shared `Error` object and multipart-capable endpoint exist; concrete unions/`Upload` registration land with the first ported mutations (M2 `deleteConversation`, M3 `uploadFile`).
- **Auth leftovers**: the avatar is now static (no logout menu — single-user app); `baseApiUrl` kept for the plain-web dev flow; token header only added in Tauri mode.
- Apollo v4 note: `GraphQLWsLink` lives at `@apollo/client/link/subscriptions` (`link/ws` is the legacy subscriptions-transport-ws entry and breaks vite build).
- jobs.db uses sqlx (apalis's stack), content DB uses rusqlite — separate files per plan; never point both at one file.

## Review (M0)

- `src-tauri/src/server.rs` — axum + async-graphql skeleton: binds `127.0.0.1:0` (sync, safe from Tauri's non-async `setup` hook), per-launch 32-char bearer token via axum middleware, CORS allowlist for dev (:4000) + tauri:// origins, `health` query. 5 unit tests cover token auth + free-port bind.
- `server_info` command hands `{ baseUrl, token }` to the webview; `resolveBaseApiUrl()` in `consts.ts` is the seam M1's Apollo rewiring plugs into. Web dev flow untouched.
- Fixed pre-existing build break: `main.tsx` imported `ApolloProvider` from `@apollo/client` (v3 path); v4 exports it from `@apollo/client/react`. `vite build` had never been in CI, so only dev's stale `.vite` cache masked it.
- Smoke test passed: app window opened, vite 200, API server 401 without token on free port. Known issue: stale `src/frontend/node_modules/.vite` cache referenced apollo v3 after upgrade — cleared; `rm -rf src/frontend/node_modules/.vite` if deps ever resolve wrong again.
- Left as-is per user: frontend `pnpm test` run (vitest watch mode; not part of M0 verification).

## Next

M2 — Chat parity (SQLite + sqlite-vec, apalis `jobs.db`, schema skeleton, Apollo repoint, WS subscription smoke test).

## CI note (M1 wrap-up)

- Legacy CI plumbing dropped on user request (was scheduled for parity): docker-compose/Postgres/db-setup steps and `src/server` tests removed; `test-and-lint` job renamed `frontend` and now runs lint + frontend vitest only. `src/server` stays frozen in the repo (still linted) until M4 deletes it.