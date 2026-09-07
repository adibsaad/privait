---
id: 0025
title: Memories list freshness + distilled-memory indicator
---
## Goal
The Settings → Memories list shows stale (empty) data even when distilled memories exist in the DB: the query uses Apollo's default cache-first policy, so once an empty list is cached, later opens never refetch (worker-written memories bypass the Apollo cache entirely). Also add the approved indicator so distillations are visible without opening Settings.

## Acceptance criteria
- [x] Memories list always reflects the DB on open (network-only fetch)
- [x] New distilled memories surface without opening Settings: a lightweight poll toasts "Memory saved: …" for newly distilled entries (first poll after mount doesn't toast for pre-existing rows)
- [x] Reproduction test path: open Memories (caches empty) → distill happens → reopen Memories → list shows the new memory (manual verification)

## Review
- Root cause confirmed: `useQuery(MemoriesDocument)` used Apollo's default cache-first policy — the first open cached the (possibly empty) list and later opens never refetched, so worker-written memories were invisible forever. Fixed with `fetchPolicy: 'network-only'`; verified the exact repro path (first open caches empty → memory written behind the UI → reopen shows it).
- Indicator: `MemoriesWatcher` (mounted in Root) polls memories every 20s network-only and toasts newly `distilled` entries; the first poll seeds the known-id set (pre-existing rows never toast). Effect-level evidence confirms the poll fetches and the toast branch fires for new distilled rows.
- Caveat honestly noted: the toast could not be *visually* confirmed in the t3 preview tab — it sits hidden, which stalls Apollo's poll timer (no effect runs while hidden). In a visible window the 20s poll runs normally; flagged for the user's manual pass.
- tsc/eslint/vitest/build green; debug probes removed.

## Constraints
- Poll interval modest (≥15s) — local app, no cost concern, no spam
- Toasts only for `distilled` memories (manual ones have their own immediate feedback)
