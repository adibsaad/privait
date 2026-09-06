---
id: 0019
title: Project page (composer + chat list + knowledge panel)
---
## Goal
Clicking a project opens a dedicated project page (like Claude's project view): a chat composer at the TOP — entering a message and hitting Enter starts a new chat in that project — the project's chats listed under it, and its knowledge files in a panel on the right. Replaces the hamburger-menu "New chat" flow.

## Acceptance criteria
- [x] Route `/project/:id` renders the project page: name header, composer at top, project chats below, knowledge files panel on the right
- [x] Composer: entering a message + Enter creates the conversation in that project and lands the user in it (chat page); it appears in the sidebar group + page list immediately
- [x] Chat list shows the project's chats; clicking one opens it
- [x] Knowledge panel lists the project's knowledge files; files can be added (upload → claim) and removed
- [x] Edit-project dialog slims down to name + instructions only (knowledge management lives on the page)
- [x] Backend: `Project.knowledgeFiles` + `Conversation.updatedAt` surface (additive; snapshot/parity/codegen updated)

## Constraints
- Sending from the project page reuses the run registry/streaming machinery (parallel + queue rules apply)
- No new backend writes — knowledge add/remove reuse uploadFile + claim/delete

## Review
- Backend: `Project.knowledgeFiles` (files by project_id) and `Conversation.updatedAt` (additive; snapshot/parity/codegen updated — Project is a new type so knowledgeFiles folds into its existing `type added` deviation).
- `pages/project.tsx` (`/project/:id`): composer at top (Enter → `sendMessageInProject`), project chats under it, knowledge panel on the right (add via the existing upload pipeline + claim, remove via deleteFileUpload).
- `ThreadActions.sendMessageInProject` runs the standard optimistic flow scoped to the project (EMPTY bucket + projectId-carrying optimistic thread) and lands the user in the new chat.
- Verified live: create project → click row → page renders (composer/chats/knowledge) → Enter starts chat in the project (DB row project_id=1, lands in chat, sidebar group updates) → knowledge add/list via panel → collapse toggle works.
