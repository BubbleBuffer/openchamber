# GitHub Domain Port — Stage 9.4

## Problem
`src/domains/github/index.ts` is a circular stub (re-exports from routes.ts only). `pr-status.ts` is a `declare module` stub. Real logic in `lib/github/`. The domain is dead.

## Files (ordered by dep chain)

| # | File | Source | Lines |
|---|------|--------|-------|
| 1 | `src/domains/github/types.ts` | new | ~60 |
| 2 | `src/domains/github/auth.ts` | `lib/github/auth.js` | 308 |
| 3 | `src/domains/github/device-flow.ts` | `lib/github/device-flow.js` | 50 |
| 4 | `src/domains/github/octokit.ts` | `lib/github/octokit.js` | 10 |
| 5 | `src/domains/github/repo.ts` | `lib/github/repo/index.js` | 55 |
| 6 | `src/domains/github/pr-status.ts` | `lib/github/pr-status.js` (replace stub) | 497 |
| 7 | `src/domains/github/index.ts` | rewrite barrel | ~30 |
| 8 | `src/domains/github/routes.ts` | fix L275 require() → import | 1 line |

## Key deps changes
- `repo.ts`: `../../git/index.js` → `../git/service.js` (`getRemoteUrl`)
- `pr-status.ts`: `../git/index.js` → `../git/service.js` (`getRemotes`, `getStatus`)
- `routes.ts`: drop `require("./pr-status.js")`, add static import

## Cleanup
Delete `lib/github/auth.js`, `device-flow.js`, `octokit.js`, `pr-status.js`, `repo/index.js`, `index.js`. Keep `DOCUMENTATION.md`.

## Verify
```
npx tsc --noEmit -p packages/web/tsconfig.server.json
bun run build:web-server
cd packages/web && bun test server/src/domains/
```
