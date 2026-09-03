---
id: 0017
title: Parallel streams with a bounded queue (no supersede)
---
## Goal
0001 shipped single-flight: sending in chat B while chat A streams cancels A (supersede). Product decision: multiple streams run in parallel — the user can send in as many chats as they want; runs beyond the concurrency cap queue in the background (providers rate-limit). Max parallel configurable, hardcoded to 2 for now.

## Acceptance criteria
- [ ] Sending in B while A streams does not cancel A; both stream independently
- [ ] A third send queues (subscription stays open, stream begins when a slot frees); queue drains automatically as runs finish
- [ ] Concurrency cap read from settings (`runs.maxConcurrent`, default 2) at registration time; one run per conversation still holds (double-send in the SAME chat is still rejected)
- [ ] Frontend: multiple live streams tracked as a set (not one subscription hook) — chunks route to the right thread, per-thread stop works, composer stays usable everywhere; supersede logic removed
- [ ] Failed/finished queued runs release their slot (no stuck queue)

## Constraints
- Backend owns the queue (any client benefits); registry keeps the per-conversation exclusivity
- Queued subscriptions must not hold DB connections while waiting
