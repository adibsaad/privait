---
id: 0017
title: Parallel streams with a bounded queue (no supersede)
---
## Goal
0001 shipped single-flight: sending in chat B while chat A streams cancels A (supersede). Product decision: multiple streams run in parallel — the user can send in as many chats as they want; runs beyond the concurrency cap queue in the background (providers rate-limit). Max parallel configurable, hardcoded to 2 for now.

## Acceptance criteria
- [x] Sending in B while A streams does not cancel A; both stream independently
- [x] A third send queues (subscription stays open, stream begins when a slot frees); queue drains automatically as runs finish
- [x] Concurrency cap read from settings (`runs.maxConcurrent`, default 2) at registration time; one run per conversation still holds (double-send in the SAME chat is still rejected)
- [x] Frontend: multiple live streams tracked as a set (not one subscription hook) — chunks route to the right thread, per-thread stop works, composer stays usable everywhere; supersede logic removed
- [x] Failed/finished queued runs release their slot (no stuck queue)

## Review
- `runs.rs` is now a scheduler: `try_register(conversation_id, max_concurrent)` returns `Started` or `Queued { turn }` (FIFO via a VecDeque mirroring Queued states); `finish()` promotes the oldest queued run by firing its turn signal; cancel works while queued (the pump's wait selects on cancel, and the queued wait holds no DB connection). `turn_arrived` parks on a vanished sender so a cancelled-while-queued run can't start.
- Pump: queued runs wait on the turn signal before the open phase; transcript writes (user message + placeholder) happen at send time as before, so the chat looks immediate.
- Frontend: the single `useSubscription` was replaced by an imperative `client.subscribe` per send (`activeStreamsRef`), per-stream first-chunk/attachment state (the shared refs were a parallel-send hazard), `runningThreadIds` Set for per-thread `isRunning`, supersede removed, stop = `stopRun` + unsubscribe of just that thread's stream.
- Tests: registry unit tests (same-chat rejection, FIFO promotion, cancel-while-queued, turn wake, slot freeing) + schema test (`streams_run_in_parallel_and_extra_sends_queue`: two concurrent streams complete with full replies persisted, third queued run completes after a slot frees). 114 green, clippy `-D warnings` clean.
- Verified live in the browser (isolated data dir): two parallel streams both persisted fully with no supersede; with `runs.maxConcurrent=1` the second send's subscription held open (queued) until the first finished, then streamed and persisted — incremental flushes visible during both.

## Constraints
- Backend owns the queue (any client benefits); registry keeps the per-conversation exclusivity
- Queued subscriptions must not hold DB connections while waiting
