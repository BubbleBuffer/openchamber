# Contract module index

Each TypeScript module in this directory owns runtime-neutral OpenChamber wire
contracts for the named domain. SDK proxy, find, and tool payloads are
pass-through and intentionally excluded.

## Maintained module index

- `common.ts` — shared parsing and safe error responses
- `event-stream.ts`
- `files.ts`
- `git.ts`
- `github.ts`
- `notifications.ts`
- `opencode.ts`
- `project-assets.ts`
- `quota.ts`
- `route-inventory.ts` — authoritative route ownership inventory
- `settings.ts`
- `skills.ts`
- `system.ts`
- `terminal.ts`
- `themes.ts`
- `ui-auth.ts`

Contract modules must not import server or browser runtime dependencies. Their
domain tests and `contract-matrix.test.ts` exercise parser compatibility.
