# Notifications domain

Authoritative wire contract: [`../../contracts/notifications.ts`](../../contracts/notifications.ts).
`routes.ts` owns push subscription/visibility endpoints and the notification
SSE stream; delivery, templates, and session-trigger behavior remain internal
domain concerns.

Protected push and stream routes require UI authentication and return the
coded UI-auth failure before doing work. Push subscription and visibility input
is parsed at the server seam. The SSE endpoint uses the contract content type,
emits its ready event, and is not a JSON response after streaming begins.

Push setup may persist a first valid public origin through settings, but never
exposes VAPID private material. Delivery failures are handled as product state
and must not leak subscription/provider internals to the browser.
