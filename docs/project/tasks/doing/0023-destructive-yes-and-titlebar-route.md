---
id: 0023
title: Destructive confirm fix + title bar route awareness
---
## Goal
Two fixes: the chat-delete confirm's "Yes" renders near-white because the default button variant's `dark:bg-neutral-50` overrides the light-only red classes in dark mode — style it with dark variants too (mirroring buttonVariants' destructive). And the title bar keeps showing the previous chat title while a project page is open — it should be route-aware and show the project name there.

## Acceptance criteria
- [ ] Chat-delete confirm's "Yes" is red in BOTH light and dark mode (computed background is red-500/red-900)
- [ ] The project-delete confirm gets the same destructive treatment (consistency)
- [ ] On `/project/:id` the title bar shows the project's name (no chat title, no prefix); on `/chat` it keeps "project / chat" for project chats

## Constraints
- No new backend surface
