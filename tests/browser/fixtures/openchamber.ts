import { test as base, expect } from "@playwright/test"
import { startOpenCodeInstance, type StartedOpenCode } from "../../helpers/opencode-process"
import { removeTempDir } from "../../helpers/cleanup"
import { startOpenChamberProcess, type StartedOpenChamber } from "../support/server-process"
import { startFakeOpenAIProvider, FAKE_OPENAI_API_KEY, FAKE_OPENAI_MODEL, FAKE_OPENAI_PROVIDER, FAKE_OPENAI_TOOL, type FakeOpenAIScenario, type FakeOpenAIRequest } from "../support/fake-openai-provider"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const UI_PASSWORD = "browser-test-password"
const execFileAsync = promisify(execFile)
const TOOL_READY_TIMEOUT_MS = 15_000
const BROWSER_TEST_TOOL_SOURCE = `import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Returns a deterministic result for the browser lifecycle test.",
  args: {
    value: tool.schema.string(),
  },
  async execute(args) {
    return "BROWSER_TEST_TOOL_RESULT:" + args.value
  },
})
`

const waitForBrowserTestTool = async (baseUrl: string, workspace: string): Promise<void> => {
  const deadline = Date.now() + TOOL_READY_TIMEOUT_MS
  const params = new URLSearchParams({
    directory: workspace,
    provider: FAKE_OPENAI_PROVIDER,
    model: FAKE_OPENAI_MODEL,
  })
  const url = `${baseUrl}/experimental/tool?${params}`
  let lastResult = "no response"

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      const body = await response.json().catch(() => null)
      lastResult = `${response.status} ${JSON.stringify(body)}`
      if (
        response.ok
        && Array.isArray(body)
        && body.some((tool) => tool && typeof tool === "object" && tool.id === FAKE_OPENAI_TOOL)
      ) return
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`OpenCode did not register ${FAKE_OPENAI_TOOL}: ${lastResult}`)
}

type BrowserFixtures = {
  login: () => Promise<void>
  logout: () => Promise<void>
}

type BrowserWorkerFixtures = {
  fakeOpenAIProvider: {
    baseUrl: string
    port: number
    requests: FakeOpenAIRequest[]
    setScenario(scenario: FakeOpenAIScenario): void
  }
  isolatedOpenCode: StartedOpenCode
  openchamber: StartedOpenChamber
}

/* Playwright fixture callbacks are not React hooks, despite using the `use` name. */
/* eslint-disable react-hooks/rules-of-hooks */
export const test = base.extend<BrowserFixtures, BrowserWorkerFixtures>({
  // Playwright requires the first callback argument to be destructured even
  // when this worker fixture has no fixture dependencies.
  // eslint-disable-next-line no-empty-pattern
  fakeOpenAIProvider: [async ({}, use) => {
    const provider = await startFakeOpenAIProvider()
    try {
      await use(provider)
    } finally {
      await provider.close()
    }
  }, { scope: "worker" }],
  isolatedOpenCode: [async ({ fakeOpenAIProvider }, use, workerInfo) => {
    const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), `openchamber-opencode-browser-${workerInfo.workerIndex}-`))
    const workspace = path.join(stateRoot, "workspace")
    let instance: StartedOpenCode | undefined
    try {
      const toolPath = path.join(workspace, ".opencode", "tools", `${FAKE_OPENAI_TOOL}.ts`)
      await fs.mkdir(path.dirname(toolPath), { recursive: true })
      await fs.writeFile(toolPath, BROWSER_TEST_TOOL_SOURCE, "utf8")
      // OpenCode resolves project-local tools relative to the project root.
      // A real (even empty) repository keeps that root at the isolated
      // workspace instead of falling back to the filesystem root.
      await execFileAsync("git", ["init", "--quiet", workspace])
      instance = await startOpenCodeInstance({
        stateRoot,
        cwd: workspace,
        config: {
          model: `${FAKE_OPENAI_PROVIDER}/${FAKE_OPENAI_MODEL}`,
          provider: {
            [FAKE_OPENAI_PROVIDER]: {
              api: "openai",
              options: {
                baseURL: `${fakeOpenAIProvider.baseUrl}/v1`,
                apiKey: FAKE_OPENAI_API_KEY,
              },
              models: {
                [FAKE_OPENAI_MODEL]: {
                  name: "Browser Test Model",
                },
              },
            },
          },
        },
      })
      await waitForBrowserTestTool(instance.baseUrl, workspace)
      await use(instance)
    } finally {
      try { await instance?.stop() } finally { await removeTempDir(stateRoot) }
    }
  }, { scope: "worker" }],
  openchamber: [async ({ isolatedOpenCode }, use) => {
    const instance = await startOpenChamberProcess({
      openCodeUrl: isolatedOpenCode.baseUrl,
      password: UI_PASSWORD,
      initialSettings: {
        defaultModel: `${FAKE_OPENAI_PROVIDER}/${FAKE_OPENAI_MODEL}`,
      },
    })
    try {
      await use(instance)
    } finally {
      await instance.stop()
    }
  }, { scope: "worker" }],
  login: async ({ page, openchamber, isolatedOpenCode }, use) => {
    await use(async () => {
      await page.route(/^https?:\/\//, async (route) => {
        const hostname = new URL(route.request().url()).hostname
        if (hostname === "127.0.0.1" || hostname === "localhost") {
          await route.fallback()
          return
        }
        await route.abort("blockedbyclient")
      })
      await page.addInitScript(({ workspace, providerId, modelId }) => {
        window.localStorage.setItem("homeDirectory", workspace)
        window.localStorage.setItem("lastDirectory", workspace)
        window.localStorage.setItem("projects", JSON.stringify([
          { path: workspace, label: "Browser workspace" },
        ]))
        const directorySelection = {
          providers: [],
          currentProviderId: providerId,
          currentModelId: modelId,
          selectedProviderId: providerId,
          agentModelSelections: {},
          defaultProviders: {},
        }
        window.localStorage.setItem("provider-config-store", JSON.stringify({
          state: {
            activeDirectoryKey: workspace,
            directoryScoped: { [workspace]: directorySelection },
            currentProviderId: providerId,
            currentModelId: modelId,
            isAutoModel: false,
            selectedProviderId: providerId,
            agentModelSelections: {},
            defaultProviders: {},
          },
          version: 1,
        }))
      }, {
        workspace: isolatedOpenCode.cwd,
        providerId: FAKE_OPENAI_PROVIDER,
        modelId: FAKE_OPENAI_MODEL,
      })
      const authEvents: Array<{ kind: string; method: string; status?: number; url: string }> = []
      page.on("request", (request) => {
        if (request.url().endsWith("/auth/session")) authEvents.push({ kind: "request", method: request.method(), url: request.url() })
      })
      page.on("response", (response) => {
        if (response.url().endsWith("/auth/session")) authEvents.push({ kind: "response", method: response.request().method(), status: response.status(), url: response.url() })
      })
      await page.goto(openchamber.baseUrl)
      const password = page.locator("#openchamber-ui-password")
      await expect(password).toBeVisible()
      await password.fill(UI_PASSWORD)
      const loginResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST" && response.url().endsWith("/auth/session"),
      )
      await page.getByRole("button", { name: "Unlock" }).click()
      const loginResponse = await loginResponsePromise
      const loginHeaders = await loginResponse.allHeaders()
      const loginBody = await loginResponse.text()
      const initialCookies = await page.context().cookies(openchamber.baseUrl)
      const initialCookieMetadata = initialCookies.map(({ name, domain, path, httpOnly, secure, sameSite }) => ({ name, domain, path, httpOnly, secure, sameSite }))
      const safeLoginHeaders = Object.fromEntries(Object.entries(loginHeaders).map(([name, value]) => [name, name === "set-cookie" ? "<redacted>" : value]))
      if (process.env.BROWSER_TEST_DIAGNOSTICS === "1") {
        console.log("[browser-auth-diagnostics]", JSON.stringify({
          loginStatus: loginResponse.status(),
          loginHeaders: safeLoginHeaders,
          loginBody,
          cookies: initialCookieMetadata,
          authEvents,
          pageUrl: page.url(),
        }))
      }
      expect(loginResponse.status(), `UI login response headers=${JSON.stringify(safeLoginHeaders)} body=${loginBody}`).toBe(200)
      await expect.poll(async () => (await page.context().cookies(openchamber.baseUrl)).some((cookie) => cookie.name === "oc_ui_session"), {
        message: `UI login response did not persist oc_ui_session; initial cookies=${JSON.stringify(initialCookieMetadata)}`,
      }).toBe(true)
      const cookies = await page.context().cookies(openchamber.baseUrl)
      const sessionCookie = cookies.find((cookie) => cookie.name === "oc_ui_session")
      const cookieMetadata = cookies.map(({ name, domain, path, httpOnly, secure, sameSite }) => ({ name, domain, path, httpOnly, secure, sameSite }))
      expect(sessionCookie, `UI login cookies=${JSON.stringify(cookieMetadata)}`).toBeTruthy()
      await expect(password).toBeHidden()
      const sessionStatus = await page.evaluate(async () => {
        const response = await fetch("/auth/session", { credentials: "include" })
        return { status: response.status, body: await response.text() }
      })
      let sessionBody: { authenticated?: boolean } = {}
      try { sessionBody = JSON.parse(sessionStatus.body) as { authenticated?: boolean } } catch { /* diagnostic assertion below */ }
      if (process.env.BROWSER_TEST_DIAGNOSTICS === "1") console.log("[browser-auth-session-diagnostics]", JSON.stringify({ sessionStatus: sessionStatus.status, sessionBody, cookies: cookieMetadata }))
      expect(sessionBody.authenticated, `UI session status=${sessionStatus.status} body=${sessionStatus.body} cookies=${JSON.stringify(cookieMetadata)}`).toBe(true)
    })
  },
  logout: async ({ page }, use) => {
    await use(async () => {
      await page.context().clearCookies()
      await page.evaluate(() => window.localStorage.clear())
      await page.reload()
      await expect(page.locator("#openchamber-ui-password")).toBeVisible()
    })
  },
})

export { expect }
/* eslint-enable react-hooks/rules-of-hooks */
