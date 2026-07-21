# OpenChamber network contracts

This directory is the authoritative, runtime-neutral definition of an
OpenChamber-owned network boundary. A contract module owns parsers, safe error
mapping, route-level request/response associations, and protocol constants for
its domain; route registrars own HTTP wiring and domain services own behavior.
`route-inventory.ts` is the authoritative registrar/endpoint ownership index.

## Maintained module index

- `common.ts` — shared JSON parsing and safe common errors
- `event-stream.ts` — normalized OpenChamber event-hub and WebSocket envelopes
- `files.ts` — workspace filesystem routes and exec-job results
- `git.ts` — Git routes, validation, and operation/error results
- `github.ts` — GitHub auth, PR, issue, and safe provider results
- `notifications.ts` — push and notification-stream routes
- `opencode.ts` — OpenChamber configuration routes around OpenCode
- `project-assets.ts` — project icon routes
- `quota.ts` — provider quota routes and degraded results
- `route-inventory.ts` — authoritative route ownership inventory
- `settings.ts` — browser settings and server-only persisted settings
- `skills.ts` — installed skills and catalog/install operations
- `system.ts` — health, system, update, and model metadata routes
- `terminal.ts` — terminal HTTP/SSE/WebSocket transport
- `themes.ts` — custom theme routes
- `ui-auth.ts` — browser session and passkey routes

## Boundary rules

Contract modules must not import browser, server, SDK, Node, Express, or DOM
runtime dependencies. They are intentionally usable from both seams.

- The **server** parses all untrusted HTTP input and persisted data before use.
- The **browser** parses OpenChamber-owned success, error, SSE, and WebSocket
  payloads before state updates.
- SDK/OpenCode payloads are opaque pass-through data, not OpenChamber DTOs:
  generic proxy routes, final proxy responses, find-file results, and tool IDs
  are deliberately excluded from these modules. Do not narrow, clone, or
  invent contracts for those payloads unless OpenChamber begins owning their
  wire behavior.

New OpenChamber wire behavior belongs in the matching module here, then is
validated at both the route and browser seams. Keep parser use and endpoint
association centralized rather than recreating shapes in a route or client.

## HTTP errors and partial results

The common safe error envelope is `{ error, code }`. `error` is a stable,
non-sensitive user-facing message and `code` is the stable machine-readable
identifier. Domain modules may own narrower code namespaces and envelope
parsers; callers must not expose raw service, provider, filesystem, or SDK
errors as contract errors.

Use the route's documented/domain error code and matching HTTP status rather
than inferring status from a message: malformed input is 400, missing auth is
401, forbidden access is 403, missing resources are 404, conflicts are 409,
rate limiting is 429, and unavailable/upstream failures are 5xx. Rate-limited
UI-auth responses use the `Retry-After` header. SSE endpoints set their
contract content type and may use stream-specific headers; they are not JSON
error envelopes once streaming has begun.

An operation can succeed at the transport boundary while reporting a product
state such as disconnected, unconfigured, conflict, unavailable item, skipped
item, or an in-progress bootstrap. Preserve those explicit states and
per-item outcomes instead of converting a partial result into an all-or-
nothing failure.

## System version and event-stream protocol

`MESSAGE_STREAM_PROTOCOL_VERSION` is the current exact compatibility marker
reported by `/api/system/info`. A browser accepts the known value and rejects
an unknown value; there is no implemented version negotiation, downgrade, or
cross-version fallback. Bump it only with coordinated server/browser protocol
support and tests.

`/api/global/event` and `/api/event` are HTTP SSE proxy paths: they forward raw
upstream OpenCode event data, add keepalive comments, and own no local DTO for
that event data. They do not provide replay, resume, backpressure, or durable
delivery guarantees.

The event-stream hub and WebSocket transport normalize an upstream event to an
OpenChamber envelope with an optional event ID and directory plus the opaque
payload. WebSocket endpoints are `/api/global/event/ws` (global scope) and
`/api/event/ws` (directory scope). Their frames are:

- control: `ready` (scope and optional last event ID), `error` (safe message
  and optional code), `data_stalled` (duration), and `data_resumed` (optional
  last event ID);
- data: `event` (opaque payload plus optional event ID, directory, and scope).

The global hub keeps a bounded replay buffer. A reconnect that presents a
known last event ID receives only later buffered events; an unknown or expired
ID has no replay guarantee. Hub readers send `Last-Event-ID` when one is
known, detect stalls, emit stalled/resumed status, and keep reconnecting until
the reader is stopped. WebSocket upgrades are limited to the documented
global/directory scopes, authenticate and check Origin, and remove disconnected
or unsendable clients. They do not provide a durable delivery or backpressure
guarantee; clients reconnect and resume from their last observed ID where hub
replay is available.

## Authentication, sessions, and Origin

UI authentication owns browser session cookies, password/passkey exchanges,
and coded auth/rate-limit responses. Protected notification and terminal
routes use that auth boundary. WebSocket upgrades additionally require an
allowed Origin; allowed candidates are the active local aliases and configured
`publicOrigin`. Passkey verification also derives its allowed origins there.

Current CSRF posture: HTTP CSRF-token enforcement is **deferred to
`pwa-auth-runtime`**. Do not claim a CSRF token check exists. This does not
change the separate session/auth and WebSocket Origin checks implemented now.

## Terminal transport

Terminal capability responses advertise a preferred transport and supported
fallbacks. The current runtime prefers WebSocket when available, retaining HTTP
input and SSE output fallbacks. WebSocket control frames negotiate/bind a
session, acknowledge binding, report process exit, and carry coded terminal
errors; terminal bytes are data frames. Clients reconnect/rebind after a
terminal socket loss and use the advertised capability rather than assuming a
transport. Backpressure or unsendable sockets are not a delivery guarantee;
routes and socket cleanup dispose listeners, and explicit deletion, restart,
force-kill, and runtime shutdown clean up PTY processes.

## Future shell integration

Keep shell-specific behavior behind a domain transport adapter. A future shell
may consume the terminal capability and frame contract, but must not make a
browser/server runtime dependency part of this directory, bypass route/auth
validation, or reinterpret SDK pass-through data as OpenChamber-owned DTOs.
