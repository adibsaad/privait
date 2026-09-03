---
id: 0016
title: Persist partial replies incrementally (survives quit mid-stream)
---
## Goal
Quitting mid-stream (Cmd+Q) loses the partial reply — the pump holds the accumulated text in memory and only writes at the end. Persist incrementally so a killed run still leaves everything generated so far.

## Acceptance criteria
- [ ] Chunks are flushed to the assistant row during streaming (throttled, e.g. ~500ms), not only at the end
- [ ] Quitting mid-stream (Cmd+Q / kill) leaves the partial reply in the transcript after relaunch
- [ ] A trailing empty assistant row left by a kill-before-first-flush is swept at next startup (like orphan uploads)
- [ ] Final content is still written exactly once at run end (no drift between UI and DB)

## Constraints
- Throttle writes — one UPDATE per chunk is wasteful at token rate
- No new GraphQL surface
