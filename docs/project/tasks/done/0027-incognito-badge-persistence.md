---
id: 0027
title: Incognito badge and toggle survive restart
---
## Goal
The sidebar's incognito badge and ⋯ menu item are local component state seeded
`false` (thread-list.tsx), so they lie after an app restart: the backend still
enforces incognito, but the UI shows no badge, the menu reads "Incognito", and
clicking it re-sets incognito *on* instead of leaving — the user is stuck from
the UI. The persisted flag must reach the sidebar.

## Design
Additive GraphQL contract change (requested by the human 2026-09-07):

- `Conversation.incognito: Boolean!` on the `GqlConversation` type; both
  conversation SELECTs read the column.
- Frontend selects it in `allConversations`, maps it onto `Thread`, and the
  row initializes its local state from the thread. The toggle also syncs the
  Apollo cache (same mechanism as archive/rename) so remounts stay correct
  without a refetch.

## Acceptance criteria
- [x] A chat toggled incognito shows the eye-off badge and "Leave incognito"
      menu after an app restart
- [x] Clicking "Leave incognito" after a restart actually leaves (badge gone,
      memory read/write resume)
- [x] Toggling updates the Apollo cache, not just local state
- [x] SDL snapshot + codegen refreshed; schema test covers
      `conversations { incognito }`

## Constraints
- Additive schema only; no migration (the column exists since v5).

## Review
- `GqlConversation` gains `incognito` (chat.rs); both SELECTs in query.rs and
  the project's nested `conversations` read the column. SDL snapshot +
  codegen + schema-parity EXPECTED_DIFF updated.
- Sidebar row state seeds from `thread.incognito`; the toggle also syncs the
  Apollo cache (`applyConversationCacheUpdate` now carries `incognito`) so
  remounts stay correct without a refetch.
- Verified live (serve_dev + vite, isolated data dir, mock provider): toggle
  incognito → reload → badge persists, menu reads "Leave incognito", and
  clicking it actually leaves (DB flag flips to false, badge clears).
- Schema test asserts `conversations { incognito }` round-trips; 116 cargo
  tests green (fmt/clippy -D warnings included).