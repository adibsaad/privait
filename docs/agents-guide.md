# Agents Guide — how to work in this repo

This repo is written by AI agents. The human directs, reviews architecture and design decisions, and is the only judge of UX. Agents implement. This guide exists so an AI-written codebase stays consistent, auditable, and scalable over time.

Related: [AGENTS.MD](../AGENTS.MD) (working style, always loaded) · [project/agents.md](project/agents.md) (task board rules) · [tasks/lessons.md](../tasks/lessons.md) (live gotcha log).

## 1. Session start ritual

Do this before writing any code:

1. Read `tasks/lessons.md` — short, and every entry was a real failure.
2. Read your task file in `docs/project/tasks/` plus its `depends_on`.
3. Check the "Design decisions and why" table in `docs/architecture.md` before doing anything that contradicts one.
4. Explore with subagents; read only the files you need. Context is budget.

## 2. Decision protocol — who decides what

The human's review time is the scarcest resource. Protect it by escalating the right things and nothing else.

**You decide autonomously** (within the task's Constraints): internal structure, naming within conventions, test design, error handling, refactor order inside touched files.

**Propose in writing before implementing:**
- Any new outbound network path — even "just" an HTTP call. This is a privacy product; egress is a design decision.
- New dependencies (Rust crate or npm package).
- DB schema changes and migrations.
- GraphQL contract changes (`src-tauri/src/schema.rs` is the API contract; run `pnpm codegen` after changing it).
- Scope beyond the task file, or work whose acceptance criteria you can't verify yourself.
- Deleting or rewriting code someone else's task produced.

**How to propose:** append a `## Design` section to the task file with the options and your recommendation, then stop and present it. The decision, once made, gets recorded — in the task file and (if architectural) in `docs/architecture.md`. **Decisions that live only in chat are lost.**

## 3. Privacy invariants (non-negotiable)

Violating any of these fails review regardless of everything else:

- No telemetry, analytics, error reporting, or version checks. Ever.
- No logging of user content — journal entries, messages, file text, memories. Logs carry metadata only.
- All processing (embedding, extraction, indexing) runs locally. Data leaves the machine only through providers the user configured, only when the user sends.
- When in doubt, the vision doc's principle 1 wins: "Private by default, provable." Code must be auditable to prove it.

## 4. Verification protocol — Definition of Done

A task is done when **all** of these hold, not when the code compiles:

- [ ] Backend: `cargo test` and `cargo clippy` clean in `src-tauri/`
- [ ] Frontend: `pnpm exec tsc -b` (typecheck — `vite build` does NOT typecheck), `vite build`, `pnpm lint`
- [ ] Schema touched: `pnpm codegen` then typecheck again; `pnpm schema:parity` if it exists for the change
- [ ] Migrations are append-only: never edit an applied migration; verify the old→new path opens and rebuilds
- [ ] Every acceptance criterion in the task file checked off **with evidence** (test name, build output, or manual check description)
- [ ] Task file moved `doing/ → done/` with `git mv`; commit message references the id (`[0003]`)
- [ ] If you got corrected mid-task: lesson captured in `tasks/lessons.md`
- [ ] Docs touched by the change are updated in the same commit (architecture table rows, docstrings-of-record)

## 5. Scope discipline

- Finish the task file, nothing else. Spot an unrelated bug? File a task in `ready/` — one line, link the file paths — and move on. No drive-by fixes.
- Refactors get their own task. If a refactor is required to do your task, note it in the task file and keep it minimal.
- Tasks should be ≤ one working session. If yours clearly isn't, split it into `00XX-a` / `00XX-b` (or a new id) rather than leaving a zombie in `doing/` for weeks.
- Two agents working in parallel must touch disjoint files. Check `doing/` for overlapping tasks before starting; if overlap is unavoidable, note the claim in the task file and take it in sequence.

## 6. Code health (specific to an AI-written codebase)

- No human reads every line; auditors do. Write code that survives an audit: boring, explicit, no cleverness that needs a paragraph comment to justify.
- Dead code and unused deps accumulate silently in AI-written repos. If you notice rot, file a hygiene task. Periodic audit tasks are normal maintenance here, not churn.
- Prefer deleting over commenting out; prefer stdlib/existing deps over adding one.
- Consistency beats preference: match the neighboring code first, convention doc second, your taste last.

## 7. Doc routing — where knowledge lives

| You learned... | It goes in |
|---|---|
| A correction from the user / a thing that bit you | `tasks/lessons.md` (same session, always) |
| A stable, general convention (promoted from lessons) | This guide, §8 |
| An architecture/design decision and its why | `docs/architecture.md` decisions table |
| A product direction change | `docs/vision.md` + `docs/roadmap.md` (human approves) |
| How to work on the board | `docs/project/agents.md` |

Docs are the org memory between fresh agent sessions. An agent that fixes docs *while fixing code* doubles its value.

## 8. Conventions (promoted from lessons.md)

- Tailwind is v3.4: write `data-[active=true]:` / `group-data-[active=true]:`, never v4 bare variants (silently dropped, no build error).
- shadcn was installed with `cssVariables: false` — token classes (`bg-muted` etc.) resolve to nothing unless mapped in `tailwind.config.js` + `index.css` HSL vars.
- Axum layer order is load-bearing: CORS sits OUTSIDE auth middleware. After router refactors, test preflight against the real `build_router`.
- vitest: `pnpm exec vitest run` — plain `pnpm test` hangs in watch mode.
- vec0 quirks: distance constraints enforced per-row by SQLite; `LIMIT n` caps KNN reach — use big `k` for full-corpus queries; keep f32 tolerance on thresholds. (Details in `tasks/lessons.md`.)
- pnpm only (`packageManager` pins the version). No npm/yarn lockfiles.

## 9. Code design conventions

Boring, explicit, domain-shaped. These rules exist so that nine more features don't rot the structure.

**Module budgets & extraction.** A file earning >500 lines must justify itself; the default is extraction. Resolvers are grouped by domain module (`schema/chat.rs`, `schema/files.rs`, `schema/projects.rs`, …) with `schema.rs` as the mount point — never append new resolvers to a monolith. Same rule frontend-side: a component >300 lines is usually two components.

**Layer boundaries.** Request flow is one direction: UI → GraphQL contract → domain service (`retrieval.rs`, `files.rs`, …) → db/storage. Resolvers stay thin (parse args, call service, map errors) — no SQL in resolvers, no provider calls outside the `ChatProvider` trait, no business logic in SQL strings.

**Error handling.** Rust: `thiserror` per module; no `unwrap()`/`expect()` outside `#[cfg(test)]` — a panic in the engine kills a run, and 0001's registry means every run is precious. Errors map to GraphQL errors that the UI can toast, not to logs-only. Frontend: no silent catches; every error path surfaces visibly.

**State discipline (frontend).** Server state lives in Apollo only; ephemeral UI state in zustand; a `useState` that mirrors server data is a bug waiting to desync. Streaming/protocol logic belongs in `providers/`, never in components.

**Async discipline.** Every `tokio::spawn` is registered somewhere cancellable (run registry) and writes user data only through the persistence path — detached tasks that "fire and forget" writes are forbidden. New background work goes through the jobs queue, not ad-hoc spawns.

**Testing.** Colocated tests (`#[cfg(test)]` in Rust, `*.test.ts` next to the file) — already the repo norm, keep it. Every bug fix lands with the regression test that would have caught it. Probe-based tests for native quirks (see vec0 in lessons) — when a library surprises you, write the probe down as a test, not a comment.

**Naming.** Use the domain language of `vision.md`: entry, memory, artifact, project, vault. No abbreviations, no `handleStuff`, no `utils` grab-bags — a module named `utils` is a design failure deferred.

**Formatting is law, not preference.** Prettier + husky + lint-staged and `cargo fmt` run on commit; never hand-format, never fight the tooling, never reformat untouched lines (diff noise costs review time).