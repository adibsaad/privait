---
id: 0025
title: Memories list freshness + distilled-memory indicator
---
## Goal
The Settings → Memories list shows stale (empty) data even when distilled memories exist in the DB: the query uses Apollo's default cache-first policy, so once an empty list is cached, later opens never refetch (worker-written memories bypass the Apollo cache entirely). Also add the approved indicator so distillations are visible without opening Settings.

## Acceptance criteria
- [ ] Memories list always reflects the DB on open (network-only fetch)
- [ ] New distilled memories surface without opening Settings: a lightweight poll toasts "Memory saved: …" for newly distilled entries (first poll after mount doesn't toast for pre-existing rows)
- [ ] Reproduction test path: open Memories (caches empty) → distill happens → reopen Memories → list shows the new memory (manual verification)

## Constraints
- Poll interval modest (≥15s) — local app, no cost concern, no spam
- Toasts only for `distilled` memories (manual ones have their own immediate feedback)
