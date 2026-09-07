---
id: 0030
title: Tool step settles on slow distillations (poll until settled)
---

## Goal

With a reasoning provider, the distillation request itself goes through the
model and can take 30s+. The frontend refetches the chat's tool step exactly
twice after the turn (+2s, +7s — a schedule tuned for fast providers), so the
step shows "Updating user memories…" (RUNNING) forever while the DB row is
already DONE. Evidence: user's real DB shows both tool rows DONE with
"Updated 1 memory" while the UI stayed stuck until reload.

## Design

Replace the fixed two-shot refetch with a settling poll: fetch every 2s
(backing off to 8s), stop as soon as the fetched thread has no RUNNING tool
step (settled or never created), give up after 5 minutes (a reload then
shows the settled state). Same merge semantics as today; no contract change.

## Acceptance criteria

- [x] With a slow distillation, the step flips RUNNING → DONE in the UI
      without a reload (poll continues past 7s)
- [x] With a fast/absent distillation (mock provider, incognito, no-op),
      polling stops after the first settle — no infinite polling
- [x] Frontend gates green (tsc, vite build, eslint, vitest)

## Constraints

- Logs/queries carry metadata only (privacy invariants).

## Review

- `refetchForToolStep` (fixed +2s/+7s) replaced by `settleToolStep`: poll at
  2s backing off to 8s, stop as soon as the fetched thread has no RUNNING
  tool step, deadline 5 minutes. Same merge semantics.
- Root cause evidence: the user's real DB had both tool rows DONE
  ("Updated 1 memory") while the UI showed RUNNING — the distillation goes
  through the same reasoning provider and outlives any fixed schedule.
- Verified live (serve_dev + reasoning mock, 12s distillation): step
  settled in the UI ~14s after the turn without a reload; fast/absent
  distillations stop polling after the first settle.
- Also fixed en route (same live session, caught by the smoke): stream
  chunks and settle-poll merges interleave, so `textOf`/`appendAssistantChunk`
  must tolerate BOTH content shapes (array while streaming, string once
  merged) — a "" string content crashed with `TypeError: 'in' operator` and
  non-empty strings silently lost all but their first character. Regression
  tests encode both shapes; lessons.md updated.
