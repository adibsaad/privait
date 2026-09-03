---
id: 0007
title: MCP client + chat search + model picker
depends_on:
  - 0004
  - 0008
---
## Goal
Extend the workspace outward and make it navigable: a local-stdio MCP client with per-tool policy, full-text chat search, and a model/effort/thinking picker — the last mile that makes daily use pleasant.

## Acceptance criteria
- [ ] MCP client supports local stdio servers; per-tool allow/ask/deny + per-chat enable; secrets stay in OS keychain (or documented interim store)
- [ ] Chat search across threads (full-text; semantic only if cheap)
- [ ] Model picker + effort/thinking toggles wired to provider capabilities (depends on 0008)

## Constraints
- No MCP directory, OAuth proxy, or cloud-relayed remote MCP in v1
- No side-chats, worktrees, or usage-ring in v1
