import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createServer, type Server, type Socket } from "node:net"
import { waitForHttp } from "./opencode-process"

describe("waitForHttp", () => {
  let hangingServer: Server
  let port: number
  // Keep references to sockets so we can destroy them on teardown — otherwise
  // close() hangs waiting for accepted sockets to finish.
  const sockets = new Set<Socket>()

  beforeEach(async () => {
    hangingServer = createServer((socket) => {
      // Accept the TCP connection but never send an HTTP response.
      // This simulates the race where opencode has bound the port but the
      // HTTP server is not yet processing requests.
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
    })
    await new Promise<void>((resolve) => hangingServer.listen(0, "127.0.0.1", resolve))
    port = (hangingServer.address() as { port: number }).port
  })

  afterEach(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => hangingServer.close(() => resolve()))
  })

  it("rejects within a bounded time when the server accepts but never responds", async () => {
    // With the per-request timeout fix, each fetch aborts after 2s.
    // A 5s overall deadline means the function rejects well under the
    // OS TCP timeout (21s+) — observed ~8s in practice.
    // Without the fix, a single fetch hangs 21-127s (OS TCP timeout),
    // so this assertion fails against the unbounded code.
    const start = Date.now()
    await expect(
      waitForHttp(`http://127.0.0.1:${port}`, 5_000),
    ).rejects.toThrow()
    const elapsed = Date.now() - start
    // Should complete well under the OS TCP timeout (21s+).
    // Generous upper bound: 12s (5s deadline + 2s per-request timeout + slack).
    expect(elapsed).toBeLessThan(12_000)
  })
})
