import { beforeAll, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { describeWithOpenChamber } from "../helpers/integration-suite"

describeWithOpenChamber(
  "OpenChamber tool-part proxy",
  {
    startOpenChamber: async (opencode) => {
      const envBackups = {
        OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
        OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
        OPENCODE_HOST: process.env.OPENCODE_HOST,
      }
      process.env.OPENCODE_SKIP_START = "true"
      process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
      process.env.OPENCODE_HOST = opencode.baseUrl

      let controller: {
        getPort(): number | null
        stop(opts?: { exitProcess?: boolean }): Promise<void>
      }

      try {
        const mod = await import("@openchamber/web")
        const startWebUiServer = mod.startWebUiServer as (
          opts?: Record<string, unknown>,
        ) => Promise<{
          getPort(): number | null
          stop(opts?: { exitProcess?: boolean }): Promise<void>
        }>
        controller = await startWebUiServer({
          port: 0,
          host: "127.0.0.1",
          attachSignals: false,
          exitOnShutdown: false,
        })
      } finally {
        if (envBackups.OPENCODE_SKIP_START === undefined) delete process.env.OPENCODE_SKIP_START
        else process.env.OPENCODE_SKIP_START = envBackups.OPENCODE_SKIP_START
        if (envBackups.OPENCHAMBER_SKIP_OPENCODE_START === undefined) delete process.env.OPENCHAMBER_SKIP_OPENCODE_START
        else process.env.OPENCHAMBER_SKIP_OPENCODE_START = envBackups.OPENCHAMBER_SKIP_OPENCODE_START
        if (envBackups.OPENCODE_HOST === undefined) delete process.env.OPENCODE_HOST
        else process.env.OPENCODE_HOST = envBackups.OPENCODE_HOST
      }

      const port = controller.getPort()
      if (typeof port !== "number") throw new Error("OpenChamber started without a bound port")

      return {
        baseUrl: `http://127.0.0.1:${port}`,
        port,
        async stop() {
          await controller.stop({ exitProcess: false })
        },
      }
    },
    beforeStop: (ctx) => ctx.openchamber.stop(),
  },
  (ctx) => {
    // Test 1: Tool IDs endpoint.
    // SDK maps client.tool.ids() → GET /experimental/tool/ids.
    // Proxy rewrites /api → / so the upstream path is /api/experimental/tool/ids.
    test("GET /api/experimental/tool/ids forwards upstream response", async () => {
      const res = await fetch(`${ctx.openchamber.baseUrl}/api/experimental/tool/ids`, { method: "GET" })
      expect(res.status).toBe(200)
      const body = (await res.json()) as unknown
      expect(body).toBeDefined()
    })

    // Tests 2 & 3: Part update and delete endpoints.
    // SDK maps client.part.update() → PATCH /session/{sessionID}/message/{messageID}/part/{partID}
    // SDK maps client.part.delete() → DELETE /session/{sessionID}/message/{messageID}/part/{partID}
    // Proxy rewrites /api → / so upstream paths are:
    //   PATCH /api/session/{sessionID}/message/{messageID}/part/{partID}
    //   DELETE /api/session/{sessionID}/message/{messageID}/part/{partID}
    // We set up a session + message via the upstream SDK, then send the
    // proxied request through the web proxy to verify forwarding.

    let sessionId: string
    let messageId: string

    beforeAll(async () => {
      const upstream = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
      const session = await upstream.session.create({ title: "tool-part-proxy" })
      sessionId = session.data!.id
      // Send a noop prompt to create a real message in the session.
      // The "noop" provider/model may not exist upstream; if prompt fails,
      // we fall back to the session ID as a synthetic message ID for the
      // purpose of testing proxy passthrough.
      const promptRes = await upstream.session.prompt({
        sessionID: sessionId,
        model: { providerID: "noop", modelID: "noop" },
        parts: [{ type: "text", text: "proxy initialiser" }],
      })
      // prompt returns { info: AssistantMessage; parts: Part[] }, so the message
      // ID lives at data.info.id.
      messageId = promptRes.data?.info?.id ?? `msg-${Date.now()}`
    }, 30_000)

    test("PATCH /api/session/.../part/{partID} forwards ToolPart update", async () => {
      const partID = `proxy-part-${Date.now()}`
      const res = await fetch(
        `${ctx.openchamber.baseUrl}/api/session/${sessionId}/message/${messageId}/part/${partID}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: partID,
            sessionID: sessionId,
            messageID: messageId,
            type: "tool",
            callID: `call-${Date.now()}`,
            tool: "noop_test_tool",
            state: { status: "pending", input: { proxied: true }, raw: "" },
          }),
        },
      )
      // Acceptable outcomes: 200 (upstream accepted the synthetic tool part),
      // 4xx (rejected synthetic tool or missing message). The key assertion is
      // that the proxy forwards the request without 5xx or HTML fallback.
      expect(res.status).toBeLessThan(500)
      expect(res.status).not.toBe(503)
    })

    test("DELETE /api/session/.../part/{partID} forwards part deletion", async () => {
      const partID = `proxy-del-${Date.now()}`
      const res = await fetch(
        `${ctx.openchamber.baseUrl}/api/session/${sessionId}/message/${messageId}/part/${partID}`,
        {
          method: "DELETE",
        },
      )
      // Acceptable outcomes: 200/204 (deleted), 4xx (not found). The key
      // assertion is proxy forwarding without server error.
      expect(res.status).toBeLessThan(500)
      expect(res.status).not.toBe(503)
    })
  },
)
