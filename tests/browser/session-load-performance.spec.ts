import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { expect } from "@playwright/test"
import { test } from "./fixtures/openchamber"
import {
  FAKE_OPENAI_MODEL,
  FAKE_OPENAI_PROVIDER,
} from "./support/fake-openai-provider"

const COLD_SESSION_VISIBLE_BUDGET_MS = 2_000
const WARM_SESSION_VISIBLE_BUDGET_MS = 250
const HOVER_PREFETCH_VISIBLE_BUDGET_MS = 250
const SESSION_READY_TIMEOUT_MS = 15_000

type SeededSession = {
  id: string
  marker: string
  title: string
}

const waitForSessionMessages = async (
  baseUrl: string,
  sessionId: string,
  marker: string,
): Promise<void> => {
  const client = createOpencodeClient({ baseUrl })
  const deadline = Date.now() + SESSION_READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const response = await client.session.messages({ sessionID: sessionId })
    const serialized = JSON.stringify(response.data ?? [])
    if (serialized.includes(marker) && serialized.includes("BROWSER_TEST_TEXT")) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Session ${sessionId} did not finish seeding within ${SESSION_READY_TIMEOUT_MS}ms`)
}

const seedSession = async (
  baseUrl: string,
  directory: string,
  title: string,
  marker: string,
): Promise<SeededSession> => {
  const client = createOpencodeClient({ baseUrl })
  const created = await client.session.create({ title, directory })
  const sessionId = created.data?.id
  if (!sessionId) throw new Error(`OpenCode did not create performance session "${title}"`)

  const response = await fetch(
    `${baseUrl}/session/${sessionId}/prompt_async?directory=${encodeURIComponent(directory)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: {
          providerID: FAKE_OPENAI_PROVIDER,
          modelID: FAKE_OPENAI_MODEL,
        },
        parts: [{ type: "text", text: marker }],
      }),
    },
  )
  expect(response.ok, `Seed prompt failed: ${response.status} ${await response.text()}`).toBe(true)
  await waitForSessionMessages(baseUrl, sessionId, marker)
  return { id: sessionId, marker, title }
}

const switchToSessionAndMeasure = async (
  page: import("@playwright/test").Page,
  session: SeededSession,
): Promise<number> => {
  const row = page.locator(`[data-session-row="${session.id}"]`).first()
  await expect(row).toBeVisible()

  return row.evaluate((element, marker) => new Promise<number>((resolve, reject) => {
    const deadline = window.setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Session text "${marker}" was not visible within 15 seconds`))
    }, 15_000)
    const startedAt = performance.now()

    const completeIfVisible = () => {
      if (!document.body.innerText.includes(marker)) return
      window.clearTimeout(deadline)
      observer.disconnect()
      resolve(performance.now() - startedAt)
    }
    const observer = new MutationObserver(completeIfVisible)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const button = element.querySelector<HTMLButtonElement>("button")
    if (!button) {
      window.clearTimeout(deadline)
      observer.disconnect()
      reject(new Error("Session row did not contain a selection button"))
      return
    }
    button.click()
    completeIfVisible()
  }), session.marker)
}

test("keeps cold and warm session-to-visible-text latency within budget", async ({
  page,
  login,
  isolatedOpenCode,
  fakeOpenAIProvider,
}) => {
  fakeOpenAIProvider.setScenario("text")

  // The latest session is selected by startup and only its immediate neighbors
  // are eligible for idle prefetch. Keeping the cold target four rows away makes
  // this a deterministic uncached navigation without disabling product behavior.
  const cold = await seedSession(
    isolatedOpenCode.baseUrl,
    isolatedOpenCode.cwd,
    "Perf 01 cold target",
    "COLD_SESSION_VISIBLE_MARKER",
  )
  const warmA = await seedSession(
    isolatedOpenCode.baseUrl,
    isolatedOpenCode.cwd,
    "Perf 02 warm A",
    "WARM_SESSION_A_VISIBLE_MARKER",
  )
  const hoverPrefetched = await seedSession(
    isolatedOpenCode.baseUrl,
    isolatedOpenCode.cwd,
    "Perf 03 hover-prefetched",
    "HOVER_PREFETCH_SESSION_VISIBLE_MARKER",
  )
  const warmB = await seedSession(
    isolatedOpenCode.baseUrl,
    isolatedOpenCode.cwd,
    "Perf 04 warm B",
    "WARM_SESSION_B_VISIBLE_MARKER",
  )
  await seedSession(
    isolatedOpenCode.baseUrl,
    isolatedOpenCode.cwd,
    "Perf 05 startup target",
    "STARTUP_SESSION_VISIBLE_MARKER",
  )

  await login()
  await expect(page.locator(`[data-session-row="${cold.id}"]`).first()).toBeVisible()

  const coldMs = await switchToSessionAndMeasure(page, cold)
  const coldResources = await page.evaluate((sessionId) => performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes(sessionId))
    .map((entry) => ({
      name: entry.name.replace(window.location.origin, ""),
      startTime: Number(entry.startTime.toFixed(1)),
      duration: Number(entry.duration.toFixed(1)),
    })), cold.id)
  expect(coldMs, `cold session visible in ${coldMs.toFixed(1)}ms`).toBeLessThan(COLD_SESSION_VISIBLE_BUDGET_MS)

  const hoverRow = page.locator(`[data-session-row="${hoverPrefetched.id}"]`).first()
  const hoverPrefetchResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/session/${hoverPrefetched.id}/message`)
    && response.ok()
  ))
  await hoverRow.hover()
  await hoverPrefetchResponse
  const hoverPrefetchedMs = await switchToSessionAndMeasure(page, hoverPrefetched)
  expect(
    hoverPrefetchedMs,
    `hover-prefetched session visible in ${hoverPrefetchedMs.toFixed(1)}ms`,
  ).toBeLessThan(HOVER_PREFETCH_VISIBLE_BUDGET_MS)

  // Prime both sessions once, then alternate. This measures the actual cached
  // React/store render path rather than relying on request counts as a proxy.
  await switchToSessionAndMeasure(page, warmA)
  await switchToSessionAndMeasure(page, warmB)
  const warmSamples: number[] = []
  for (const target of [warmA, warmB, warmA, warmB, warmA, warmB]) {
    warmSamples.push(await switchToSessionAndMeasure(page, target))
  }

  const sortedWarmSamples = [...warmSamples].sort((a, b) => a - b)
  const warmMedianMs = sortedWarmSamples[Math.floor(sortedWarmSamples.length / 2)] ?? Number.POSITIVE_INFINITY
  const warmMaxMs = sortedWarmSamples.at(-1) ?? Number.POSITIVE_INFINITY
  console.log("[session-load-performance]", JSON.stringify({
    coldMs: Number(coldMs.toFixed(1)),
    coldResources,
    hoverPrefetchedMs: Number(hoverPrefetchedMs.toFixed(1)),
    warmMedianMs: Number(warmMedianMs.toFixed(1)),
    warmMaxMs: Number(warmMaxMs.toFixed(1)),
    warmSamplesMs: warmSamples.map((sample) => Number(sample.toFixed(1))),
    budgetsMs: {
      cold: COLD_SESSION_VISIBLE_BUDGET_MS,
      warm: WARM_SESSION_VISIBLE_BUDGET_MS,
      hoverPrefetched: HOVER_PREFETCH_VISIBLE_BUDGET_MS,
    },
  }))

  expect(warmMaxMs, `warm samples: ${warmSamples.map((sample) => sample.toFixed(1)).join(", ")}ms`)
    .toBeLessThan(WARM_SESSION_VISIBLE_BUDGET_MS)
})
