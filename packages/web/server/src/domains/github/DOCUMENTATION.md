# GitHub domain

Authoritative wire contract: [`../../contracts/github.ts`](../../contracts/github.ts).
`routes.ts` is the thin registrar for `/api/github/*`; `issue-routes.ts` owns
issue listing, detail, and comment reads, while auth, device flow, remote
resolution, and PR status logic remain in this domain.

Routes parse OpenChamber-owned requests and return only safe coded provider
errors. A disconnected account is a normal product state (`connected: false`),
not a synthetic success payload. Inaccessible/private repositories and missing
PRs are likewise represented by the contracted disconnected/empty result where
the resolver can safely continue; actionable provider failures use the domain
error code. Keep tokens, Octokit errors, and provider payload internals out of
responses. The browser validates the contracted results before shared state.
