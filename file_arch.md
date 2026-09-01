# Files in chat — architecture

Reworks the M3 files UX: uploads move from a standalone Files page into the
chat composer; files belong to conversations; grounding becomes per-chat.
Supersedes the M3 "Files page" slice of `tauri_mvp.md` (backend pipeline,
storage, and schema types carry over; the page goes away).

## Product decisions (confirmed)

1. **Grounding scope: per-chat.** A conversation is grounded only by files
   attached to it. Memories stay global. Files uploaded before this change
   (no chat) ground nothing.
2. **Upload timing: on send.** Files upload as part of the send action, not
   when picked. Nothing touches the server until the user hits send.
3. **Empty message + files: auto-instruct.** The bubble shows only file
   chips; the model receives a synthesized instruction.
4. **No per-file delete UX** for now (avoids breaking grounded chats). The
   Files page and its nav entry are removed; the GraphQL file surface
   (`files` query, `deleteFileUpload`) stays server-side, unused by UI.

## UX flow

**Composing**
- Paperclip button in the composer opens a multi-select file picker.
  (Drag-and-drop onto the composer can come later; same code path.)
- Selected files render as chips above the input (name, size, × to remove).
  Removal is client-only — nothing has uploaded yet.
- Send is enabled when there is message text **or** at least one file.

**On send**
1. Frontend uploads every chip in parallel (`uploadFile` mutations).
   - Validation failure (oversize, disallowed MIME) → toast + chip marked
     red; send aborts (no partial sends).
2. Once all files return ids, the frontend starts the chat subscription
   with `fileIds` and the (possibly empty) message text.
3. While uploading, the optimistic user bubble shows its chips with a
   spinner state; text appears as typed.

**After send**
- The subscription links the files to the conversation, grounds the turn,
  and streams the reply (unchanged streaming machinery).
- The user message persists with empty content when there was no text;
  the bubble renders chips for it forever after (association is stored).

## Architecture

### Data model (migration v3)

```sql
ALTER TABLE files ADD COLUMN conversation_id INTEGER NULL
    REFERENCES conversations(id) ON DELETE CASCADE;
CREATE INDEX idx_files_conversation ON files(conversation_id);
```

- `conversation_id IS NULL` until the send's subscription links them;
  NULL files never ground anything (decision 1) and are garbage-collected
  on app start (orphan insurance when a send aborts mid-upload).
- `ON DELETE CASCADE`: deleting a conversation removes its files rows and
  storage objects stay — storage GC can join a later cleanup pass (M4
  housekeeping), out of scope here.
- Previously uploaded rows keep NULL and simply stop grounding (local dev
  data; the roadmap's fresh-start principle applies).

### GraphQL surface (minimal deltas)

```
uploadFile(input: FileUploadInput!): MutationUploadFileResult!
  # unchanged shape; now returns the row already PROCESSED (see pipeline)

conversation(conversationId: Int, message: String!, fileIds: [Int!])
  # subscription gains optional fileIds; message stays String! — "" allowed
  # when files are attached (frontend forbids empty-with-no-files)

Message { id role content files: [FileUpload!]! }
  # new field so chat history re-renders attachment chips after reload

type FileUpload { … } files query / deleteFileUpload mutation
  # kept server-side per decision 4; nothing calls them
```

### Processing pipeline: inline instead of queued

With upload-on-send the user is already waiting on the send, so background
processing no longer buys anything — `uploadFile` runs the existing
pipeline **inline** (validate → store → extract → chunk → embed →
`file_chunks` → status PROCESSED) and returns the PROCESSED row.

- Bounds are already in place: 5MB cap, warm bge model, in-process
  extraction. A 5MB text file processes well under a second; the one-time
  model download (first ever upload) shows as a longer "processing" state
  on the chips, once.
- Failure surfaces directly in the send flow (error arm → toast); the
  apalis worker + `push_job` remain in the codebase for the Reflect
  phase's scheduled jobs but no longer sit in the upload path.
- Deviation from `tauri_mvp.md`'s "apalis for process-file" decision —
  deliberate: the queue fit the old fire-and-forget Files-page model; the
  chat-composer model is synchronous by construction.

### Linking files on send

In the subscription resolver, before retrieval:

```sql
UPDATE files SET conversation_id = ?1
WHERE id IN (…) AND conversation_id IS NULL;
```

`AND conversation_id IS NULL` makes relays idempotent and prevents
re-homing another chat's file if a client lies about ids. Unknown /
already-claimed ids are simply ignored (never fatal).

### Retrieval: per-chat scope

`related_file_chunks` gains a conversation filter via a join — vec0 KNN
over `file_chunks`, filtered by the aux `file_id` through `files`:

```sql
SELECT fc.content, fc.distance
FROM file_chunks fc JOIN files f ON f.id = fc.file_id
WHERE fc.embedding MATCH ?1 AND f.conversation_id = ?2
ORDER BY distance LIMIT 4;
-- app-side similarity ≥ 0.5 filter unchanged
```

Memories stay global (top-4, ≥ 0.5). If retrieval yields nothing, the turn
proceeds ungrounded exactly as today. Still-top-4 **total** (not per file),
matching the old behavior — with many attachments the most relevant chunks
win.

### Empty message synthesis

When `message.trim()` is empty and files are attached, the persisted USER
row stores `""` (bubble shows chips), and the provider request's user turn
is synthesized:

> Please read the attached file(s) and respond.

Title derivation for a file-only first message: use the first file's
original name (e.g. `rag-facts.md`), falling back to "Untitled chat" —
nicer than an untitled thread, cheap to do.

## Change list

**Rust (`src-tauri`)**
- `db.rs`: migration v3 (column + index).
- `files.rs`: `link_to_conversation(db, file_ids, conversation_id)`; store
  inline pipeline (extract/chunk/embed) — reuse `jobs.rs`
  `process_uploaded_file` internals, split extraction from queue concerns;
  orphan GC (`DELETE files WHERE conversation_id IS NULL` + storage delete)
  at startup.
- `retrieval.rs`: conversation-scoped `related_file_chunks`.
- `schema.rs`: `fileIds` arg + linking; auto-instruct synthesis; `Message.files`;
  title-from-filename; inline PROCESSED in `uploadFile`.
- `lib.rs`: startup orphan GC.

**Frontend (`src/frontend`)**
- Remove Files page + nav entry (`pages/files.tsx`, `files.test.tsx`,
  sidebar nav item); keep `file-drop.tsx` guts or replace with a plain
  hidden input — composer wants a button, not a dropzone banner.
- Composer: attach button, chips (name/size/×), send gating
  (text or ≥1 file), uploading state, error toast + red chip on failure.
- Send path: parallel `uploadFile`s → collect ids → subscription with
  `fileIds`.
- `Message.files` rendering on user bubbles (chips), incl. optimistic ones.
- Regenerate codegen documents/types.

## Test plan

**Rust**
- Migration v3 applies + idempotent.
- `uploadFile` returns PROCESSED with chunks present (inline pipeline).
- Linking: files get conversation_id; idempotent re-link; claimed-id ignored.
- Grounding: chat A's file does NOT ground chat B; same-chat grounding
  still injects top-4 with the ≥0.5 filter (capturing mock provider).
- Empty message: "" + files → synthesized user turn to provider, "" in DB,
  title from file name; "" without files → frontend-blocked, backend still
  tolerant (no synthesis, existing behavior).
- Orphan GC removes NULL-conversation files and their storage objects.
- `Message.files` resolver returns the conversation's files in order.

**Frontend**
- Composer gating: no send with empty text and no files.
- Chip add/remove before send; uploading/failed chip states.
- Send flow: uploads in parallel, subscription called with ids, optimistic
  chips render.
- Files page + nav gone; app boots to Chat.

**Manual (sample-files kit)**
- The `sample-files/README.md` script, run entirely from chat: attach
  `rag-facts.md` + `sample.pdf` to one thread, ask the three fact
  questions (md fact, pdf fact, buried `long-essay.txt` fact after
  attaching it), ask an unrelated question (no leakage), start a second
  thread → none of the facts ground there (per-chat scope).

## Open questions (non-blocking)

- Drag-and-drop onto the composer: defer (picker first) — trivial to add
  later since both paths produce the same chip list.
- A future "manage attachments" UI will want `files(conversationId)` +
  delete-for-conversation; the retained GraphQL surface anticipates this.