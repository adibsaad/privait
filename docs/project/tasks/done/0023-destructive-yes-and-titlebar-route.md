---
id: 0023
title: Destructive confirm fix + title bar route awareness
---
## Goal
Two fixes: the chat-delete confirm's "Yes" renders near-white because the default button variant's `dark:bg-neutral-50` overrides the light-only red classes in dark mode — style it with dark variants too (mirroring buttonVariants' destructive). And the title bar keeps showing the previous chat title while a project page is open — it should be route-aware and show the project name there.

## Acceptance criteria
- [x] Chat-delete confirm's "Yes" is red in BOTH light and dark mode (computed background is red-500/red-900)
- [x] The project-delete confirm gets the same destructive treatment (consistency)
- [x] On `/project/:id` the title bar shows the project's name (no chat title, no prefix); on `/chat` it keeps "project / chat" for project chats

## Constraints
- No new backend surface

## Review
- Root cause of the white Yes: the default button variant carries `dark:bg-neutral-50`, which tailwind-merge keeps alongside a light-only `bg-red-500` — in dark mode the near-white won. Fix mirrors buttonVariants' destructive: red in both modes (`bg-red-500 … dark:bg-red-900`); computed rgb(127,29,29) verified in the dark preview. Project-delete confirm gets the same treatment for consistency.
- Title bar is route-aware: `/project/:id` shows the project name alone; the chat view keeps "project / chat".
- Verified live in dark mode: computed styles + title bar content.
