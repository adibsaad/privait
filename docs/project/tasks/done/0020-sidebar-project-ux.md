---
id: 0020
title: Sidebar project UX (click → page, collapsible, recent 5)
---
## Goal
Sidebar project groups behave like Claude's: clicking the project opens its page, each group is collapsible, and only the most recent 5 chats show under a project (the page lists them all).

## Acceptance criteria
- [x] Clicking a project row navigates to its project page (the ⋯ menu keeps Edit + Delete; "New chat" removed — the page composer replaces it)
- [x] Each project group is collapsible (chevron), default expanded
- [x] Only the 5 most recently updated chats show under each project (recency from `Conversation.updatedAt`)
- [x] Removing "New chat in project" from the dropdown retires the composerProjectId mechanism (dead code out)

## Constraints
- Plain (non-project) chats section unchanged
depends_on:
  - 0019

## Review
- Project row click → `/project/:id`; ⋯ menu slimmed to Edit + Delete ("New chat" removed — the page composer replaces it).
- Groups collapsible (chevron, default expanded, session-local state); recent-5 per project sorted by `updatedAt` with a "View all N chats" link to the page.
- `composerProjectId` mechanism retired (dead code out) — project-scoped sends go through `sendMessageInProject`.
