---
id: 0013
title: Migration hardening (atomic scripts + upgrade-path tests)
---
## Goal
Migrations are currently applied with `execute_batch` outside any transaction: a script that fails partway leaves partial DDL with `user_version` unadvanced, which bricks the next startup ("table already exists"). And new installs vs. existing DBs take different code paths — nothing verifies an old database actually upgrades. This makes every migration crash-atomic and pins the v3 → current upgrade path with a fixture test.

## Acceptance criteria
- [x] Each migration applies inside one transaction (DDL + `user_version` together); a mid-script failure rolls back all DDL and leaves `user_version` unchanged (unit test)
- [x] Upgrade test: a v3-shaped fixture (conversation + message + file + memory-free state) migrates to current; rows survive, the new tables/columns exist, and pre-existing messages are searchable via `messages_fts`
- [x] The FTS backfill ships as a new append-only migration (v6 `INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`) so already-v5 databases get their transcripts indexed — v5 created the FTS table empty, which is exactly the class of gap the upgrade test exists to catch

## Review
- `apply_migration` wraps each script in `BEGIN … PRAGMA user_version … COMMIT` with an explicit `ROLLBACK` on error (a failed `execute_batch` otherwise leaves the transaction open on the connection). The atomicity test kills a script mid-DDL and asserts table + version both rolled back and the connection stays usable.
- v6 backfill shipped append-only; verified live on the real dev database (v5 → v6 on boot, pre-v5 messages became searchable — checked via `MATCH 'pong'`, since non-MATCH FTS queries scan the content table and prove nothing; lesson recorded).
- Upgrade-path test builds a v3 fixture through the real `apply_migration` path, migrates to current, asserts new tables/columns exist and old rows (chat, message, message-linked file) survive with the transcript searchable.
- 110 tests green, clippy clean.

## Constraints
- No down-migrations; scripts stay plain SQL
- Append-only: v5 stays untouched even though it's what introduced the gap (only released-in-session; v6 fixes every v5 DB, including the dev one)
