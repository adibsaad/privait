---
id: 0035
title: Composer incognito toggle for existing chats + sidebar menu spacing
---

## Goal

Two UX items: (1) the composer's incognito toggle only appeared on the
new-chat page — existing chats had to use the sidebar's ⋯ menu; (2) the
sidebar row menu's icons sat flush against their labels (e.g. the trash
icon against "Delete").

## Design

- The toggle logic (mutation + cache sync + toast) moves into a shared
  `ThreadActions.setThreadIncognito`, used by both the sidebar menu and the
  composer. The composer toggle now handles both cases: pending birth flag
  on the new-chat page, persisted flag (from the thread list) elsewhere —
  with optimistic pressed-state that re-syncs from the thread list.
- Menu items in the sidebar (thread rows + project rows) get `gap-2.5`
  between icon and label.

## Acceptance criteria

- [x] The composer toggle appears on existing chats and flips the
      persisted flag (button state, sidebar badge, and DB agree) — wired
      via shared action, proven by component tests (existing/new/untoggle)
- [x] Menu items show clear icon-to-label spacing (gap-2.5, all sidebar
      menus)
- [x] Frontend gates green (tsc, build, eslint, vitest 38)

## Constraints

- The sidebar menu and the composer must never disagree on the flag.
