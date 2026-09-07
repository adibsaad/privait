---
id: 0032
title: Distillation protocol tolerance + dropped-proposal evidence
---

## Goal

A live "my name is John → Mike" turn distilled to a no-op: the step showed,
nothing changed. Evidence (user DB + jobs.db): the distill ran in 4s and
proposed nothing that parsed. Two holes: the offer list shows ids as `#3`
but the parser only accepted bare `3` (models echo the prefix they're
shown), and the prompt never said contradictions should REWRITE the listed
memory.

## Design

- Parser accepts `#N` in UPDATE/DELETE lines (models echo the offer list's
  prefix).
- Prompt gains explicit contradiction guidance with a worked example.
- Dropped proposals are counted (`DistillOutcome.ignored`) and logged with
  kind + error (metadata only — never memory content), so protocol drift is
  diagnosable without reading user content.

## Acceptance criteria

- [x] `UPDATE #3:` / `DELETE #3` parse (unit test)
- [x] Worker logs outcome counts and ignored proposals' kind + error
- [x] Live: a mock echoing `UPDATE #N:` rewrites the offered memory (John→
      Mike round trip, no duplicate rows)
- [x] Gates green (cargo 122, tsc, build, eslint, vitest 37)

## Constraints

- Privacy: logs carry counts/kinds/errors only, never content.
