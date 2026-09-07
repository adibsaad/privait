---
id: 0028
title: Start a new chat incognito from the composer
depends_on:
  - 0027
---
## Goal
Starting an incognito chat requires sending a message first, then using the ⋯
menu — so the first turn is already non-incognito (memories were read, and a
memory write could land). The composer gains an incognito toggle (global
new-chat screen and the project page's composer) so the very first turn is
incognito: no memory read, no write, no transcript search.

## Design
Additive GraphQL contract change (requested by the human 2026-09-07):

- The `conversation` subscription gains `incognito: Boolean` (optional). When
  it creates the conversation (no `conversationId`), the row is inserted
  incognito. Ignored for existing chats — those keep the ⋯ menu control.
- Frontend: a pending `newChatIncognito` flag on the ThreadContext, toggled by
  an eye-off button in the composer (visible only on the empty/new-chat view
  and the project composer), passed into the subscription on send and reset
  afterwards. The optimistic sidebar row carries the badge.

## Acceptance criteria
- [x] New-chat composer shows an incognito toggle; sending with it on creates
      a conversation with incognito = 1 (eye-off badge on the sidebar row)
- [x] That first turn reads no memories and writes none (no distillation, no
      "Updating user memories…" step)
- [x] Project page composer: same toggle; the new chat lands in the project
      group, incognito
- [x] Existing chats are unaffected: the toggle only appears on the new-chat
      view; the ⋯ menu remains the control there
- [x] Conversation-creation backend path unit-tested (incognito persisted);
      SDL snapshot + codegen refreshed

## Constraints
- No migration; the flag rides the existing `conversations.incognito` column.
- Privacy invariants: incognito chats stay out of memory read/write and
  transcript search (existing backend checks cover the new creation path).

## Review
- Subscription `conversation` gains `incognito: Option<bool>`; creation
  extracted into `insert_conversation` (unit-tested: the flag persists). For
  existing conversations the arg is ignored — the ⋯ menu stays their control.
- Frontend: `newChatIncognito` pending flag on ThreadContext; eye-off toggle
  in the composer (visible only on the empty view via `s.thread.isEmpty`) and
  on the project page's composer; optimistic sidebar rows carry the badge
  (`withOptimisticThread` / `reconcileThreadList` thread it through). The
  flag resets on send and on switching to a new chat.
- Verified live (serve_dev + vite, isolated data dir, mock provider): global
  new-chat toggle → send → conversation row `incognito=1`, badge on the
  sidebar, no "Updating user memories…" step, toggle absent in existing
  chats; project composer → chat born incognito inside the project group
  with badge. Memory read bypass is enforced server-side (retrieval.rs) and
  covered by the 0003 tests.
- All gates green: cargo (116 tests, fmt, clippy -D warnings), tsc -b, vite
  build, eslint (0 errors), vitest run (35), schema parity.