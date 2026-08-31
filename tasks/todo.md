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

## M2 — Chat parity (+ Settings UI pulled forward from M4) ✅

User decision: settings storage = the M1 `settings(key, value)` SQLite table (already live in `privait.db`); keychain only before RC.

### Backend (src-tauri) ✅

- [x] `db.rs`: migration v2 — `conversations.archived INTEGER NOT NULL DEFAULT 0`
- [x] `chunker.rs`: port of `chunker.ts` (sentence regex via fancy-regex, cl100k_base via tiktoken-rs) + all 5 ported tests pass + span/word-fallback/limits tests
- [x] `provider.rs`: `ChatProvider` trait (async-trait) + `OpenAiCompatProvider` — reqwest, hand-rolled SSE decoder, blank-defaults (`from_settings` returns None until configured)
- [x] `schema.rs`: Conversation/Message/Settings objects, all four mutations with Error unions, streaming `conversation` subscription (mpsc pump, kill switch, error arms)
- [x] `schema.snapshot.graphql` refreshed + reviewed (named `Conversation`/`Message` to match old SDL)
- [x] Tests: 46 total — subscription round-trip vs a mock OpenAI SSE endpoint, missing-conversation/not-configured/provider-error arms, kill-switch persists partial, mutations, settings validation, WS transport round-trip through the real resolver

### Frontend (src/frontend) ✅

- [x] `codegen.ts`: schema → `src-tauri/schema.snapshot.graphql`; codegen green
- [x] `apollo-chat-runtime.tsx`: `onCancel` stop-generation, `Error` payloads → toast + spinner reset, rename/archive/unarchive/delete persisted, archived threads loaded server-side via ThreadContext
- [x] Settings UI: `settings-dialog.tsx` (gear in Nav) → GetSettings/SaveSettings; Files page → placeholder until M3 (old page in git history; its generated types no longer exist in the live schema)
- [x] Verify: vite build green, eslint clean, `vitest run` 5/5, cargo fmt/clippy/test green

### Notes

- Schema additions (settings, rename/archive, `archived`) are intentional deviations from the frozen old schema — M4 parity gate becomes "diff clean minus auth minus these additions".
- Stop-generation design: frontend unsubscribes → async-graphql drops the stream → mpsc send fails → task persists accumulated chunks and aborts the provider request. No new schema surface needed.

### Live chat verification (user provider: Featherless / GLM-5.3-Flash)

- [x] `cargo run --example chat_smoke` — real app DB: settings → subscription → provider SSE → persisted USER/ASSISTANT rows all green ("pong", 2 chunks, 3.3s). Harness kept at `src-tauri/examples/chat_smoke.rs` for repeatable smoke tests.

### Review (M2)

- **Kill-switch mechanics**: no new schema surface — the stop button unsubscribes (graphql-ws `complete`), async-graphql drops the subscription stream, the pump task sees the failed mpsc send, aborts the provider request, and persists what streamed *before* the drop (accumulate-after-send keeps the aborted chunk out). Same path covers tab/app close.
- **Streaming uses a dedicated mpsc per subscription**, not a broadcast channel as sketched in the plan — one subscriber per turn, so point-to-point is simpler and drop detection comes free.
- **Subscription errors ride the union** (`Error` arm as a stream item), matching the old Pothos behavior the frontend checks for; the runtime now toasts them and releases the composer (old code left the spinner stuck).
- **Check order in the subscription**: conversation existence → provider config → messages; provider-unconfigured errors only surface once the conversation resolves (keeps "Conversation not found" diagnosable).
- **Schema naming**: Rust-internal `GqlConversation`/`GqlMessage` are SDL-named `Conversation`/`Message`; `#[Object(name = ...)]` renames (not `#[graphql]` on the struct) for `#[Object]`-based types.
- **Chunker port is byte-faithful**: JS quirks preserved (segments keep leading whitespace; multi-segment chunks are whitespace-normalized joins so span slices only match after normalization; whole-text-smaller-than-overlap re-emits the tail). All 5 JS tests pass with identical expectations.
- **tiktoken-rs 0.6** has no feature flags (BPEs always bundled) — plain dep, `encode_ordinary` == JS `encode`.
- **Files page**: replaced with a placeholder — its generated file-upload types don't exist in the live schema until M3, and the M2 backend can't serve uploads anyway. Old page in git history.
- **SettingsDialog mounts only when opened** (avoids `useQuery` under provider-less test trees; also skips query setup entirely while closed).
- **Default config is blank** (user decision): chat errors with "not configured — set it up in Settings" until saved; the dialog placeholders hint at ollama.

### UI fixes (user-reported: broken colors + homepage crash)

- [x] Homepage crash: `RenameConversationDocument`/`ArchiveConversationDocument` were used but never imported — vite build doesn't typecheck, so it shipped. Imports added.
- [x] Colors: index.html body had `bg-white dark:bg-neutral-500` (mid-gray wash); index.css was missing the entire shadcn token palette; tailwind.config.js had no token mappings for the classes assistant-ui uses (`bg-muted`, `text-muted-foreground`, `border-border`, ...). Restored the standard shadcn "neutral" CSS-variable palette + tailwind color map + `body { @apply bg-background text-foreground }`; `root.tsx` invalid `text-dark` class replaced.
- [x] Fixed pre-existing tsc errors (Apollo v4 generics, vitest 3 `vi.fn` signature, unused import) — `pnpm exec tsc -b` is now green and part of the verification flow.
- [x] Verified in a browser against vite: dark + light modes render correctly, no crash, chat + settings dialog render.

## Next

M3 — Files + RAG parity (restore the real Files page from git history when its schema lands).

## CI note (M1 wrap-up)

- Legacy CI plumbing dropped on user request (was scheduled for parity): docker-compose/Postgres/db-setup steps and `src/server` tests removed; `test-and-lint` job renamed `frontend` and now runs lint + frontend vitest only. `src/server` stays frozen in the repo (still linted) until M4 deletes it.

## Test additions (M1 hardening, user-approved)

- Rust (+5 → 18 tests): schema SDL snapshot (`src-tauri/schema.snapshot.graphql`, refresh with `PRIVAIT_UPDATE_SCHEMA_SNAPSHOT=1 cargo test`); FK cascade on conversation delete; cosine ≥0.5 similarity threshold over KNN results (app-side filter pinned); WS upgrade rejected on wrong/missing token.
- Frontend (+4 → 5 tests): Apollo link-chain runtime test — queries → httpLink (+URL), auth header only in Tauri mode, WS client gets `?token=` URL, upload link registered with base URL. Mocks `lib/tauri`, `graphql-ws`, upload link.
- Deferred: webview e2e (tauri-driver), multipart upload round-trip (M3), apalis retry behavior (wire retry layer with the real M3 handler).