---
id: 0006
title: Journal vault (daily entries + calendar feeding memory)
depends_on:
  - 0003
---
## Goal
Land the journal as the memory substrate: daily Markdown entries plus freeform notes stored as plain files in a vault, browsable by calendar/timeline, and indexed into the same single memory store so project chats can cross-reference journal content.

## Acceptance criteria
- [ ] Daily entries + notes as Markdown files on disk (readable without the app); DB holds index/vectors only
- [ ] Calendar/timeline view with yesterday-recap on open
- [ ] Vault content is chunked/embedded locally and retrieved by the global top-k path from task 0003
- [ ] Rich Markdown editor (CodeMirror per roadmap) replaces textarea for entries

## Constraints
- Files outlive the app; DB rebuildable from the vault
- Journal stays opt-in per retrieval (include/exclude journal scope must exist even with global top-k default)
