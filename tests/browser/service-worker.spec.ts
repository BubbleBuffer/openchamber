import { expect } from "@playwright/test"
import { test } from "./fixtures/openchamber"

test("keeps API traffic network-owned and quiet on failure", async ({ page, login }) => {
  const rejectedFetchEventErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error" && /FetchEvent|respondWith|service worker/i.test(message.text())) {
      rejectedFetchEventErrors.push(message.text())
    }
  })
  page.on("pageerror", (error) => {
    if (/FetchEvent|respondWith|service worker/i.test(error.message)) {
      rejectedFetchEventErrors.push(error.message)
    }
  })

  await login()
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return Boolean(registration?.active)
  })).toBe(true)
  await page.reload()

  const settingsResponse = await page.evaluate(async () => {
    const response = await fetch("/api/config/settings", { credentials: "include" })
    return { status: response.status, ok: response.ok }
  })
  expect(settingsResponse).toEqual({ status: 200, ok: true })

  const cacheNames = await page.evaluate(() => caches.keys())
  expect(cacheNames.filter((name) => name.startsWith("api-cache-"))).toEqual([])

  await page.context().setOffline(true)
  const failedApiRequest = await page.evaluate(async () => {
    try {
      await fetch(`/api/config/settings?service-worker-contract=${Date.now()}`, { cache: "no-store" })
      return "resolved"
    } catch {
      return "rejected"
    }
  })
  await page.context().setOffline(false)

  expect(failedApiRequest).toBe("rejected")
  expect(rejectedFetchEventErrors).toEqual([])
})
