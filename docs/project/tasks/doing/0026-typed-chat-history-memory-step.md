---
id: 0026
title: Typed chat history — memory-step indicator in the conversation
---
## Goal
Chat history becomes typed: user input, AI response, and tool-call steps are all history records that render inline. First consumer: the memory distillation shows up in the chat as an "Updating user memories…" step (Claude-style) right after the reply, flipping to "Updated N memories" when done — groundwork for 0004's real tool-call loop.

## Design
- Migration v7 (additive only): `messages.tool_name TEXT NULL`, `messages.tool_state TEXT NULL CHECK IN ('RUNNING','DONE','ERROR')`. Tool rows ride as role `SYSTEM` with `tool_name` set — no CHECK rebuild / table dance; a dedicated role can land with 0004's real tool surface.
- Pump: after persisting the reply, if the turn will distill (completed, non-empty, non-incognito, queue present) insert a tool row (`update_memories`, RUNNING) BEFORE the done chunk, and pass its id in the job payload.
- Worker: `run_distillation` flips the row — DONE with "Updated N memories" (row deleted when the model proposed nothing), ERROR with "Couldn't update memories" on failure.
- Provider hygiene: tool rows are never sent to the provider (request builder filters `tool_name IS NOT NULL`).
- Startup sweep: stale RUNNING tool rows (app killed mid-distill) are deleted.
- Frontend: Message GraphQL surface gains toolName/toolState; hydration maps tool rows to `system` messages with display text; a `SystemMessage` component renders the subtle inline step (spinner while RUNNING); after the done chunk the client refetches the conversation at +2s (picks up the RUNNING row) and +9s (picks up the flip).

## Acceptance criteria
- [ ] A completed non-incognito turn shows "Updating user memories…" in the thread, flipping to "Updated N memories" once the distillation finishes (live, no reload)
- [ ] Tool rows persist: reload/switch shows the step in history
- [ ] Tool rows never reach the provider (grounding test asserts the exact request)
- [ ] Incognito turns show no step; proposed-nothing turns show no lingering step
- [ ] App killed mid-distill: stale RUNNING row swept at startup
- [ ] 0003 behaviors intact (memories CRUD, watcher toasts)

## Constraints
- Additive migration only (no table rebuild, no CHECK changes)
- Tool rows render via assistant-ui's SystemMessage slot — no runtime fork
