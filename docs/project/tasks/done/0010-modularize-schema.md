---
id: 0010
title: Modularize schema.rs by domain
---
## Goal
Break the 2,816-line `schema.rs` god file into domain modules (`schema/chat.rs`, `schema/files.rs`, `schema/memories.rs`, `schema/settings.rs`, …) with `schema.rs` as the mount point, before 0002 (projects) adds another 500+ lines to it. Behavior and GraphQL contract unchanged — this is a pure restructure.

## Acceptance criteria
- [x] `schema.rs` is a mount point (< ~200 lines); resolvers live in domain modules under `schema/`
- [x] GraphQL contract byte-identical: `pnpm codegen` produces no diff, `pnpm schema:parity` green
- [x] `cargo test` + `cargo clippy` clean; colocated `#[cfg(test)]` tests moved with their resolvers
- [x] No behavior change: chat send/stop, upload, rename/archive/delete all verified manually

## Constraints
- Pure restructure — no signature changes, no "small improvements" smuggled in
- Do (or finish) before starting 0002; 0002 depends on this file's new shape

## Review
- `schema/mod.rs` = 92 lines (mount point): shared `GqlError`, `AppSchema`/`SchemaContext`/builders, re-exports. Domain modules: `chat.rs` (conversation/message types + streaming subscription + `FirstChunkTimeout`), `mutation.rs` (write surface + result unions), `query.rs`, `files.rs`, `settings.rs`, `user.rs`.
- Tests colocated per domain in `schema/tests.rs` (chat/query/mutation submodules) with the shared harness in `schema/tests_support.rs` (mock provider, SDL builders, multipart helpers).
- Contract untouched: SDL snapshot identical, `pnpm codegen` no diff, `pnpm schema:parity` green after adding the reviewed `stopRun` deviation from 0001 to the allowlist.
- 94 backend tests green, clippy clean, frontend tsc/eslint/vitest/build green.