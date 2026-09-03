# Privait Workspace Plan — private Claude Desktop + journal memory

## Decisions locked (2026-09-03)
- [x] Scope = full workspace (projects + files + chat grounded in all of it)
- [x] Memory = single global store, intelligent per-chat retrieval (cross-chat references like Claude Code valued over strict isolation)
- [x] Agency = yes, tool calls with explicit approvals; non-blocking, multiple concurrent chats/ops
- [x] Positioning = Claude Desktop depth, private by default; never name the clone in docs

## Vision.md deltas (to apply)
- [ ] Header: "private, local-first AI journal" → "private, local-first AI workspace; journaling is the memory layer"
- [ ] Principle 3: "mirror, not oracle" → "mirror with hands": reflect by default, act only with explicit permission; every side-effect inspectable/revocable
- [ ] New principle: "concurrent by design" — AI work never blocks writing; runs are cancellable background ops
- [ ] Pillars 4 → 5: Capture / Organize (projects) / Do (tools + artifacts) / Remember (single global memory) / Reflect
- [ ] "Is Not": delete "Not a generic AI workspace"; replace with "Not a cloud agent that acts opaquely"

## Feature map (Claude Desktop → Privait, private)
- [ ] Projects: container {name, instructions, knowledge folder, chat list}; grounding = project files + global memory; NO cloud sync, NO sharing v1
- [ ] Artifacts: side-pane md/html/svg/code + copy/download + versions + in-place edit; NO public links, NO gallery v1
- [ ] Memory: file-backed topics (MEMORY.md style) + per-project memory + inspect/edit/delete UI + incognito toggle; single vector store, per-turn top-k with threshold; NO auto-topic black box v1 (explicit save + post-chat distillation job)
- [ ] Tools: folder grant + read/write with allow/ask/deny per tool per chat; web search later; NO computer-use, NO terminal pane v1
- [ ] MCP: client + local stdio servers + per-tool policy + secrets vault; NO directory, NO OAuth proxy, NO cloud relay v1
- [ ] Chat UX: multi-chat sidebar (exists) + search + model/effort/thinking toggles; NO side-chats, NO worktrees, NO usage ring v1

## Load-bearing gaps (from audit)
- [ ] G1: file grounding is per-chat only (`retrieval.rs` scopes via message→conversation); needs project/entry scoping columns + KNN strategy rethink
- [ ] G2: no tool loop — `provider.rs` is single POST → SSE text; needs tools param + iterate (request→tool_calls→execute→re-request) + tool-state rendering in assistant-ui
- [ ] G3: memories are write-only vectors (no id/timestamps/source, no CRUD resolvers, no distillation); needs schema + management plane + provenance

## Phased build
- [ ] Phase 0 — safety: per-conversation run registry (no double-send race), stop = real abort, background-run resumption
- [ ] Phase 1 — Organize: `projects` table + sidebar + per-project instructions + knowledge folder; retrieval gains project scope
- [ ] Phase 2 — Remember: memories CRUD (GraphQL + UI) + source/timestamps + post-chat distillation job (apalis) + incognito flag + retrieval tuning (global top-k across files+memories+journal)
- [ ] Phase 3 — Do (tools): `ChatProvider` tools extension + local read/write tools + approval UX + non-blocking runs across chats
- [ ] Phase 4 — Do (artifacts): `artifacts` + versions tables + side-pane renderer + fork-from-message
- [ ] Phase 5 — Capture: journal daily entries as Markdown vault + calendar + vault feeds same memory index (this is when "memory substrate" becomes real)
- [ ] Phase 6 — Extend: MCP client (local stdio) + per-tool policy UI + chat search + model picker/effort/thinking toggles

## Learning vector (job-relevant, in order)
Phases teach: structured RAG + eval of retrieval → agentic tool loops + approvals → MCP protocol → local inference packaging. Each phase is portfolio-demonstrable.

## Review
- (pending user approval of scope/order before touching vision.md)
