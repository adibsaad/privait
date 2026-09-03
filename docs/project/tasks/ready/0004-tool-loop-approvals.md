---
id: 0004
title: Tool loop + approvals (local read/write, non-blocking)
depends_on:
  - 0001
---
## Goal
Give the assistant hands: extend the provider abstraction with a tool-calling loop (request → tool_calls → execute → re-request) and ship the first tool set — three auto-allow reads, one approval-gated write, one memory write. All tool work runs non-blocking across chats.

## Acceptance criteria
- [ ] `ChatProvider` trait supports tools round-trip (multi-step loop inside the spawned run task)
- [ ] First tool set, all scoped to explicitly granted folders / project knowledge / vault:
  - [ ] `read_file` (auto-allow) — read a file without the upload dance
  - [ ] `search_files` (auto-allow) — semantic search over the existing sqlite-vec index
  - [ ] `search_history` (auto-allow) — transcript search; query backend comes from 0003, this task wires it into the loop
  - [ ] `write_file` (ask, with diff preview) — the only hands in v1; deny-by-default outside granted folders
  - [ ] `remember` (auto when the user says "remember this"; notify + undoable via Memories UI when model-initiated)
- [ ] Tool calls/approvals render in chat (assistant-ui) with status (pending/approved/denied/ran)
- [ ] Multiple chats can run tools concurrently without blocking the composer

## Constraints
- Approvals are per-tool per-chat (allow/ask/deny) and revocable; reads never leave the granted scope
- Deferred to later tasks, NOT this one: shell/command execution, web search/fetch, MCP servers (0007), artifact ops (0005)
