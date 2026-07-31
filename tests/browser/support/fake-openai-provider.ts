import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"

export const FAKE_OPENAI_API_KEY = "browser-test-key"
export const FAKE_OPENAI_MODEL = "test-model"
export const FAKE_OPENAI_PROVIDER = "browser-test"
export const FAKE_OPENAI_TOOL = "browser_test_tool"

export type FakeOpenAIScenario =
  | "text"
  | "tool"
  | "delay"
  | "error-429"
  | "error-500"
  | "malformed-sse"
  | "abrupt-disconnect"

export type FakeOpenAIRequest = {
  model: string
  messages: unknown[]
  tools?: unknown[]
}

type FakeOpenAIProviderOptions = {
  scenario?: FakeOpenAIScenario
  delayMs?: number
}

type FakeOpenAIProvider = {
  baseUrl: string
  port: number
  requests: FakeOpenAIRequest[]
  setScenario(scenario: FakeOpenAIScenario): void
  close(): Promise<void>
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" }
const SSE_HEADERS = {
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8",
}

export async function startFakeOpenAIProvider(options: FakeOpenAIProviderOptions = {}): Promise<FakeOpenAIProvider> {
  let scenario = options.scenario ?? "text"
  const delayMs = options.delayMs ?? 100
  const requests: FakeOpenAIRequest[] = []

  const server = createServer((request, response) => {
    void handleRequest(request, response, {
      get scenario() { return scenario },
      requests,
      delayMs,
    })
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", resolve)
      reject(error)
    }
    server.once("error", onError)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    await closeServer(server)
    throw new Error("Fake OpenAI provider did not expose a TCP port")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests,
    setScenario(nextScenario) {
      scenario = nextScenario
    },
    close: () => closeServer(server),
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: { readonly scenario: FakeOpenAIScenario; readonly requests: FakeOpenAIRequest[]; readonly delayMs: number },
): Promise<void> {
  if (!isAuthorized(request)) {
    writeJson(response, 401, { error: { message: "Unauthorized", type: "invalid_api_key" } })
    return
  }

  if (request.method === "GET" && request.url === "/v1/models") {
    writeJson(response, 200, {
      object: "list",
      data: [{ id: FAKE_OPENAI_MODEL, object: "model", owned_by: "browser-test" }],
    })
    return
  }

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    writeJson(response, 404, { error: { message: "Not found" } })
    return
  }

  let body: unknown
  try {
    body = JSON.parse(await readBody(request))
  } catch {
    writeJson(response, 400, { error: { message: "Invalid JSON" } })
    return
  }

  const payload = asRequest(body)
  if (!payload || payload.model !== FAKE_OPENAI_MODEL) {
    writeJson(response, 400, { error: { message: `Expected model ${FAKE_OPENAI_MODEL}` } })
    return
  }
  const hasToolResult = payload.messages.some((message) => isMessageWithRole(message, "tool"))
  if (state.scenario === "tool" && !declaresTool(payload.tools, FAKE_OPENAI_TOOL)) {
    writeJson(response, 400, { error: { message: `Expected declaration for ${FAKE_OPENAI_TOOL}` } })
    return
  }
  state.requests.push(payload)

  if (state.scenario === "error-429") {
    writeJson(response, 429, { error: { message: "rate limit", type: "rate_limit_error" } })
    return
  }
  if (state.scenario === "error-500") {
    writeJson(response, 500, { error: { message: "upstream failure", type: "server_error" } })
    return
  }

  response.writeHead(200, SSE_HEADERS)
  if (state.scenario === "malformed-sse") {
    response.write("data: not-json\n\n")
    response.write("data: [DONE]\n\n")
    response.end()
    return
  }
  if (state.scenario === "abrupt-disconnect") {
    response.write("data: {\"id\":\"browser-test\",\"choices\":[{\"delta\":{\"content\":\"PARTIAL\"},\"finish_reason\":null}]}\n\n")
    response.destroy()
    return
  }

  const frames = state.scenario === "tool"
    ? (hasToolResult ? toolCompletionFrames() : toolFrames())
    : textFrames()
  for (const frame of frames) {
    if (state.scenario === "delay") await wait(state.delayMs)
    response.write(`data: ${JSON.stringify(frame)}\n\n`)
  }
  response.write("data: [DONE]\n\n")
  response.end()
}

function textFrames(content = "BROWSER_TEST_TEXT"): Record<string, unknown>[] {
  return [
    chunk({ role: "assistant" }),
    chunk({ content }),
    chunk({}, "stop"),
  ]
}

function toolFrames(): Record<string, unknown>[] {
  return [
    chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_browser_test_tool", type: "function", function: { name: FAKE_OPENAI_TOOL, arguments: "" } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '{"value":"BROWSER_TEST_ARGUMENT"}' } }] }),
    chunk({}, "tool_calls"),
  ]
}

function toolCompletionFrames(): Record<string, unknown>[] {
  return textFrames("BROWSER_TEST_TOOL_COMPLETED")
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): Record<string, unknown> {
  return {
    id: "chatcmpl-browser-test",
    object: "chat.completion.chunk",
    created: 1,
    model: FAKE_OPENAI_MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

function asRequest(value: unknown): FakeOpenAIRequest | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.model !== "string" || !Array.isArray(record.messages)) return null
  return {
    model: record.model,
    messages: record.messages,
    tools: Array.isArray(record.tools) ? record.tools : undefined,
  }
}

function declaresTool(tools: unknown[] | undefined, expectedName: string): boolean {
  return tools?.some((entry) => {
    if (!entry || typeof entry !== "object") return false
    if ((entry as { type?: unknown }).type !== "function") return false
    const functionDefinition = (entry as { function?: unknown }).function
    return Boolean(
      functionDefinition &&
      typeof functionDefinition === "object" &&
      (functionDefinition as { name?: unknown }).name === expectedName,
    )
  }) ?? false
}

function isMessageWithRole(message: unknown, role: string): boolean {
  return Boolean(message && typeof message === "object" && (message as { role?: unknown }).role === role)
}

function isAuthorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${FAKE_OPENAI_API_KEY}`
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, JSON_HEADERS)
  response.end(JSON.stringify(body))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}
