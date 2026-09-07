---
id: 0003
title: Memory management plane (CRUD + distillation + retrieval tuning)
---
## Goal
Turn memories from a write-only vector sidecar into an inspectable layer: users can view/edit/delete memories, new memories distill from chats via a background job, and retrieval works on two paths — cheap automatic top-k every turn plus an explicit `search_history` tool for deep transcript lookup (visible tool call, user- or model-invoked).

## Acceptance criteria
- [x] Memories have id/timestamps/source/provenance; GraphQL CRUD + a Memories UI (list/edit/delete)
- [x] Post-chat distillation job on the apalis queue proposes or writes memories (explicit + automatic paths decided)
- [x] Incognito flag per chat bypasses memory read and write (and excludes the chat from future search)
- [x] Automatic path: top-k across the whole store (files + memories + journal) with tunable threshold, verified by a "March burnout"-style cross-chat query test
- [x] On-demand path: `search_history` query backend (full-text over transcripts, project-scoped by default with a whole-vault option), verified by a direct query test; tool-loop exposure and visible tool-call rendering happen in 0004. Raw transcripts are searched in place, never duplicated into memory

## Review
- Backend: migration v5 (`memories` table + `memories_vec` vec0 index, `conversations.incognito`, `messages_fts` external-content FTS with sync triggers); `memories.rs` (CRUD with re-embed-on-update, provenance, incognito check, distillation handler with bounded `MEMORY:` parsing); retrieval (`related_memories` over the new index + per-turn tunable threshold via `retrieval.threshold`, incognito read bypass; `search_history` FTS with project scoping + wholeVault + incognito exclusion); jobs (`AppJob` enum, distillation worker with incognito re-check); subscription enqueues distillation after completed non-incognito turns; GraphQL Memory type + CRUD + incognito + searchHistory (108 tests green, clippy clean).
- Verified: cross-chat grounding ("March burnout" distilled in chat 1 grounds chat 2), threshold raised to 0.95 silences it, incognito skips reads/writes/search, distill handler writes provenance-tagged memories through a real SSE mock, search project scoping + wholeVault + incognito + FTS-punctuation robustness (direct unit + schema tests).
- Frontend: Settings → Memories section (list/add/edit/delete with source + provenance footer), per-chat Incognito toggle in the thread menu with an eye-off badge; verified in the browser — manual memory created and deleted through the UI, incognito flag persisted and reverted.

## Constraints check
- No hidden profiling: everything stored is in the Memories UI with provenance and one-click delete ✓
- Embeddings stay local (fastembed), distillation goes only to the user-configured provider ✓

## Constraints
- No hidden profiling: everything stored is visible and deletable
- Embeddings stay local (fastembed); no cloud embedding calls

## Design
- Migration v5: replace the write-only vec0 `memories` sidecar with an inspectable pair — a regular `memories` table (id, content, source TEXT CHECK IN ('manual','distilled'), conversation_id NULL for provenance, created_at/updated_at) plus `memories_vec` vec0 (`+memory_id` aux column). The old sidecar has no writer and no rows in the wild, so the swap is safe. Updating a memory re-embeds; deleting removes both rows.
- Paths decided (todo.md): explicit = `createMemory` (manual saves); automatic = a post-chat distillation job on the apalis queue writes proposed memories tagged `source='distilled'` + provenance conversation. Nothing hidden: everything shows in the Memories UI and is deletable.
- Queue: `ProcessFileJob` becomes an `AppJob` enum; worker matches variants. Distillation runs after every completed, non-incognito turn (job handler distills the last user/assistant exchange through the configured provider into ≤2 memories).
- Incognito: `conversations.incognito` + `setConversationIncognito` mutation; skips memory read (grounding), memory write (no distillation job), and search_history.
- Tunable threshold: `retrieval.threshold` settings key (default 0.5, same constant) read per turn by the memories path; files keep the pinned threshold (distance/tolerance behavior in db.rs is unit-pinned).
- `search_history`: FTS5 over message transcripts (`messages_fts`), project-scoped by default (the calling conversation's project; plain chats search the vault), `wholeVault` override, incognito chats always excluded. Tool-loop exposure is 0004's job.
- Memories UI: a Settings-dialog section (list/edit/delete — matches the existing sections pattern).
- Journal is Phase 5 — "whole store" covers files + memories today; transcripts stay in place (searched, never copied).
