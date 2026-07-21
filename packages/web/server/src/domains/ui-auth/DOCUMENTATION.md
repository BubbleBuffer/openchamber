# UI authentication domain

Authoritative wire contract: [`../../contracts/ui-auth.ts`](../../contracts/ui-auth.ts).
`ui-auth.ts` owns password/session cookies, access guards, and rate limiting;
`ui-passkeys.ts` owns WebAuthn registration and authentication.

Session and passkey request data is parsed before use. Auth state, disabled
auth, lockout, and rate limiting are explicit results; rate limiting uses the
contracted `Retry-After` header with its coded error. Session cookies and
credential/passkey internals never become response DTOs. Passkey origin
validation uses the request origin plus configured public origin candidates.

HTTP CSRF-token enforcement is not currently implemented: it is deferred to
`pwa-auth-runtime`. Do not document it as a protection that exists today.
