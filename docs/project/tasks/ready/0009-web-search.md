---
id: 0009
title: Web search tool (user-configured backend + query hygiene)
depends_on:
  - 0004
---
## Goal
Add web search as a tool call through the 0004 loop, without breaking the privacy story: search creates a second outbound path beyond the chat provider, so the backend must be user-configured, the query string is the only thing that ever leaves the machine, and the policy defaults to ask. Render queries and cited source URLs visibly in chat.

## Acceptance criteria
- [ ] Search backend is user-configured in Settings (API-key services like Brave/Tavily, or a self-hosted SearXNG URL); no hardcoded default provider
- [ ] `web_search` tool exists with allow/ask/deny per-chat policy; default is `ask`, and the approval prompt shows the exact query string before it leaves
- [ ] Query hygiene verified by test: only the generated query string is sent — never conversation content, file passages, memories, or journal text
- [ ] Chat renders the query and cited source URLs alongside the tool call; answers cite which sources were used
- [ ] Global kill switch (e.g. local-only toggle) disables all search egress in one switch
- [ ] Works non-blocking alongside other tools in concurrent chats (0004 run model)

## Constraints
- Second egress is the whole risk: never let the model prepend context to queries; strip anything beyond the query string
- No page-fetching/reader mode in this task — search results only (fetching arbitrary URLs is its own later decision)
- Results are stored as plain data (cache in DB or memory), never embedded into the global index without an explicit user action