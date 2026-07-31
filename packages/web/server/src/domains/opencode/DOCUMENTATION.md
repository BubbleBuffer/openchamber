# OpenCode domain

This domain composes the managed/external OpenCode runtime, its configuration
helpers, and OpenChamber routes in `routes/`. It is a wrapper around OpenCode,
not the owner of OpenCode SDK payload schemas.

## Contract boundary

OpenChamber-owned routes use their matching authoritative modules in
[`../../contracts/`](../../contracts/): `opencode.ts` for this domain's
configuration operations, `settings.ts` for settings, `skills.ts` for skill
routes, `project-assets.ts` for icons, `system.ts` for system routes, and
`ui-auth.ts` where this registrar wires browser auth. Route input is parsed
before service calls and browser adapters parse OpenChamber-owned responses.
Do not recreate DTOs in a route.

The SDK/proxy boundary is intentionally different. Generic OpenCode proxy
responses, final proxy responses, find-file results, and tool IDs remain
opaque pass-through values. The wrapper may supply lifecycle, readiness,
authentication headers, SSE forwarding, and safe OpenChamber errors, but must
not claim ownership of or cast those SDK payloads into local contracts.

## Domain invariants and partial states

Configuration writes preserve the existing backup/reload behavior. Installed
skills are a read-only discovery/detail surface; the detail route reads only
the exact regular `SKILL.md` selected by server-side discovery, after canonical
path and size validation. Project-asset operations preserve their domain-coded partial results. Managed
and external runtime readiness/unavailability is explicit; callers must not
mistake an unavailable upstream for a valid SDK result. Proxy SSE forwards
include keepalive comments and retain upstream event data rather than
reformatting it as a local DTO.

Settings persistence is implemented with the settings domain. This domain must
preserve server-only persisted `publicOrigin` and `vapidKeys` while excluding
both from browser settings responses and update input. Its serialized write
queue recovers after a failure so a later save can proceed; it does not retry
the failed write invisibly. Do not replace that queue with route-local
persistence.
