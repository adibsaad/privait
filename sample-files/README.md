# Sample files for recurring manual testing

| File | Type | What it exercises | Expected result when uploaded |
|---|---|---|---|
| `rag-facts.md` | text/markdown | Chat grounding — six absurd, memorable facts (each chunk worth asking about) | PROCESSED (9 chunks) |
| `long-essay.txt` | text/plain | Multi-chunk pipeline (512/64 overlap), fact buried mid-document ("the seventeenth of Brumaire") | PROCESSED (9 chunks) |
| `tiny.txt` | text/plain | Single-chunk edge case | PROCESSED (1 chunk) |
| `data.csv` | text/csv | CSV branch of the MIME allowlist | PROCESSED (4 chunks) |
| `notes.html` | text/html | HTML branch of the MIME allowlist | PROCESSED (1 chunk) |
| `sample.pdf` | PDF | pdf-extract branch ("the violet keymaster of Guilden Row") | PROCESSED (6 chunks) |
| `reject.zip` | application/zip | MIME allowlist rejection | Error: "Only PDF and text files are allowed" |
| `oversize.txt` | text/plain | 5MB size cap rejection | Error: "File size exceeds 5MB limit" |

## Chat grounding test script

1. Upload `rag-facts.md` and `sample.pdf`, wait for PROCESSED.
2. Ask the chat: *"What did the town of Bumblefleet paint purple, and why?"*
   → should mention purple mailboxes / the lost jazz trio (from the .md).
3. Ask: *"Who keeps a brass compass, and where?"*
   → should mention the violet keymaster of Guilden Row / post office drawer (from the .pdf).
4. Ask: *"What does the keeper of the Marble Archive stamp on borrowed books?"*
   → the seventeenth of Brumaire (buried mid-way through `long-essay.txt`).
5. Ask something unrelated (*"how do I bake sourdough?"*) → no fact leakage.
6. Remove the files (delete UI is deferred; clear the app data dir to reset) → repeat step 2 → the model should no longer know.

## Quick retrieval check without the chat (no provider tokens)

```bash
cd src-tauri
cargo run --example rag_smoke "who painted the mailboxes purple and why"
```

Chunk counts above were measured on this machine; they depend only on the
deterministic chunker, so they should be stable across runs.