import { expect } from "@playwright/test"
import { test } from "./fixtures/openchamber"
import fs from "node:fs/promises"

test("loads the built app and authenticates a browser session", async ({ page, isolatedOpenCode, openchamber, login, logout }) => {
  await page.goto(openchamber.baseUrl)
  await expect(page).toHaveTitle(/OpenChamber/i)
  await expect.poll(async () => fs.readFile(isolatedOpenCode.pidPath, "utf8")).toBe(String(isolatedOpenCode.pid))
  await expect.poll(async () => fs.readFile(openchamber.pidPath, "utf8")).toBe(String(openchamber.pid))
  await login()
  expect(openchamber.logs.dump()).toContain("OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION")
  await expect(page.locator("body")).not.toContainText("Enter password")
  await logout()
})
