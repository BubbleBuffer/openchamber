import { afterEach, describe, expect, it } from "vitest"
import { FAKE_OPENAI_TOOL, startFakeOpenAIProvider, type FakeOpenAIScenario } from "./fake-openai-provider"

describe("fake OpenAI provider", () => {
  let provider: Awaited<ReturnType<typeof startFakeOpenAIProvider>> | undefined

  afterEach(async () => {
    await provider?.close()
    provider = undefined
  })

  it("serves authenticated model metadata and deterministic text SSE", async () => {
    provider = await startFakeOpenAIProvider()

    const models = await fetch(`${provider.baseUrl}/v1/models`, {
      headers: { Authorization: "Bearer browser-test-key" },
    })
    expect(models.status).toBe(200)
    expect(await models.json()).toMatchObject({ data: [{ id: "test-model" }] })

    const response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hello" }] }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    const body = await response.text()
    expect(body).toContain('"content":"BROWSER_TEST_TEXT"')
    expect(body).toContain("data: [DONE]")
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]?.model).toBe("test-model")
  })

  it.each([
    ["tool", '"name":"browser_test_tool"', '"finish_reason":"tool_calls"'],
    ["error-429", "rate limit", "rate_limit_error"],
    ["error-500", "upstream failure", "server_error"],
    ["malformed-sse", "not-json", "data: [DONE]"],
  ] as const)("supports the %s scenario", async (scenario, expectedFirst, expectedSecond) => {
    provider = await startFakeOpenAIProvider()
    provider.setScenario(scenario as FakeOpenAIScenario)

    const response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "test-model",
        messages: [],
        ...(scenario === "tool" ? {
          tools: [{ type: "function", function: { name: FAKE_OPENAI_TOOL, parameters: {} } }],
        } : {}),
      }),
    })

    const body = await response.text()
    if (scenario === "error-429") expect(response.status).toBe(429)
    else if (scenario === "error-500") expect(response.status).toBe(500)
    else expect(response.status).toBe(200)
    expect(body).toContain(expectedFirst)
    expect(body).toContain(expectedSecond)
  })

  it("rejects a tool scenario when the model request omits the declared tool", async () => {
    provider = await startFakeOpenAIProvider({ scenario: "tool" })
    const response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "test-model", messages: [] }),
    })
    expect(response.status).toBe(400)
    expect(await response.text()).toContain(FAKE_OPENAI_TOOL)
    expect(provider.requests).toHaveLength(0)
  })

  it("rejects unauthorized or wrong-model requests and closes cleanly", async () => {
    provider = await startFakeOpenAIProvider()

    const unauthorized = await fetch(`${provider.baseUrl}/v1/models`)
    expect(unauthorized.status).toBe(401)

    const unauthorizedChat = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test-model", messages: [] }),
    })
    expect(unauthorizedChat.status).toBe(401)

    const wrongModel = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "not-test-model", messages: [] }),
    })
    expect(wrongModel.status).toBe(400)

    const baseUrl = provider.baseUrl
    await provider.close()
    provider = undefined
    await expect(fetch(`${baseUrl}/v1/models`)).rejects.toThrow()
  })

  it("supports delayed chunks and an abrupt streamed disconnect", async () => {
    provider = await startFakeOpenAIProvider({ scenario: "delay", delayMs: 1 })
    const delayed = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "test-model", messages: [] }),
    })
    expect(await delayed.text()).toContain("data: [DONE]")

    provider.setScenario("abrupt-disconnect")
    const abruptBody = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer browser-test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "test-model", messages: [] }),
    }).then((response) => response.text()).catch((error: unknown) => String(error))
    expect(abruptBody).toMatch(/PARTIAL|TypeError|network|socket|closed unexpectedly/i)
  })
})
