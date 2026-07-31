# Settings domain

Authoritative wire contract: [`../../contracts/settings.ts`](../../contracts/settings.ts).
This domain owns settings read/migration, normalization, response shaping,
persistence, and the serialized write/retry queue used by configuration routes.

Persisted input is parsed and unknown/invalid fields are discarded. Browser
settings responses and update requests contain only browser-owned fields.
Server-only persisted `publicOrigin` and `vapidKeys` must survive a read/merge/
write cycle but are explicitly excluded from browser output and browser input.
`vapidKeys` therefore never cross the browser contract boundary.

Writes are serialized in order. A write failure remains explicit to its caller,
while the queue recovers so a later independent save can proceed; it does not
silently retry the failed write. Route handlers must not bypass the queue or
implement a second persistence policy. Keep configuration normalization here,
not in callers.
