---
id: 0014
title: Isolated data dir for serve_dev (env override)
---
## Goal
Browser/API verification through `serve_dev` shares the real app data dir, so test traffic (uploads, chat sends, `saveSettings`) writes real user data — it blanked the user's stored API key during 0001–0003 verification. Give `serve_dev` its own data dir via an env override so verification never touches production data.

## Acceptance criteria
- [x] `PRIVAIT_DATA_DIR` env var: when set, `serve_dev` opens that directory (db, jobs.db, files/, models/) instead of the app-data dir; unset keeps current behavior
- [x] Verification against a temp data dir needs no settings writes to the real DB (provider is configured per-dir)
- [x] Documented in the serve_dev header comment: verification recipe (`PRIVAIT_DATA_DIR=$(mktemp -d)`)

## Review
- `serve_dev` reads `PRIVAIT_DATA_DIR` before opening anything; verified live — isolated boot shows empty conversations/blank settings with its own db/jobs/files, and the real data dir is untouched.
- Incident that motivated this (0001–0003 verification): `saveSettings` against the real data dir blanked the user's stored API key; lesson recorded in `docs/lessons.md` — never `saveSettings` against the real dir; inspect settings read-only and never persist placeholders there.
- 110 tests green, clippy `-D warnings` clean, fmt clean (CI-equivalent commands run locally).
