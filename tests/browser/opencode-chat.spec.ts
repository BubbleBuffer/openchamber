import { expect, type Locator, type Page } from "@playwright/test"
import { test } from "./fixtures/openchamber"
import { FAKE_OPENAI_TOOL } from "./support/fake-openai-provider"

const requestContainsText = (request: { messages: unknown[] }, text: string): boolean => {
  return JSON.stringify(request.messages).includes(text)
}

async function prepareComposer(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "New session" }).first().click()
  const composer = page.locator('textarea[data-chat-input="true"]')
  await expect(composer).toBeVisible()

  // Multiple responsive shells may keep non-interactive controls mounted.
  // Read and operate the composer control the user can actually see.
  const modelTrigger = page.locator(".model-controls__model-trigger:visible").first()
  let stableSelectionPolls = 0
  await expect.poll(async () => {
    if (!(await modelTrigger.textContent())?.includes("Browser Test Model")) {
      stableSelectionPolls = 0
      await modelTrigger.click()
      const model = page.getByText("Browser Test Model", { exact: true }).last()
      if (await model.isVisible()) {
        await model.click()
      } else {
        await page.keyboard.press("Escape")
      }
    }
    const selected = (await modelTrigger.textContent())?.includes("Browser Test Model") === true
    stableSelectionPolls = selected ? stableSelectionPolls + 1 : 0
    return stableSelectionPolls
  }, {
    message: "Browser Test Model selection should survive late provider/bootstrap writes",
    timeout: 20_000,
    intervals: [250],
  }).toBeGreaterThanOrEqual(8)
  return composer
}

test("streams deterministic assistant output through real OpenCode", async ({ page, login, fakeOpenAIProvider }) => {
  await login()
  const composer = await prepareComposer(page)
  const requestCount = fakeOpenAIProvider.requests.length

  await composer.fill("Say the browser test phrase.")
  await page.getByRole("button", { name: "Send message" }).click()

  await expect.poll(() => fakeOpenAIProvider.requests
    .slice(requestCount)
    .some((request) => requestContainsText(request, "Say the browser test phrase."))).toBe(true)
  await expect(page.locator("body")).toContainText("BROWSER_TEST_TEXT")
  const promptRequest = fakeOpenAIProvider.requests
    .slice(requestCount)
    .find((request) => requestContainsText(request, "Say the browser test phrase."))
  expect(promptRequest?.model).toBe("test-model")
})

test("surfaces a deterministic tool-call lifecycle through real OpenCode", async ({ page, login, fakeOpenAIProvider }) => {
  await login()
  fakeOpenAIProvider.setScenario("tool")
  const composer = await prepareComposer(page)
  const requestCount = fakeOpenAIProvider.requests.length

  await composer.fill("Use the browser test tool.")
  await page.getByRole("button", { name: "Send message" }).click()

  await expect.poll(() => fakeOpenAIProvider.requests.slice(requestCount).some((request) => (
    request.tools?.some((entry) => JSON.stringify(entry).includes(FAKE_OPENAI_TOOL)) === true
  ))).toBe(true)
  await expect.poll(() => fakeOpenAIProvider.requests.slice(requestCount).some((request) => (
    request.messages.some((message) => {
      if (!message || typeof message !== "object") return false
      const record = message as { role?: unknown; content?: unknown }
      return record.role === "tool" && String(record.content).includes("BROWSER_TEST_TOOL_RESULT:BROWSER_TEST_ARGUMENT")
    })
  ))).toBe(true)
  const newRequests = fakeOpenAIProvider.requests.slice(requestCount)
  const toolRequest = newRequests.find((request) => (
    request.tools?.some((entry) => JSON.stringify(entry).includes(FAKE_OPENAI_TOOL)) === true
  ))
  expect(toolRequest?.tools).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: "function",
      function: expect.objectContaining({ name: FAKE_OPENAI_TOOL }),
    }),
  ]))
  const followUpRequest = newRequests.find((request) => request.messages.some((message) => {
    if (!message || typeof message !== "object") return false
    const record = message as { role?: unknown; content?: unknown }
    return record.role === "tool"
  }))
  expect(followUpRequest?.messages.some((message) => {
    if (!message || typeof message !== "object") return false
    const record = message as { role?: unknown; content?: unknown }
    return record.role === "tool" && String(record.content).includes("BROWSER_TEST_TOOL_RESULT:BROWSER_TEST_ARGUMENT")
  })).toBe(true)
  if (process.env.BROWSER_TEST_DIAGNOSTICS === "1") {
    const syncMessages = await page.evaluate(() => {
      const debug = (window as unknown as {
        __opencodeDebug?: { getAllMessages(truncate?: boolean): unknown[] }
      }).__opencodeDebug
      return debug?.getAllMessages(true) ?? []
    })
    console.log("[browser-tool-sync-diagnostics]", JSON.stringify(syncMessages))
  }
  const body = page.locator("body")
  await expect(body).toContainText("BROWSER_TEST_TOOL_COMPLETED")
  const toolRow = page.getByRole("button", { name: /browser.?test.?tool.*inspect output/i }).last()
  await expect(toolRow).toBeVisible()
  await toolRow.click()
  await expect(body).toContainText("BROWSER_TEST_TOOL_RESULT:BROWSER_TEST_ARGUMENT")
})
