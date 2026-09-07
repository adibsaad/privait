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
- [x] A completed non-incognito turn shows "Updating user memories…" in the thread, flipping to "Updated N memories" once the distillation finishes (live, no reload)
- [x] Tool rows persist: reload/switch shows the step in history
- [x] Tool rows never reach the provider (grounding test asserts the exact request)
- [x] Incognito turns show no step; proposed-nothing turns show no lingering step
- [x] App killed mid-distill: stale RUNNING row swept at startup
- [x] 0003 behaviors intact (memories CRUD, watcher toasts)

## Constraints
- Additive migration only (no table rebuild, no CHECK changes)
- Tool rows render via assistant-ui's SystemMessage slot — no runtime fork

## Review
- Migration v7: `messages.tool_name` + `tool_state` (additive; tool rows ride as role SYSTEM — no CHECK rebuild).
- Pump inserts the RUNNING step row after persisting the reply (before the done chunk) when the turn will distill; the job carries its id.
- Worker settles the row via `finish_tool_message`: DONE "Updated N memories" / deleted when the model proposed nothing / ERROR on failure. Startup sweep deletes stale RUNNING rows.
- Provider hygiene: request builder filters tool rows out (asserted by the grounding-style request test).
- Frontend: hydration maps tool rows → `system` runtime messages via `toolStepText`; a `SystemMessage` component renders the subtle inline row (spinner while text trails with '…'); post-done refetches at +2s/+7s reconcile the step live (merge preserves optimistic rows).
- Verified live end-to-end: turn → step row RUNNING → worker → DONE "Updated 2 memories" → rendered in the thread without a reload. 115 tests green, clippy/fmt/tsc/eslint/vitest/build green.
