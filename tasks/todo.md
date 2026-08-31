# Tauri MVP — tasks

Source of truth: `tauri_mvp.md`. This file tracks the current milestone's working checklist.

## M0 — Scaffold ✅

- [x] `src-tauri/`: Tauri 2 + axum + async-graphql skeleton (token-auth'd localhost server, free port)
- [x] `tauri.conf.json`: `devUrl` → Vite :4000, `beforeDevCommand` boots frontend
- [x] Tauri command `server_info` returns base URL + per-launch token; frontend `lib/tauri.ts` + `resolveBaseApiUrl()` seam
- [x] `@tauri-apps/cli` (root) + `@tauri-apps/api` (frontend) deps; `pnpm app:dev` script
- [x] CI: `cargo fmt/clippy/test` job added; existing pnpm job untouched
- [x] Verify: cargo fmt/clippy/test green; `pnpm tauri dev` opens existing UI, server boots in-process

## Review

- `src-tauri/src/server.rs` — axum + async-graphql skeleton: binds `127.0.0.1:0` (sync, safe from Tauri's non-async `setup` hook), per-launch 32-char bearer token via axum middleware, CORS allowlist for dev (:4000) + tauri:// origins, `health` query. 5 unit tests cover token auth + free-port bind.
- `server_info` command hands `{ baseUrl, token }` to the webview; `resolveBaseApiUrl()` in `consts.ts` is the seam M1's Apollo rewiring plugs into. Web dev flow untouched.
- Fixed pre-existing build break: `main.tsx` imported `ApolloProvider` from `@apollo/client` (v3 path); v4 exports it from `@apollo/client/react`. `vite build` had never been in CI, so only dev's stale `.vite` cache masked it.
- Smoke test passed: app window opened, vite 200, API server 401 without token on free port. Known issue: stale `src/frontend/node_modules/.vite` cache referenced apollo v3 after upgrade — cleared; `rm -rf src/frontend/node_modules/.vite` if deps ever resolve wrong again.
- Left as-is per user: frontend `pnpm test` run (vitest watch mode; not part of M0 verification).

## Next

M1 — Core plumbing (SQLite + sqlite-vec, apalis `jobs.db`, schema skeleton, Apollo repoint, WS subscription smoke test).