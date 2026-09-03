---
id: 0011
title: Remove dead frontend code (shadcn chart templates + recharts)
---
## Goal
Delete `src/frontend/src/components/example-charts/` (area-1, bar-1, pie-1) and `src/frontend/src/components/ui/chart.tsx` — shadcn template files with no importers — and drop the `recharts` dependency they drag along. An AI-written repo accumulates dead template code silently; this is the first hygiene pass.

## Acceptance criteria
- [ ] Verified first that nothing outside `example-charts/` + `ui/chart.tsx` imports these files or `recharts`
- [ ] Files deleted; `recharts` removed from `src/frontend/package.json`
- [ ] `pnpm exec tsc -b`, `vite build`, `pnpm lint` all clean; app boots and renders chat

## Constraints
- Verification before deletion is the whole task — if a real importer turns up, stop and re-scope
- If charts return later for the Reflect pillar, re-add deliberately (0006-era), not as dormant template code