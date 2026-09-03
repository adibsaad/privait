---
id: 0001
title: Per-conversation run registry (concurrency safety)
---
## Goal
Eliminate the double-send race in the chat pipeline and make runs real background ops: each send registers a cancellable run, stop aborts server-side, and a second send in the same chat is queued or rejected instead of racing the first. This is the foundation for non-blocking multi-chat work.

## Acceptance criteria
- [x] Sending twice quickly in the same conversation cannot interleave/corrupt messages (second send blocked clear UX)
- [x] Stop button reliably aborts the provider request and persists the partial reply
- [x] Runs survive UI navigation (switch chats mid-stream, come back, stream state is correct)

## Constraints
- Rust core (`src-tauri/src/schema.rs` spawn path) is the source of truth; no frontend-only guards
- No schema/UX redesign beyond what's needed for run state

## Design
- In-memory `RunRegistry` (new `src-tauri/src/runs.rs`): `HashMap<conversation_id, cancel flag>` behind a `Mutex`, registered per successful subscription start, removed by a drop guard in the pump task (survives every exit path). No DB table — runs are process-lifetime by definition; "resumption" here means the detached pump + partial persist already survive navigation/reload.
- Cancellation flag: `tokio::sync::watch<bool>` (zero new deps; `CancellationToken` would need tokio-util). A `cancelled()` helper makes the listen race-free (checks the flag before waiting).
- GraphQL contract change (inherent to "stop = real abort"): new `stopRun(conversationId: Int!): Boolean!` mutation. Registry keying makes a second `conversation` subscription on the same chat return the `Error` union arm ("already being generated") before any message rows are written.
- Pump task: `select!` over cancel-flag vs stream chunk vs first-chunk timeout, so stop aborts promptly even when the provider stalls. Stop persists the partial reply; if nothing streamed yet, the empty assistant placeholder is deleted instead of lingering.
- Frontend: stop button calls `stopRun` then unsubscribes (drop-kill-switch stays as fallback); `isRunning` becomes per-thread (`currentThreadId === runningThreadId`) so a streaming chat doesn't freeze other chats' composers; chunk reconciliation no longer yanks the viewport — `setCurrentThreadId` fires only when the user is still parked on the new-chat view. Sending from another chat supersedes the in-flight run via `stopRun` (v1 has one WS subscription; concurrent runs land in 0004).

## Review
- Backend: 6 unit tests in `runs.rs` (slot claim/conflict/finish/cancel-race); schema tests for double-send rejection + slot freeing, `stopRun` cancel + partial persist + placeholder-delete-before-first-chunk, plus all pre-existing tests green (94 total, clippy clean).
- End-to-end over the real router (serve_dev + local mock provider, verified in browser): second subscription on a streaming chat gets the `Error` arm; `stopRun` mid-stream aborts the pump within one tick and persists the partial (`stopRun: true`), a second `stopRun` returns `false` (slot freed); per-thread composer state verified (other chat's composer stays usable, no viewport yank).
- GraphQL contract: `stopRun(conversationId: Int!): Boolean!` added; snapshot + codegen regenerated.
- Unrelated pre-existing rendering quirk found during verification (live-streamed assistant bubble renders empty + phantom branch; DB state always correct; reproduces on original code) — filed as 0012, out of scope here.
