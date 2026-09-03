## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update 'tasks/lessons.md' with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way,"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to 'tasks/todo.md' with checkable items
2. **Clarify plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to 'tasks/todo.md'
6. **Capture Lessons**: Update 'tasks/lessons.md' after corrections

## Project Board

- Kanban lives in `docs/project/tasks/` (`ready/` → `doing/` → `done/`); rules in `docs/project/agents.md`.
- Every task is one `XXXX-name.md` file; state = which dir it's in. Move with `git mv`, never copy.
- New tasks start in `ready/`; multiple tasks may be in `doing/` at once.
- Keep `docs/project/tasks/ready/` seeded from the current plan; `tasks/todo.md` is scratch, kanban files are authoritative.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Agent Protocol (AI-driven repo)

This repo is written by agents; the human directs and reviews architecture/design. Full protocol: `docs/agents-guide.md` — read it once before your first task here. Hard rules that always apply:

- **Session start**: read `tasks/lessons.md` + your task file before coding; check `docs/architecture.md`'s decision table before contradicting a decision.
- **Escalate before implementing** (append a `## Design` section to the task file, then stop): new outbound network path, new dependency, DB schema/migrations, GraphQL contract changes, scope beyond the task file.
- **Privacy invariants**: no telemetry; never log user content; all processing local; data leaves only via user-configured providers. Violation = failed review, always.
- **Doc routing**: corrections → `tasks/lessons.md`; decisions → `docs/architecture.md`; direction → vision/roadmap (human approves). Decisions that live only in chat are lost.
- **Scope discipline**: finish the task file, nothing else; file unrelated bugs as tasks; parallel agents touch disjoint files.


# Local rules

See @AGENTS.local.md if it exists

