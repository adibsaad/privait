---
id: 0018
title: Streaming indicator on sidebar chat items
---
## Goal
When a chat is generating (receiving tokens — or queued for a slot), its sidebar row should show a loading state so in-flight runs are visible at a glance without opening the chat.

## Acceptance criteria
- [x] The sidebar row of a generating chat shows a spinner badge while its stream is in flight; it disappears when the run ends (done/error/stop)
- [x] Queued runs (waiting for a concurrency slot) show the same badge — from the client they're both "generating"
- [x] Brand-new chats (still on the optimistic empty id) show it too

## Constraints
- Reuse the existing `runningThreadIds` state — no new backend surface

## Review
- `runningThreadIds` exposed through `ThreadActions` (no new backend surface); `ThreadRow` renders a spinning `LoaderCircleIcon` before the title while the chat's stream is in flight — queued runs show it too (from the client both are "generating"), and optimistic empty-id chats are covered since the running set holds the optimistic id until the first chunk re-keys it.
- Verified in the browser (isolated dir, slow mock): spinner present during both of two parallel streams, gone after done/error — MutationObserver counted its appearances.
- tsc/eslint/vite build green.
