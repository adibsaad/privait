# Lessons

- `pnpm test` in src/frontend runs `vitest` in watch mode — it never exits and hangs the shell. Verify frontend changes with `vite build` + eslint; if the vitest suite itself is needed, use `pnpm exec vitest run` (one-shot, exits cleanly).
- After any correction from the user, add the pattern here and apply it for the rest of the session.