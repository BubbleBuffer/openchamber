# Filesystem domain

Authoritative wire contract: [`../../contracts/files.ts`](../../contracts/files.ts).
Route ownership is `routes.ts` for `/api/fs/*`; `search.ts` supplies the
filesystem search runtime.

All route query/body values are parsed at the server boundary. Operations stay
within the resolved workspace/project or worktree boundary, and exec jobs are
runtime-owned with lifecycle pruning. Return the contracted safe errors and
job/partial state; do not expose filesystem exceptions or duplicate file DTOs
in route handlers.

The browser parses OpenChamber-owned file responses. Upstream/SDK file-search
data remains pass-through where applicable.
