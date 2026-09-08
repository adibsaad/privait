# Privait — Glossary

The shared vocabulary for this repo. Code, docs, task files, and reviews use
these words with exactly these meanings — use the term or propose adding it
here (see [agents-guide.md](agents-guide.md), "Naming"). The boundaries
("_not_ …") matter as much as the definitions; that is where the design
lives.

## The workspace

**Vault** — the user's folder of plain Markdown files: journal entries and
notes, readable without Privait forever. _Not_ the `files/` attachment
folder and _not_ the database — the vault outlives the app.

**Entry** — one dated piece of journaling, stored as one Markdown file in
the vault. Feeds the same memory as everything else. _(Planned — Capture
pillar.)_

**Project** — a named container for a body of work: its own instructions,
knowledge files, and chats. _Not_ a disk folder and _not_ an access
boundary — global memory still reaches into projects by design.

**Instructions** — per-project standing guidance injected into that
project's chat prompts.

**Knowledge file** — a file added to a project so it can ground that
project's chats. _Not_ a chat attachment: attachments scope to one
conversation, knowledge files scope to the whole project.

**Artifact** — a durable, versioned output the assistant produces (draft,
chart, code), living beside the chat. _Not_ a message lost in scrollback.
_(Planned — Do pillar.)_

**Memory** — one durable fact the assistant keeps across chats, stored as
an inspectable row (content, source, provenance). _Not_ RAM, _not_ the
transcript, _not_ a hidden profile — every memory is visible, editable,
deletable in Settings.

## The engine

**Grounding** — injecting context relevant to the current message into the
prompt: top-4 file passages plus top-4 memories. _Not_ generic "context
injection": matches must clear the threshold, or the turn proceeds
ungrounded — silence over noise.

**Retrieval** — the nearest-neighbor search behind grounding: embed the
query locally, compare cosine similarity, keep the best matches.

**Embedding** — the local model (bge-small) turning text into a
384-number vector. Never touches the network.

**Passage (chunk)** — an overlapping slice of a file's text (512 tokens,
64 overlap) that is embedded and matched individually. _Not_ the whole
file.

**Threshold** — the minimum cosine similarity for a match to be used
(default 0.5). For memories it is a per-turn settings value
(`retrieval.threshold`); for file passages it is pinned.

**Distillation** — the post-chat job that proposes at most two memories
from the last user/assistant exchange through the provider and writes them
as `distilled`. _Not_ transcript summarization — only durable facts are
kept.

**Provenance** — the chat a distilled memory came from, stored on the row.
Manual memories have none.

**Incognito** — per-chat mode that reads no memories, writes none, and
excludes the chat from transcript search.

**Transcript** — the raw messages of a chat, full-text searchable in place
(`messages_fts`). _Never_ copied into the memory layer.

**Search history** — the on-demand deep lookup: full-text search over
transcripts, project-scoped by default. _Not_ memory retrieval — it finds
what you actually said, not what the memory layer distilled.

**Tool step** — a typed chat-history row rendering a background action
inline (e.g. "Updating user memories…" → "Updated 2 memories").
