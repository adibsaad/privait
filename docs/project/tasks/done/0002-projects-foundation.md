---
id: 0002
title: Projects foundation (container + instructions + knowledge)
depends_on:
  - 0010
---
## Goal
Introduce a project as the workspace unit: a named container with its own instructions, knowledge folder, and chat list. Chat grounding gains project scope (project files auto-injected) alongside the existing per-chat + global-memory paths.

## Acceptance criteria
- [x] `projects` table + GraphQL CRUD; sidebar lists projects with their chats
- [x] Per-project system instructions applied to every chat in the project
- [x] Knowledge folder: files added to a project ground that project's chats (not other projects' chats)
- [x] Global memory still retrieved in project chats (single-store decision)

## Review
- Backend: migration v4 (projects + scoping columns + indexes); `files.rs` (claim_to_project, drop_project_files_db, GC skips knowledge); `retrieval.rs` (`related_project_chunks`, KNN-filter helper shared with per-chat grounding); `schema/projects.rs` (type + repo helpers); Query projects/project; Mutations create/rename/update-instructions/delete/add-knowledge; subscription `projectId` param scopes new chats at first send.
- Grounding order verified by a capturing-provider test: project instructions system message + this project's knowledge chunks, other project's equally-similar chunk excluded, global memories unchanged (97 tests green, clippy clean).
- Frontend: grouped sidebar (Projects section + per-project chats + plain Chats), ProjectDialog (create/edit + instructions + knowledge upload via the existing upload pipeline), delete confirmation, ThreadActions context exposing switch/rename/archive/delete to the custom list; `Thread.projectId` + optimistic reconciliation keeps new chats in their group.
- Verified in the browser against the real router: create project, per-project chat creation flows `projectId` through the subscription (DB shows `project_id` set), sidebar grouping correct; parity/codegen/snapshot green; tsc/eslint/vitest/build green.

## Constraints
- Local-only; no sharing, sync, or scheduled tasks in v1
- Retrieval change must keep current per-chat grounding working (additive scoping column, not a rewrite of the KNN path if avoidable)

## Design
- DB migration v4: `projects(id, name, instructions, created_at, updated_at)`; `conversations.project_id` (NULL = plain chat, `ON DELETE SET NULL`); `files.project_id` (NULL = chat attachment, `ON DELETE CASCADE` = the project's knowledge dies with it). No KNN rewrite: chunk vectors already exist; project grounding = existing global KNN + app-side filter over the project's knowledge-file ids (same pattern as conversation scoping, exact at desktop scale).
- GraphQL: `Project` type (id/name/instructions/createdAt + conversations), `Query.projects/project`, `Mutation.createProject/renameProject/updateProjectInstructions/deleteProject`, `Mutation.addProjectKnowledge(projectId, fileIds)` (claims uploads into the project's knowledge; same inline extract→chunk→embed upload path). `Conversation.projectId` added for the sidebar grouping. `deleteProject` keeps chats (unassigned) and drops knowledge files + their chunks/bytes.
- Grounding per turn (project chat): global memories (unchanged) + this conversation's attachments (unchanged) + top-k over the project's knowledge files + a system message with the project's instructions when set.
- Frontend: sidebar groups chats under their project (flat list for non-project chats), create/rename/delete project, instructions editor, knowledge upload reusing the existing uploadFile mutation.
