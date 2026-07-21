# Quota domain

Authoritative wire contract: [`../../contracts/quota.ts`](../../contracts/quota.ts).
`routes.ts` owns provider-list and per-provider routes; `providers/` owns
provider-specific authentication and fetching.

Provider IDs are parsed at the route seam. Unsupported, unconfigured, and
provider-failure conditions are safe coded outcomes. A provider response may
be transport-valid while `configured` is false, usage is absent, or `ok` is
false; preserve that disconnected/degraded product state rather than treating
it as usable quota. Never return provider credentials or raw upstream errors.
