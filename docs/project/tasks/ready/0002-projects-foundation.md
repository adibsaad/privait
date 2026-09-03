---
id: 0002
title: Projects foundation (container + instructions + knowledge)
depends_on:
  - 0010
---
## Goal
Introduce a project as the workspace unit: a named container with its own instructions, knowledge folder, and chat list. Chat grounding gains project scope (project files auto-injected) alongside the existing per-chat + global-memory paths.

## Acceptance criteria
- [ ] `projects` table + GraphQL CRUD; sidebar lists projects with their chats
- [ ] Per-project system instructions applied to every chat in the project
- [ ] Knowledge folder: files added to a project ground that project's chats (not other projects' chats)
- [ ] Global memory still retrieved in project chats (single-store decision)

## Constraints
- Local-only; no sharing, sync, or scheduled tasks in v1
- Retrieval change must keep current per-chat grounding working (additive scoping column, not a rewrite of the KNN path if avoidable)
