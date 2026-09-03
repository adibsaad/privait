---
id: 0005
title: Artifacts side-pane (render + versions + edit)
---
## Goal
Render durable work products beside the chat: Markdown/HTML/SVG/code artifacts with copy/download, version history with rollback, and in-place edit ("edit with assistant"). Artifacts persist per chat/project, not as loose chat text.

## Acceptance criteria
- [ ] `artifacts` + versions tables; fork-from-message creates an artifact
- [ ] Side-pane renders md/html/svg/code (sandboxed HTML) with copy/download
- [ ] Version selector with rollback; edits create new versions, never silently overwrite
- [ ] Works over local data only; no publish/share in v1

## Constraints
- HTML preview must be sandboxed (no network except allowlisted fonts/CDN or data-URIs)
- Reuse existing chat persistence patterns (conversations/messages) rather than inventing new storage
