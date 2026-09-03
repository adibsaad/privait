---
id: 0012
title: Fix live-render of streamed assistant messages (empty bubble + phantom branch)
---
## Goal
During live streaming (browser-preview/serve_dev environment, both dev and prod builds), the assistant message renders an empty bubble and a phantom branch picker ("Previous 2/2") on the user message, while the underlying threads-map state and the DB hold the correct accumulated text. A reload renders everything correctly. Root-caused as pre-existing (reproduces on the original runtime code), found while verifying 0001.

## Acceptance criteria
- [ ] Live-streamed assistant text renders in the bubble as chunks arrive (no reload needed)
- [ ] No phantom branch picker on the just-sent user message (temp-user reconcile must not create a branch)
- [ ] Stop button is visible for the whole streaming window (currently checked at ~1.5–2s of a 3.6s stream and absent)

## Constraints
- Keep the optimistic temp-user → persisted-id reconcile flow (chat-threads helpers are unit-tested)
- Suspects: assistant-ui ExternalStore branching on the temp-user → real-id id swap mid-stream; chunk timing; StrictMode double-subscription in dev