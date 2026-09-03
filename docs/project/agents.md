# Project Rules — kanban in git

This directory (`docs/project`) is the project's task tracker. No external board; the repo is the source of truth.

## Layout

```
docs/project/
  agents.md         — this file (workflow rules for agents working here)
  tasks/
    ready/          — queued, actionable. Every new task starts here.
    doing/          — actively being worked. Move the file here when work starts.
    done/           — finished and verified. Move the file here when acceptance criteria are met.
```

## Task file format

- Filename: `XXXX-task-name.md`, `XXXX` = zero-padded task number, unique, never reused.
- A task is a single file. State = which directory the file lives in. Move the file to change state; never copy it.
- `doing` may hold multiple tasks at once (concurrent chats/ops are a product requirement — the board reflects that).
- Keep the file up to date while working (checkboxes, notes). When moved to `done`, the acceptance criteria must all be true.

```md
---
id: XXXX
title: Short title
depends_on:
  - 0002
---
## Goal
What outcome this achieves and why it matters (2-5 sentences).

## Acceptance criteria
- [ ] Concrete, checkable condition
- [ ] Another one

## Constraints
- Anything that bounds the solution (privacy, stack, scope cuts)
```

## Dependencies

- `depends_on` lists the ids that must be in `done/` before this task can be finished. Omit it (or leave it empty) when there are no hard dependencies.
- A dependency is for "cannot verify acceptance without it" — not for "touches the same files". Prefer parallel work; merge conflicts are not dependencies.
- Don't start a task whose dependencies aren't done unless the dep-free portion is explicitly separable — and say so in a note.

## Workflow

1. Pick the next task from `ready/` (lowest number first unless noted otherwise).
2. `git mv docs/project/tasks/ready/XXXX-*.md docs/project/tasks/doing/` when starting.
3. Work it; commit normally. Reference the id in commit messages (`[0003]`).
4. When every acceptance criterion is verified (tests, build, manual check — see `tasks/lessons.md`), move to `done/`.
5. If blocked, keep it in `doing/` and append a `## Blocked` section describing what and why — don't silently stall.
6. `tasks/todo.md` (if present) is a scratch overview; the kanban files are authoritative per-task.

## Numbering

- Next free id: check all three dirs for the max and increment.
- Never renumber; never reuse an id after a task is done.
