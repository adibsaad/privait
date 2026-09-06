---
id: 0024
title: Distillation latency — cap the job-queue poll backoff
---
## Goal
Distilled memories took ~37s to appear: the apalis poll strategy backs off to 60s while the queue is idle, so a job pushed minutes into a session waits out the current backoff. The distillation should land within a couple of seconds of the turn completing.

## Acceptance criteria
- [x] `Jobs::init` configures the poll strategy: 500ms base interval with the backoff capped at 2s
- [x] A regression test pushes a job after letting the worker idle past the cap and asserts it processes within ~3s
- [x] Live verification: chat turn → distilled memory visible within a few seconds

## Constraints
- Keep the queue on its own jobs.db (unchanged); no new job types

## Review
- Root cause: apalis-sql's default poll strategy is 100ms with exponential backoff to a 60s max while the queue is idle — a distillation pushed minutes into a session waited out the whole backoff (observed: 37s). `Jobs::init` now builds the storage with `new_with_config`: 500ms base interval, backoff capped at 2s.
- Regression test: worker idles 3s (past the cap), job must process within 3s of the push.
- Live verification (isolated dir, distill-aware mock): turn completed → both `distilled` memories with provenance in the DB within seconds of the turn.
- Also hardened the distill prompt with an inline example + a `NONE` sentinel so weaker models follow the output format more reliably.
- 115 tests green, clippy `-D warnings` + fmt clean.
