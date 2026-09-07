---
id: 0029
title: Distillation reconciles memories instead of only appending
---

## Goal

The distillation pipeline is append-only: saying "I live in NYC" and later
"I live in SF" leaves both memories in the store. Nothing compares new
proposals against existing memories, and retrieval has no recency sense to
arbitrate — so stale facts can out-rank fresh ones or contradict them inside
the same prompt. The distiller must be able to rewrite or remove superseded
memories, keeping the store a current picture of the user rather than an
ever-growing log.

## Design

The distillation request gains a bounded view of the current store, and the
line protocol gains two mutation forms. Still text-line based — the provider
abstraction is plain SSE text, no function calling (see lessons.md).

**Offer list.** The distill request includes the 24 most recently updated
memories (id + content). Deterministic, bounded prompt, no embedding
dependency in the distill path. Chosen over similarity-based offers because
contradictions can be lexically distant ("moving to Lisbon in October" vs
"lives in NYC"); recency is the right prior for "what's currently true".

**Protocol.**

- `MEMORY: <content>` — insert (unchanged, max 2 per turn)
- `UPDATE <memory_id>: <content>` — rewrite an existing memory in place
  (same row id, source, and provenance; `updated_at` bumps; re-embed)
- `DELETE <memory_id>` — remove a superseded memory (row + vector, hard
  delete, consistent with the no-soft-deletes rule)

**Authorship guardrail.** The model may `UPDATE` and `DELETE` only
`distilled` memories. User-authored (`manual`) memories appear in the offer
list for reference but are read-only to the model — what the user wrote is
only changed by the user (Settings stays that surface). If a manual memory
is superseded, the model may still add the new fact; the visible duplication
is for the user to resolve.

**Bounds and validation (app-side).** IDs must come from the offered list —
unknown or foreign ids are dropped silently. Caps per turn: 2 inserts,
4 updates, 4 deletes; 500 chars per content (existing rule).

**Visibility.** The chat's tool step already renders the distillation; its
DONE content now enumerates what happened, e.g. "Updated 2 memories · 1
removed" (pluralized, existing convention). No-op turns still delete the
step row. No GraphQL contract change — the step is message content.

## Acceptance criteria

- [ ] Distill request includes the 24 most recently updated memories
      (id + content, bounded)
- [ ] Parser accepts all three line shapes with the caps; unknown/foreign
      ids and manual-memory mutations are ignored (unit tests)
- [ ] NYC→SF: a scripted mock shows the second turn rewrites or removes the
      stale memory — the two never coexist after the second distillation
- [ ] Updated memories re-embed and keep id/source/provenance; deletions
      remove row and vector
- [ ] Tool step enumerates changes; no-op turns leave no trace; incognito
      chats still never distill
- [ ] Full gates green (cargo fmt/clippy/tests, schema snapshot if touched,
      tsc, vite build, eslint, vitest)

## Constraints

- Read path (grounding, threshold, top-k) unchanged.
- Privacy invariants: no logging of memory content beyond the inspectable
  rows themselves; everything stays user-visible/editable/deletable.
- No schema migration (memories table unchanged).
