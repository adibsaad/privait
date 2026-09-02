# Privait — Vision

Privait is a private, local-first AI journal: a desktop app for note-taking, journaling, and reflection where an AI that **only you can read** helps you think.

A thinking companion that lives entirely on your machine. It helps you start writing, remembers everything you've written, and reflects your own words back to you with insight — while your writing never leaves your device, unless you explicitly route a message to a zero-logging cloud provider for more horsepower.

## Principles

1. **Private by default, provable.** Local models by default. Cloud inference only through providers with no-logging / zero-retention policies, explicitly opted in, per-message or per-provider. No telemetry, no analytics, no phone-home. Network activity should be inspectable by the user.
2. **Local-first data.** Notes and journal entries are plain files on disk (Markdown), readable and exportable forever without Privait. The database (SQLite) holds indexes, vectors, and metadata — all rebuildable from the files. Delete the app, keep your words.
3. **The AI is a mirror, not an oracle.** It reflects the user's own material back at them, asks questions, spots patterns. It does not pretend to know better, and it never trains on user data.
4. **Fast is a feature.** A journal you open daily must open instantly. AI features must never block writing. Generation streams; the app stays responsive while a local model warms up.
5. **Single-user, single-device first.** Optimize ruthlessly for one person on one machine. Sync, multi-device, and sharing are later concerns (E2E-encrypted, optional) — not the core.
6. **Open source, always.** A privacy tool whose users can't inspect it is asking for trust instead of earning it. The full codebase is public and auditable; "no telemetry" must be a claim anyone can verify against the source. Decisions that follow from this: no proprietary dependencies in the critical path where an open equivalent exists, reproducible builds, and a license that prevents a closed-source fork from being passed off as Privait (AGPL-3.0).

## Product Pillars

### 1. Capture — notes & journal
- Daily journal entries with a calendar/timeline view; freeform notes with wiki-links and tags, stored as plain Markdown files.
- Gentle friction-reducers: yesterday-recap on open, optional guided prompts, streaks handled kindly (no guilt mechanics).
- Attachments (images, PDFs) with local processing.

### 2. Remember — memory & RAG
- Everything the user writes is chunked and embedded locally into a private vector index (pgvector learnings carry over to sqlite-vec/LanceDB).
- Chat and reflection always ground in the user's own corpus: "What did I say about burnout in March?"
- A **Memories** layer for distilled long-term facts the user can inspect, edit, and delete — no hidden profile.

### 3. Reflect — the journal that talks back
- On-demand and periodic reflections: weekly/monthly reviews, pattern detection (recurring topics, mood trends the user chooses to track), "you mentioned X three times this month."
- Prompts grounded in real entries, not generic affirmations.
- Reflection is opt-in and always visible as derived content — never silently injected.

### 4. Think — thinking tools
- Structured thinking modes in the chat: decompose a decision, pros/cons from your own past notes, pre-mortems, Socratic questioning, "steelman the opposite."
- Thinking is visible: the model's reasoning scratchpad shown when the provider supports it, tool calls shown always.

## What Privait Is Not

- Not a chat app with a notebook bolted on. Writing is the primary surface; chat serves it.
- Not a cloud service. There is no Privait server that sees your data, ever.
- Not a generic AI workspace. The depth is in journaling/reflection, not in being another generic AI chatbot.

How the system works is described in [architecture.md](architecture.md); architecture direction, roadmap, and open questions live in [roadmap.md](roadmap.md).