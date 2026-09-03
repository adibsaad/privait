---
id: 0003
title: Memory management plane (CRUD + distillation + retrieval tuning)
---
## Goal
Turn memories from a write-only vector sidecar into an inspectable layer: users can view/edit/delete memories, new memories distill from chats via a background job, and retrieval works on two paths — cheap automatic top-k every turn plus an explicit `search_history` tool for deep transcript lookup (visible tool call, user- or model-invoked).

## Acceptance criteria
- [ ] Memories have id/timestamps/source/provenance; GraphQL CRUD + a Memories UI (list/edit/delete)
- [ ] Post-chat distillation job on the apalis queue proposes or writes memories (explicit + automatic paths decided)
- [ ] Incognito flag per chat bypasses memory read and write (and excludes the chat from future search)
- [ ] Automatic path: top-k across the whole store (files + memories + journal) with tunable threshold, verified by a "March burnout"-style cross-chat query test
- [ ] On-demand path: `search_history` query backend (full-text over transcripts, project-scoped by default with a whole-vault option), verified by a direct query test; tool-loop exposure and visible tool-call rendering happen in 0004. Raw transcripts are searched in place, never duplicated into memory

## Constraints
- No hidden profiling: everything stored is visible and deletable
- Embeddings stay local (fastembed); no cloud embedding calls
