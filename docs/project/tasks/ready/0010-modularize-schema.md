---
id: 0010
title: Modularize schema.rs by domain
---
## Goal
Break the 2,816-line `schema.rs` god file into domain modules (`schema/chat.rs`, `schema/files.rs`, `schema/memories.rs`, `schema/settings.rs`, …) with `schema.rs` as the mount point, before 0002 (projects) adds another 500+ lines to it. Behavior and GraphQL contract unchanged — this is a pure restructure.

## Acceptance criteria
- [ ] `schema.rs` is a mount point (< ~200 lines); resolvers live in domain modules under `schema/`
- [ ] GraphQL contract byte-identical: `pnpm codegen` produces no diff, `pnpm schema:parity` green
- [ ] `cargo test` + `cargo clippy` clean; colocated `#[cfg(test)]` tests moved with their resolvers
- [ ] No behavior change: chat send/stop, upload, rename/archive/delete all verified manually

## Constraints
- Pure restructure — no signature changes, no "small improvements" smuggled in
- Do (or finish) before starting 0002; 0002 depends on this file's new shape