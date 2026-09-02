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

### Sidebar redesign (modeled on Claude desktop)

- [x] Single full-height left sidebar (`app-sidebar.tsx`, shadcn Sidebar): logo top, Chat/Files nav, thread list always visible regardless of route, theme toggle + Settings pinned bottom, avatar dropped
- [x] Nav header (`nav.tsx`) and chat-embedded `threadlist-sidebar.tsx` deleted; ThreadProvider + ApolloChatRuntimeProvider hoisted to Root so the thread list survives navigation; `assistant.tsx` collapsed into direct `<Thread />`
- [x] App shell made a definite-height layout: sidebar wrapper `h-svh overflow-hidden` (the vendored shadcn version's `min-h-svh` + `h-full` combo collapsed the sidebar to content height); mobile keeps the built-in Sheet + SidebarTrigger
- [x] Error page simplified (no header dependency); theme toggle verified functional (Light/Dark/System persist via localStorage)
- [x] Verified in browser: sidebar 256×800, Files route keeps sidebar + thread list, active nav state, settings dialog, theme switch

### Follow-up fixes (user-reported)

- [x] New conversations title themselves from the first prompt (whitespace collapsed, word-boundary truncate at 50 chars + ellipsis, empty prompt keeps "Untitled chat" fallback) — a summarizer model takes over later; 4 Rust unit tests + assertion in the streaming test
- [x] Sidebar thread selection now navigates: `onSwitchToThread`/`onSwitchToNewThread` call `navigate('/chat')` (was a no-op when already on /files); verified in browser from /files

### Sidebar chat highlight (user-reported: no visible selection)

- [x] Root cause: `data-active:bg-neutral-100` is Tailwind *v4* bare-data syntax; the repo's v3.4 silently ignores it, so the highlight never generated. Converted to `data-[active=true]:` across thread-list.tsx (item, "New Thread" button, More-options reveal).
- [x] New `serve_dev` example (`cargo run --example serve_dev`): token-free API on :3000 from the real app DB so plain-web UI work is testable in a browser; extracted `router_without_auth`/`serve_router` in server.rs (prod path unchanged, token gate intact).
- [x] CORS: origin allowlist → loopback predicate (Vite can drift to other ports; CORS is browser-only mitigation, the bearer token gates other local callers).
- [x] Verified in browser against live data: active thread bg neutral-800 in dark (transparent on inactive), highlight follows clicks, thread messages load.

### Fix: empty sidebar after the CORS refactor (user-reported)

- [x] Root cause: the router refactor put the bearer-token middleware OUTSIDE the CORS layer; browser preflight OPTIONS carries no Authorization header → 401 → allConversations failed → sidebar loaded empty (chats all intact in the DB; purely a transport bug). My `serve_dev` browser check missed it because that example has no auth layer.
- [x] Restored layer order: auth INSIDE CORS (route → auth → cors → body limit) in `build_router`; `cors_layer()`/`body_limit()` factored out.
- [x] Tests (3): `cors_preflight_is_answered_without_credentials` (preflight → 200 + allow-origin on the token-gated router; wrong-token POST still 401s), `cors_allows_tauri_and_any_loopback_browser_origin`, `cors_rejects_non_utf8_origins`. 53 Rust tests green, clippy clean.

### Sidebar follow-ups (user-reported)

- [x] New-chat flow is now fully optimistic: sending the first message immediately shows + selects a pending "New Chat" sidebar entry (withOptimisticThread / reconcileThreadList) while the optimistic message + loading state render in the thread; first chunk swaps in the real id and title. (+5 chat-threads tests → 23 frontend)
- [x] Streaming hardened: a provider that stalls anywhere before the first chunk (connection, headers, or tokens) now fails loudly after a 30s budget ("Provider did not respond within 30s") instead of an endless spinner — budget injectable via build_schema_with_timeout for tests.
- [x] "Missing" chats explained: they were ARCHIVED via the ··· menu and the sidebar had no archived section — invisible and unrecoverable. Thread list now renders an Archived section (fallback-titled, muted) with Unarchive + Delete; unarchive persists via archiveConversation(archived:false). Verified in browser against the live DB.

### Settings window revamp (user follow-up)

- [x] Archived chats hidden from the main sidebar again (archived section removed from thread-list.tsx).
- [x] Settings dialog redesigned: internal left-rail navigation with two sections — `Provider` (existing base URL / API key / model + Save) and `Archived chats` (titles only, Unarchive per row, empty state). Unarchive uses the archiveConversation mutation and shares the normalized Apollo cache with the main thread list, so the sidebar updates instantly; toast on success.
- [x] Cleaned 72 stray `tsc -b` transpile artifacts (*.js) polluting src/ + eslint; artifacts gitignored.
- [x] Verified in browser against the live DB: main sidebar hides archived, settings lists them by title, unarchive moves them back instantly.

### Message action rows (user follow-up)

- [x] Assistant message: hover row keeps Copy only (Refresh + More/export removed); footer is a reserved min-h-6 slot with hover/focus-revealed buttons — hovering no longer shifts content below (measured 0px shift, live).
- [x] User message: dead Edit pencil removed (and dead EditComposer); Copy sits below the bubble, right-aligned, in a reserved min-h-7 row — same no-shift pattern.

## M3 — Files + RAG parity ✅

### Backend (src-tauri) ✅

- [x] `storage.rs`: OpenDAL wrapper (`=0.54.1`, services-fs + services-memory) behind a tiny module — production over app-data `files/`, tests use the in-memory service. Round-trip/delete tests (plain-files-on-disk pinned).
- [x] `files.rs`: port of `file-upload.ts` — same 5MB cap + MIME allowlist (same error strings), `<uuid>.<ext>` stored names replacing `uploads/{userId}/{cuid}`, store/list/delete (delete removes storage object + row + `file_chunks`).
- [x] `embeddings.rs`: `Embedder` trait + `FastEmbedder` (fastembed `=6.0.2`, bge-small-en-v1.5, 384-dim) with **lazy** model init (first-launch download doesn't block startup; lives in app-data `models/`) + deterministic `FakeEmbedder` for tests.
- [x] `jobs.rs`: real `process_uploaded_file` — storage read → pdf-extract (`=0.12.0`) / lossy utf-8 → ported chunker (512/64) → embed → `file_chunks` → status PROCESSED + processed_at. Worker closure captures `PipelineDeps { db, storage, embedder }` (no apalis data-layer API risk).
- [x] `retrieval.rs`: port of `query-embedding.ts` — KNN top-4 over memories + file_chunks, app-side similarity ≥ 0.5 filter; query embedded once per turn.
- [x] `schema.rs`: `files` query, `uploadFile`/`deleteFileUpload` mutations with Error unions (`MutationUploadFileSuccess { data: FileUpload! }`, `MutationDeleteFileUploadSuccess { data: Boolean! }` — old names), `FileUpload`/`FileType`/`FileStatus` SDL names match the old schema, `Upload` scalar (async-graphql default tempfile feature). Subscription now grounds turns: history → `Here are some related memories: …` → `Here are some related file chunks: …` → user message; embed failure degrades to an ungrounded turn (first-launch download) instead of failing chat.
- [x] `lib.rs`/examples wiring: real storage + embedder + queue in the app, `serve_dev`, and `chat_smoke`; new `rag_smoke` example (real-embedding retrieval against the live DB).
- [x] Schema snapshot refreshed (`Upload` scalar + `@specifiedBy` directive are new).
- [x] Tests: 78 Rust (from 53) — storage round-trips, validation table, stored-name uniqueness, store/delete round-trip, multipart upload through the real router (graphql-multipart-request-spec body), oversize/disallowed-MIME errors, upload → worker → PROCESSED end-to-end with chunk vectors, corrupt-PDF keeps UPLOADED, delete removes row+chunks+bytes ("File not found" preserved), retrieval threshold/ordering/dimension-guard, grounding system-context injection pinned message-by-message against a capturing mock provider, empty-grounding passthrough, files query shape.

### Frontend (src/frontend) ✅

- [x] Files page restored from git history (`uploadFile` + `allFiles` + `DeleteFile` documents, FileDrop, table, delete dropdown, toast on Error arm, `resetStore` on success); `createdAt` rendered via `new Date()`; empty state instead of the "No files found" dead frame.
- [x] `file-drop.tsx` input got `data-testid` for tests.
- [x] Codegen regenerated from the updated schema snapshot; Apollo upload link already splits `uploadFile` (M1).
- [x] Tests: +4 → 27 (list with status/date, empty state, delete-failure toast, upload flow via stub link asserting the File rides the mutation + UI refresh).
- [x] Verify: `tsc -b` green, vite build green, eslint 0 errors, `vitest run` 27/27.

### Live verification (real app data dir + real provider)

- [x] Browser: uploaded `browser-test.md` via drag-drop input → UPLOADED → worker processed 14 chunks → PROCESSED (bge model auto-downloaded to `models/` on first embed); delete via the row menu removed everything (`files` query empty).
- [x] `cargo run --example rag_smoke "…embeddings and retrieval…"` — top-4 chunks ≥0.5 retrieved with real bge embeddings against the live DB.
- [x] `cargo run --example chat_smoke` — grounded chat turn still streams + persists ("pong", 2 chunks, 2.9s).

### Review (M3)

- **fastembed `embed` is `&mut self`** → model wrapped in `Arc<tokio::sync::Mutex<…>>`, used from `spawn_blocking` with `blocking_lock`. Lazy init via `tokio::sync::OnceCell` so app startup never waits on the model download.
- **Upload push-job failure** rolls back the upload (storage + row) instead of stranding a file in UPLOADED forever; queue-less schemas (plain test `build_schema`) return a clean `File storage is not available` / skip the queue.
- **Multipart** needed no new feature in async-graphql v7 (default `tempfile` covers `Upload`); the axum extractor already routes multipart bodies through `receive_batch_body`.
- **Retrieval threshold stays app-side** (vec0 can't WHERE on distance) — the db.rs KNN test and retrieval tests pin the ≥0.5 behavior.
- Old `MockedProvider` can't deep-match a `File` variable, so the upload test drives the page with a stub `ApolloLink` (asserts operation name + File attachment + UI refresh) while the other three tests use `MockedProvider`.
- Files page ordering matches the old resolver (`id ASC`), not the old service (`createdAt DESC`).

## Files-in-chat rework (user decision after M3) ✅

Design: `file_arch.md`. Drives: uploads belong to chats, not a Files page.

- [x] Removed the Files page + nav (schema keeps `files`/`deleteFileUpload` unused) .
- [x] Migration v3: `files.message_id` (chips re-render per message; chat scope via join). Identifier refinement vs the `conversation_id` sketch in file_arch.md — documented there.
- [x] `uploadFile` runs the pipeline inline and returns PROCESSED (roll-back on failure); apalis worker stays wired but out of the send path.
- [x] Subscription takes `fileIds`, links them to the fresh user message (idempotent `message_id IS NULL` guard), grounds per-chat: KNN over all chunks filtered to the conversation's file ids app-side (sqlite-vec KNN breaks under JOINs). Empty message + files → synthesized "Please read the attached file(s) and respond." (bubble keeps chips, DB keeps ""); file-only first message titles the thread from the file name.
- [x] Frontend: assistant-ui attachment adapter (MIME allowlist mirrored), composer chips + paperclip, send gating (text-or-files), parallel uploads → `fileIds`, optimistic chips → persisted `Message.files` chips after reload; Files page deleted.
- [x] Startup orphan GC (app + serve_dev).
- [x] Tests: 81 Rust (+3: file-attach/grounding, file-only synthesis/title, idempotent relink, orphan GC, inline PROCESSED, rollback), 26 frontend (chips carry through reconciliation).
- [x] Live: attach → send with empty text → assistant recalls file facts; earlier chat files keep grounding their own chat; orphan files ground nothing; GC sweeps on start.

## M4 — Ship the shell ✅

Note: `src/server/graphql/generated/schema.graphql` was silently overwritten by codegen's legacy output path during the files-in-chat commit — the *original* Pothos SDL lives in git history (`6f687a0~1`); the parity diff uses a checked-in copy.

### 1. Schema parity check ✅

- [x] Historical SDL checked in at `src-tauri/schema-parity/old-schema.graphql` (from `git show 6f687a0~1`)
- [x] `scripts/schema-parity.mjs` (`pnpm schema:parity`): structural diff (types/fields/args/kinds, order-insensitive) old vs current snapshot; exits nonzero on diffs outside the reviewed expected set — and wired into CI (frontend job)
- [x] Result: **28 known, reviewed deviations, no unexpected diffs** — auth removals (`magicLink`/`completeMagicLink`/`AuthSuccessResponse`/`DateTime`), M2/M3 additions (`archived`, `Message.files`, `Settings`/`saveSettings`, `renameConversation`/`archiveConversation`, `health`, `fileIds`, their union types), nullability tightening (`conversations`/`currentUser`/`files`/subscription result), `createdAt: DateTime!` → `String!` (frontend renders `new Date(iso)` — ISO strings preserved)
- [x] `codegen.ts`: legacy `src/server` output path dropped; graphqlsp schema repointed to the snapshot

### 2. Provider smoke — deferred (user decision)

- [ ] OpenRouter smoke skipped: needs a key; `cargo run --example chat_smoke` proves the provider path against the user's configured provider (Featherless)
- [ ] Local ollama smoke skipped: not installed on this machine; Settings dialog already accepts any OpenAI-compatible base URL

### 3. `tauri build` → dmg ✅

- [x] App icon: generated placeholder mark (indigo gradient tile, white geometric "P") → `pnpm tauri icon` regenerated the full set
- [x] AGPL notices: Settings → About section (version, AGPL-3.0 link, third-party licenses viewer via `third_party_licenses` command over the bundled `resources/licenses.html`); generated with `cargo about` (`src-tauri/about.toml` + `about.hbs`), 12 licenses / 198 crates
- [x] `.app` + `.dmg` built: `src-tauri/target/release/bundle/{macos,dmg}/` (~40MB dmg, 58MB app). NOTE: tauri's dmg bundling runs a Finder AppleScript that needs **Automation permission for the terminal** (`Not authorized to send Apple events to Finder, -1743`); until granted, build the dmg with `--sandbox-safe`:
  `cd src-tauri/target/release/bundle/dmg && bash bundle_dmg.sh --volname "Privait" --icon "Privait.app" 180 170 --app-drop-link 480 170 --window-size 660 400 --hide-extension "Privait.app" --sandbox-safe "Privait_0.1.0_aarch64.dmg" "../macos"`

### 4. Legacy server deleted ✅

- [x] Removed: `src/server/`, `docker/`, `docker-compose.yml`, `Procfile.example`, `.envrc.example`, `.dockerignore`, `scripts/db`, `scripts/init-dev.sh`, `scripts/download-models.sh`
- [x] Root `package.json` rewritten: server/overmind/db scripts gone, `test:frontend` now one-shot `vitest run`, `schema:parity` added; server-only deps dropped (`pg`, `@types/pg`, `pino-pretty`, `wait-on`, `ts-node`, `esbuild-loader`); lint-staged server entry gone
- [x] `eslint.config.mjs`, `tsconfig.json`, `jsconfig.json`, `pnpm-workspace.yaml` cleaned of `@server`; README rewritten for the Tauri flow; CI verified clean (no docker/src-server refs since M1)

### 5. Manual smoke checklist ✅

- [x] Cold start: 416ms warm / 2.1s first-exec (macOS first-launch overhead) to "API server listening" — budget met
- [x] Chat streams + persists: `cargo run --example chat_smoke` → "pong", USER/ASSISTANT rows, end-to-end green
- [x] File pipeline: multipart `uploadFile` against the live DB → inline extract/chunk/embed → PROCESSED; delete removed everything
- [x] UI: webview renders sidebar/chat/settings/About (checked against this worktree's vite — the :4000 server belongs to a *different* worktree, see lessons); licenses viewer shows the web fallback in plain-web mode (full HTML renders in the desktop app via the bundled resource)
- [x] Privacy: only outbound HTTP client in the core is the reqwest client in `provider.rs` pointed at the user's configured `provider.baseUrl`; fastembed model download on first embed is the only other known fetch (documented). Little Snitch observation is user-side.

### Verify

`cargo fmt/clippy/test` green (82 tests), `tsc -b` green, vite build green, eslint green (5 pre-existing vendored-ui warnings), `vitest run` 26/26, `pnpm codegen` green, parity gate green, dmg verified by mount.

## Next

## CI note (M1 wrap-up)

- Legacy CI plumbing dropped on user request (was scheduled for parity): docker-compose/Postgres/db-setup steps and `src/server` tests removed; `test-and-lint` job renamed `frontend` and now runs lint + frontend vitest only. `src/server` stays frozen in the repo (still linted) until M4 deletes it.

## Test additions (M1 hardening, user-approved)

- Rust (+5 → 18 tests): schema SDL snapshot (`src-tauri/schema.snapshot.graphql`, refresh with `PRIVAIT_UPDATE_SCHEMA_SNAPSHOT=1 cargo test`); FK cascade on conversation delete; cosine ≥0.5 similarity threshold over KNN results (app-side filter pinned); WS upgrade rejected on wrong/missing token.
- Frontend (+4 → 5 tests): Apollo link-chain runtime test — queries → httpLink (+URL), auth header only in Tauri mode, WS client gets `?token=` URL, upload link registered with base URL. Mocks `lib/tauri`, `graphql-ws`, upload link.
- Deferred: webview e2e (tauri-driver), apalis retry behavior (retry layer still optional; M3 pipelines fail per-job with a logged error and leave status UPLOADED).