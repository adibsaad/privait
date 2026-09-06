---
id: 0022
title: Titlebar project prefix + UX polish round two
---
## Goal
Five tweaks from testing: destructive styling on the chat-delete confirm, stale chat-row highlight when a project page is open, Cmd/Ctrl+Enter submits the project dialog from the instructions field, and the title bar shows "project / chat" with the project segment clickable (back to the project page).

## Acceptance criteria
- [ ] The chat-delete confirm's "Yes" renders destructive (red)
- [ ] Navigating to a project page clears the chat row highlight (only the project row is active)
- [ ] Cmd/Ctrl+Enter inside the project dialog's instructions textarea submits the dialog
- [ ] The title bar shows "projectName / chatTitle" when the chat belongs to a project; the project segment is clickable and navigates to the project page; plain chats show just the title

## Constraints
- Title bar reuse of the cached Projects query — no new backend surface
