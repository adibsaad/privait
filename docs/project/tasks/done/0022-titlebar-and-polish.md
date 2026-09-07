---
id: 0022
title: Titlebar project prefix + UX polish round two
---
## Goal
Five tweaks from testing: destructive styling on the chat-delete confirm, stale chat-row highlight when a project page is open, Cmd/Ctrl+Enter submits the project dialog from the instructions field, and the title bar shows "project / chat" with the project segment clickable (back to the project page).

## Acceptance criteria
- [x] The chat-delete confirm's "Yes" renders destructive (red)
- [x] Navigating to a project page clears the chat row highlight (only the project row is active)
- [x] Cmd/Ctrl+Enter inside the project dialog's instructions textarea submits the dialog
- [x] The title bar shows "projectName / chatTitle" when the chat belongs to a project; the project segment is clickable and navigates to the project page; plain chats show just the title

## Constraints
- Title bar reuse of the cached Projects query — no new backend surface

## Review
- Chat-delete confirm's Yes styled destructive (`bg-red-500 text-white hover:bg-red-600` via the AlertDialog className merge).
- Chat-row active state is route-gated (`/chat` or `/`) — navigating to a project page clears the chat highlight; project rows highlight via their own route match.
- Project dialog: instructions textarea submits on Cmd/Ctrl+Enter (name field stays Enter-only).
- Title bar: chats in a project render "projectName / chatTitle" — the project segment is a button navigating to the project page (plain chats show the title only; the button is a non-drag target so Tauri window-dragging still works everywhere else on the strip).
- Verified live: red Yes classes present; highlight clears on project nav (single active row); Cmd+Enter mutation carried the text and the server saved it; title bar parts rendered as button/separator/title.
