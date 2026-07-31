import { expect } from "@playwright/test"
import { test } from "./fixtures/openchamber"

const isProtectedApi = (url: string, appOrigin: string): boolean => {
  const parsed = new URL(url)
  return parsed.origin === appOrigin && (parsed.pathname === "/api" || parsed.pathname.startsWith("/api/"))
}

test("does not call protected APIs before authentication succeeds", async ({ page, login, openchamber }) => {
  let sequence = 0
  let authSuccessSequence: number | undefined
  const protectedApiRequests: Array<{ sequence: number; method: string; url: string }> = []
  const preAuthConsoleErrors: Array<{ sequence: number; text: string }> = []

  page.on("request", (request) => {
    const currentSequence = ++sequence
    if (isProtectedApi(request.url(), openchamber.baseUrl)) {
      protectedApiRequests.push({ sequence: currentSequence, method: request.method(), url: request.url() })
    }
  })
  // Hold the successful login response until the test has recorded the
  // server-side authentication boundary. A passive Playwright "response"
  // listener can run after React has already resumed the fetch promise and
  // mounted the authenticated graph, making valid post-auth requests appear
  // to precede the response event.
  await page.route("**/auth/session", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback()
      return
    }

    const response = await route.fetch()
    if (response.ok()) authSuccessSequence = ++sequence
    await route.fulfill({ response })
  })
  page.on("console", (message) => {
    const locationUrl = message.location().url
    const isAppConsoleError = !locationUrl || new URL(locationUrl).origin === openchamber.baseUrl
    const isExpectedLockedStatus = Boolean(
      locationUrl
      && new URL(locationUrl).pathname === "/auth/session"
      && message.text().includes("401"),
    )
    if (message.type() === "error" && isAppConsoleError && !isExpectedLockedStatus) {
      preAuthConsoleErrors.push({ sequence: ++sequence, text: message.text() })
    }
  })

  await login()

  expect(authSuccessSequence).toBeDefined()
  await expect.poll(() => protectedApiRequests.length, {
    message: "authenticated application did not issue its expected API bootstrap requests",
  }).toBeGreaterThan(0)
  expect(
    protectedApiRequests.filter(({ sequence: requestSequence }) => requestSequence < (authSuccessSequence ?? Infinity)),
    `protected requests before auth: ${JSON.stringify(protectedApiRequests)}`,
  ).toEqual([])
  expect(
    preAuthConsoleErrors.filter(({ sequence: errorSequence }) => errorSequence < (authSuccessSequence ?? Infinity)),
    "unexpected pre-auth console errors",
  ).toEqual([])
})
