# Lessons

- `pnpm test` in src/frontend runs `vitest` in watch mode — it never exits and hangs the shell. Verify frontend changes with `vite build` + eslint; if the vitest suite itself is needed, use `pnpm exec vitest run` (one-shot, exits cleanly).
- After any correction from the user, add the pattern here and apply it for the rest of the session.
- `vite build` does NOT typecheck — a missing generated-document import (`RenameConversationDocument`) built fine and crashed the homepage at render time. Verify frontend changes with `pnpm exec tsc -b` (now green, keep it that way) + vite build + eslint; the old M1 lesson only mentioned vite build + eslint.
- This repo's shadcn was installed with `cssVariables: false`, so token classes (`bg-muted`, `text-muted-foreground`, `border-border`) resolve to nothing until tailwind.config.js maps them and index.css defines the HSL variables. Check `components.json` + tailwind color map before assuming token classes work.
- Stray hardcoded body classes in `index.html` (`bg-white dark:bg-neutral-500`) overrode app theming — check the HTML shell, not just React components, when colors look wrong.
