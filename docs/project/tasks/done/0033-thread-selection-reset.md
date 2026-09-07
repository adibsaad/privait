---
id: 0033
title: Selected chat resets to the first thread during sends and distills
---

## Goal

The selected chat jumped to the first conversation whenever a message was
sent or the memory pipeline started. Root cause: ThreadProvider's effect
re-ran `setCurrentThreadId(pickInitialThreadId(...))` on EVERY
AllConversations cache emission — and the settle-polls' message writes and
the post-send title fetch re-emit that query constantly.

## Design

The boot selection runs exactly once (a ref guards it); later data emissions
only refresh the lists. Archive/delete flows already manage selection
themselves.

## Acceptance criteria

- [x] Sending in a non-first conversation keeps it selected through the
      reply and the settle-poll window (verified live, 11s of polls)
- [x] Frontend gates green (tsc, build, eslint, vitest)

## Constraints

- Boot behavior unchanged: never restore into an archived chat.
