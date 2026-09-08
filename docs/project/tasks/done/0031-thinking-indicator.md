---
id: 0031
title: Thinking indicator while the model reasons
---

## Goal

Reasoning providers stream `reasoning_content` deltas long before visible
text. Today those deltas are liveness-only (empty chunks), so the composer
sits in a generic running state with no signal that the model is thinking.
The loading state should say "Thinking…" while reasoning deltas flow.

## Design

- Provider stream widens from `String` deltas to a `MessageDelta` enum
  (`Content(String)` / `Reasoning(String)`). Distillation keeps consuming
  content only; reasoning text stays discarded for now — task 0008 owns the
  full trace surface.
- Additive GraphQL contract change (reviewed with the human 2026-09-07):
  `ConversationMessageChunk` gains `reasoning: Boolean!`. The pump forwards
  reasoning deltas as empty chunks with `reasoning: true`.
- Frontend: the runtime tracks threads currently receiving reasoning
  (cleared on first content chunk, done, or finalize); the thread shows a
  subtle "Thinking…" row (tool-step styling) while active.

## Acceptance criteria

- [x] With a reasoning mock, "Thinking…" appears during reasoning deltas
      and disappears when content starts
- [x] Non-reasoning streams never show the indicator (heartbeat chunks are
      `reasoning: false`)
- [x] SDL snapshot + codegen + parity updated; cargo + frontend gates green

## Constraints

- Reasoning text is not rendered or logged (privacy; 0008 will design that).

## Review

- `MessageStream` widened to `MessageDelta` (`Content`/`Reasoning`);
  `parse_chat_delta` classifies `reasoning_content` deltas; distillation
  keeps consuming content only.
- Pump coalesces each reasoning phase into ONE chunk with
  `reasoning: true` (additive `ConversationMessageChunk.reasoning: Boolean!`;
  SDL snapshot + codegen + parity updated). Reasoning text is discarded —
  0008 owns rendering it.
- Frontend: `thinkingThreadIds` on the runtime (cleared on first content
  chunk, done, error, finalize); a subtle "Thinking…" row above the
  composer while active.
- Gotcha encoded in lessons.md: the codegen re-run is required after
  editing a gql document — the first live pass had the flag in the schema
  but not in the client's compiled document.
- Verified live (reasoning mock): "Thinking…" appears at the reasoning
  phase's start (~400ms after send), clears when content streams, never
  shows for non-reasoning streams; reply text and persisted rows exclude
  reasoning (schema test).
