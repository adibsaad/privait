# Privait — Vision

Privait is a private, local-first AI workspace: a desktop app where your notes, journal, projects, and files live as plain files on your machine, and an AI that **only you can read** — and that acts **only with your permission** — helps you think and do.

It is a thinking companion with hands. It remembers everything you've written, reflects your own words back with insight, and can act on your behalf — reading your files, drafting your documents, running your errands across apps — while your data never leaves your device, unless you explicitly route a message to a zero-logging cloud provider or approve a tool that reaches out.

Journaling is the memory layer, not the whole product. What you write in the morning about a worry can inform what the assistant drafts for you at noon — because everything you capture feeds one private memory you own, inspect, and can delete.

## Principles

1. **Private by default, provable.** Local models by default. Cloud inference only through providers with no-logging / zero-retention policies, explicitly opted in, per-message or per-provider. No telemetry, no analytics, no phone-home. Every outbound path is user-configured and inspectable; the privacy claim is verifiable against open source.
2. **Local-first data.** Notes, journal entries, and files are plain files on disk (Markdown), readable and exportable forever without Privait. The database (SQLite) holds indexes, vectors, and metadata — all rebuildable from the files. Delete the app, keep your words.
3. **A mirror with hands.** Reflective by default: it asks questions, spots patterns, reflects your material back. Agentic only with permission: tools run locally, are deny-by-default outside granted scope, and every side effect — a file written, a command run, a network call — is visible, attributable, and revocable. It never trains on user data.
4. **Fast is a feature.** A workspace you open daily must open instantly. Writing is never blocked by AI work; generation streams; tool runs happen in the background.
5. **Concurrent by design.** Several chats and operations run at once. AI work is asynchronous and cancellable; the human stays in control of parallel work, and the interface makes that parallelism legible.
6. **Single-user, single-device first.** Optimize ruthlessly for one person on one machine. Sync, multi-device, and sharing are later concerns (E2E-encrypted, optional) — not the core.
7. **Open source, always.** A privacy tool whose users can't inspect it is asking for trust instead of earning it. The full codebase is public and auditable; "no telemetry" must be a claim anyone can verify against the source. No proprietary dependencies in the critical path where an open equivalent exists; reproducible builds; AGPL-3.0.

## Product Pillars

### 1. Capture — journal & notes
- Daily journal entries with a calendar/timeline view; freeform notes with wiki-links and tags, stored as plain Markdown files.
- Gentle friction-reducers: yesterday-recap on open, optional guided prompts, streaks handled kindly (no guilt mechanics).
- Everything captured feeds the same private memory — capture is how the workspace learns who you are.

### 2. Organize — projects
- A project is a container: its own instructions, knowledge files, chats, and context — for a body of work, not a single conversation.
- Global memory still reaches into projects (cross-referencing is the point), but project scope keeps focus where it belongs.
- Local-only. No sharing, no sync tax on the core.

### 3. Do — tools & artifacts
- A visible tool loop: read files, search history, write drafts — each call shown, each write approved. Deny-by-default outside granted folders.
- Artifacts as durable outputs: rendered Markdown/HTML/SVG/code with versions and rollback, living beside the chat — not lost in scrollback.
- Deferred deliberately: shell execution, computer use — anything with broad blast radius needs its own design pass.

### 4. Remember — one private memory
- A single memory store over everything: entries, notes, files, chats. Retrieval is per-turn top-k with a threshold, tuned to cross-reference rather than silo.
- On demand, deeper: a search-history tool that finds what you actually said, in the transcript, without duplicating it into memory.
- Memories are inspectable, editable, deletable — no hidden profile. Incognito chats leave no trace.

### 5. Reflect — the workspace that talks back
- Weekly/monthly reviews, pattern detection, "you mentioned X three times this month" — across journal *and* projects ("what stalled this week?").
- Prompts grounded in real material, not generic affirmations.
- Reflection is opt-in and always visible as derived content — never silently injected.

## What Privait Is Not

- Not a chat app with a notebook bolted on. Writing and capture are the primary surfaces; chat serves them.
- Not a cloud service. There is no Privait server that sees your data, ever.
- Not an agent that acts opaquely. Capability without inspectability is a privacy violation with extra steps; tools are permissioned, local, and auditable.
- Not multi-user. No accounts, no collaboration mode, no team features.

How the system works is described in [architecture.md](architecture.md); how we work is described in [agents-guide.md](agents-guide.md); architecture direction, roadmap, and open questions live in [roadmap.md](roadmap.md).