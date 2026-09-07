# Incognito QA follow-ups — 2026-09-07

Branch: `t3code/memory-toast-plural-fixes`

## Tasks
- [x] [0027] Incognito badge/toggle survive restart — done (moved to done/)
- [x] [0028] Start a new chat incognito from the composer — done (moved to done/)
- [x] Verify: cargo fmt/clippy/test, SDL snapshot + codegen, schema parity,
      tsc -b + vite build + eslint + vitest run — all green
- [x] Live smoke (serve_dev + vite, isolated data dir, mock provider):
      badge persists across reload, "Leave incognito" works post-restart,
      global + project composer toggles birth incognito chats with badge,
      no distillation step in incognito chats

## Status
Both tasks verified and closed. Changes NOT yet committed — awaiting the
human's go (they are running their own memories QA pass on top).