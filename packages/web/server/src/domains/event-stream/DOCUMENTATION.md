# Event-stream domain

Authoritative wire contract: [`../../contracts/event-stream.ts`](../../contracts/event-stream.ts);
the system protocol version is in [`../../contracts/system.ts`](../../contracts/system.ts).

This domain owns the global upstream hub, directory streams, SSE normalization,
and the global/directory WebSocket bridges. It retains a bounded global replay
buffer: a known requested last event ID replays only later retained events;
unknown or expired IDs have no replay guarantee. Upstream readers forward
`Last-Event-ID`, detect stalls, emit stalled/resumed control frames, and
reconnect until stopped. HTTP proxy keepalives are a separate proxy concern.

Only the documented global and directory WebSocket scopes are accepted. Upgrade
authentication and Origin validation occur before connection; closed or
unsendable clients are removed. Frames carry opaque OpenCode payloads, so this
domain validates only the OpenChamber envelope/control protocol and does not
reinterpret SDK events. Reconnection/resume is best effort, not durable
delivery or a backpressure guarantee.
