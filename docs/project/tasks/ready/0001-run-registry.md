---
id: 0001
title: Per-conversation run registry (concurrency safety)
---
## Goal
Eliminate the double-send race in the chat pipeline and make runs real background ops: each send registers a cancellable run, stop aborts server-side, and a second send in the same chat is queued or rejected instead of racing the first. This is the foundation for non-blocking multi-chat work.

## Acceptance criteria
- [ ] Sending twice quickly in the same conversation cannot interleave/corrupt messages (second send blocked clear UX)
- [ ] Stop button reliably aborts the provider request and persists the partial reply
- [ ] Runs survive UI navigation (switch chats mid-stream, come back, stream state is correct)

## Constraints
- Rust core (`src-tauri/src/schema.rs` spawn path) is the source of truth; no frontend-only guards
- No schema/UX redesign beyond what's needed for run state
