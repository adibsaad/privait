---
id: 0015
title: Stream viewport anchors at bottom (no jarring scroll)
---
## Goal
Switching back to a streaming chat starts the viewport at the top and then visibly scrolls to the bottom — jarring. The chat viewport should already be at the bottom on every switch, with instant (non-animated) scrolling.

## Acceptance criteria
- [ ] Switching to a chat (streaming or not) shows it already scrolled to the bottom — no visible top→bottom jump
- [ ] While a chat streams, the viewport stays pinned to the newest tokens
- [ ] Manual scroll-up during streaming is respected (no forced snap back down)

## Constraints
- Pure frontend (thread viewport props/classes); no runtime changes
