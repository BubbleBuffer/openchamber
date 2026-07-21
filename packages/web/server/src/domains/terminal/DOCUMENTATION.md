# Terminal domain

Authoritative wire contract: [`../../contracts/terminal.ts`](../../contracts/terminal.ts).
`routes.ts` owns terminal HTTP/SSE operations, `ws-server.ts` owns the upgrade,
and `sessions.ts` owns PTY session lifecycle.

Create, input, resize, restart, and kill values are parsed before use. The
capability response advertises the current preferred WebSocket transport and
its HTTP/SSE fallbacks; clients reconnect and rebind using that capability,
not a hard-coded socket assumption. WebSocket control frames negotiate/bind,
report exit, and carry safe terminal errors; output bytes are data frames.

WebSocket upgrades require UI authentication and an allowed Origin. Socket
send failure/backpressure is not durable terminal delivery. SSE and socket
cleanup dispose listeners, while deletion, restart, force-kill, and domain
shutdown kill PTY processes so abandoned transports do not retain processes.
