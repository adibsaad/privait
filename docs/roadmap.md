# Privait — Roadmap

See [vision.md](vision.md) for mission, principles, and product pillars. The task board in `docs/project/tasks/` (`ready/` → `doing/` → `done/`) is the authoritative, always-current plan; this doc holds direction and the decisions log. See [agents-guide.md](agents-guide.md) for how agents work in this repo.

## Where we are

The Tauri desktop migration described below is **done**: React frontend + Rust core in one process, SQLite + sqlite-vec, local embeddings, OpenAI-compatible providers, per-chat file grounding, global memories (read path), streaming chat with attachments. The original client/server web app stack (Fastify/Postgres/pgvector/SQS/Redis/S3) survives only in git history.

## Direction

Privait is growing from "journal with grounded chat" into a **full private workspace** — projects, agentic tools, artifacts, one global memory — with journaling as the memory layer. Feature depth targets the best desktop AI workspaces; the differentiator stays privacy: local-first, inspectable, permissioned.

The build order is tracked on the kanban board (tasks `0001`–`0011`); the phases they implement, in order:

1. **Safety & structure** — run registry (concurrency), schema modularization, dead-code hygiene
2. **Organize** — projects: container, instructions, knowledge, project-scoped grounding
3. **Remember** — memory management plane: CRUD, distillation, top-k retrieval, history search backend
4. **Do** — tool loop + approvals (read/write, non-blocking), then artifacts with versions; thinking traces alongside
5. **Capture** — journal vault: daily entries + calendar as plain Markdown, indexed into the same memory
6. **Extend** — MCP (local stdio), chat search, model picker, web search (query-hygiene-first)

## Decisions

- **Core:** Rust backend, TypeScript frontend, in a Tauri shell. No Node sidecar.
- **Editor:** a rich Markdown editor (CodeMirror-based), not a plain textarea.
- **Scope:** full workspace — projects + tools + artifacts + journal-as-memory. Journal lands after the workspace foundations; it feeds the memory rather than being the product's cage.
- **Memory:** one global store; per-turn top-k across everything with a threshold; explicit `search_history` tool for transcript lookup (project-scoped default); incognito excludes from read, write, and search.
- **Agency:** tool calls with per-tool per-chat allow/ask/deny, deny-by-default outside granted folders, non-blocking concurrent runs. First set: read_file, search_files, search_history, write_file, remember. Shell/computer-use deferred.
- **Thinking/reasoning:** OpenAI-compat providers first (reasoning fields + `` fallback), then llama.cpp; one provider-normalized ReasoningTrace. No Anthropic-protocol specifics.
- **Web search:** user-configured backend, query-string-only egress, default ask, global kill switch (task 0009).
- **Model strategy:** OpenAI-compatible providers for development velocity; llama.cpp behind the same provider abstraction; local inference before RC.
- **License:** AGPL-3.0.