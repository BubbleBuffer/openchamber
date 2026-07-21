# Git domain

Authoritative wire contract: [`../../contracts/git.ts`](../../contracts/git.ts).
`routes.ts` owns `/api/git/*`; `service.ts` owns Git execution, identities, and
worktree behavior.

Parse every directory, query, and mutation at the route boundary. Directory
normalization/canonicalization and worktree-root checks preserve the fidelity of
the requested Git context; do not substitute a cached or guessed directory.
The bounded bootstrap-status cache is only a time-limited product-state view,
not repository truth.

Non-repositories, conflicts, merge/rebase attention, degraded worktree state,
and failed bootstrap are explicit contracted states. Map operational failures
to the Git safe-error code, preserve structured conflict/partial outcomes, and
do not duplicate the contract declarations in routes or browser adapters.
