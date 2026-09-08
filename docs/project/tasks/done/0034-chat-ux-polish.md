---
id: 0034
title: Chat UX polish — boot, focus, delete navigation, distill-step visibility
---

## Goal

Four QA-grade UX gaps: (1) the app boots into the most recent chat instead
of the new-chat page; (2) the new-chat page does not focus the composer;
(3) deleting the selected chat navigates to the first chat in the list
instead of the new-chat page; (4) every completed turn shows an
"Updating user memories…" step even when the distillation ends up changing
nothing — the pending state implies memory writes that usually don't
happen.

## Design

- Boot: start on the new-chat page (EMPTY thread) — drop
  `pickInitialThreadId` entirely.
- Focus: an effect focuses the composer whenever the thread switches to
  the empty/new-chat view (mount autoFocus only covers the first mount).
- Delete: deleting the currently selected chat lands on the new-chat page;
  deleting other chats keeps the selection.
- Distill step: the RUNNING row stays in the data (it drives the
  settle-poll and is the worker's settlement target) but is filtered from
  rendering — the step becomes visible only when something actually
  changed ("Updated N memories · N removed") or failed. No contract change.

## Acceptance criteria

- [x] Boot lands on the new-chat page with the composer focused
- [x] Deleting the selected chat lands on the new-chat page (focused);
      deleting another chat keeps the current selection
- [x] A turn that distills to nothing shows no memory step at all; a turn
      that changes memories shows the settled step ("Updated …")
- [x] Gates green (tsc, build, eslint, vitest); live smoke covers all four

## Constraints

- Settle-poll behavior (0030) unchanged: polls key off RUNNING rows in the
  raw fetch, not off rendered messages.

## Review

- Boot: ThreadProvider no longer selects a conversation — the app always
  lands on the new-chat page (pickInitialThreadId removed; tests swapped
  for isHiddenMemoryStep coverage).
- Focus: an effect focuses the composer whenever the view switches to the
  new-chat page (mount autoFocus only covered first mount).
- Delete: BOTH paths (adapter onDelete + threadActions.remove — the
  sidebar's) now land on the new-chat page when the selected chat is
  deleted; other deletions keep the selection. Caught live: the first fix
  touched only the adapter path the sidebar doesn't use.
- Distill step: RUNNING rows are filtered from both render paths
  (thread provider mapping + settle-poll merge) via isHiddenMemoryStep —
  the step appears only settled (DONE with counts / ERROR). The row stays
  in the data: the settle-poll keys off RUNNING rows in the raw fetch.
- Verified live: boot+focus with history present, reload lands on
  new-chat+focused, no-op distill shows zero step, memory-writing distill
  shows only the settled step, deleting the selected chat lands on
  new-chat+focused.
