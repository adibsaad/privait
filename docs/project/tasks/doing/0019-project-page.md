---
id: 0019
title: Project page (composer + chat list + knowledge panel)
---
## Goal
Clicking a project opens a dedicated project page (like Claude's project view): a chat composer at the TOP — entering a message and hitting Enter starts a new chat in that project — the project's chats listed under it, and its knowledge files in a panel on the right. Replaces the hamburger-menu "New chat" flow.

## Acceptance criteria
- [ ] Route `/project/:id` renders the project page: name header, composer at top, project chats below, knowledge files panel on the right
- [ ] Composer: entering a message + Enter creates the conversation in that project and lands the user in it (chat page); it appears in the sidebar group + page list immediately
- [ ] Chat list shows the project's chats; clicking one opens it
- [ ] Knowledge panel lists the project's knowledge files; files can be added (upload → claim) and removed
- [ ] Edit-project dialog slims down to name + instructions only (knowledge management lives on the page)
- [ ] Backend: `Project.knowledgeFiles` + `Conversation.updatedAt` surface (additive; snapshot/parity/codegen updated)

## Constraints
- Sending from the project page reuses the run registry/streaming machinery (parallel + queue rules apply)
- No new backend writes — knowledge add/remove reuse uploadFile + claim/delete
