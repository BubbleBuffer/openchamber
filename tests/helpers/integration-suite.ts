import { afterAll, beforeAll, describe } from "vitest"
import { checkOpenCodeAvailable } from "./env"
import { startOpenChamberAgainstOpenCode, type StartedOpenChamber } from "./openchamber-process"
import { startOpenCodeInstance, type StartedOpenCode } from "./opencode-process"

type MaybePromise<T> = T | Promise<T>

export const openCodeAvailability = await checkOpenCodeAvailable()
export const describeWhenOpenCode = openCodeAvailability.available ? describe : describe.skip

export type OpenCodeSuiteContext = {
  readonly opencode: StartedOpenCode
}

export type OpenChamberSuiteContext = OpenCodeSuiteContext & {
  readonly openchamber: StartedOpenChamber
}

type OpenCodeSuiteOptions = {
  timeoutMs?: number
  start?: () => Promise<StartedOpenCode>
  beforeStop?: (ctx: OpenCodeSuiteContext) => MaybePromise<void>
  afterStop?: () => MaybePromise<void>
}

type OpenChamberSuiteOptions = Omit<OpenCodeSuiteOptions, "beforeStop"> & {
  startOpenChamber?: (opencode: StartedOpenCode) => Promise<StartedOpenChamber>
  beforeStop?: (ctx: OpenChamberSuiteContext) => MaybePromise<void>
}

const missing = (name: string): never => {
  throw new Error(`${name} was accessed before the integration suite started`)
}

// PID-file-only cleanup is implemented in opencode-process.ts. Do not add
// process-name matching here; user-spawned opencode instances must never be
// matched or killed by these tests.
export function describeWithOpenCode(
  name: string,
  options: OpenCodeSuiteOptions,
  register: (ctx: OpenCodeSuiteContext) => void,
): void {
  let opencode: StartedOpenCode | undefined
  const ctx: OpenCodeSuiteContext = {
    get opencode() {
      return opencode ?? missing("opencode")
    },
  }

  afterAll(async () => {
    try { await options.beforeStop?.(ctx) } catch { /* best-effort */ }
    try { await opencode?.stop() } catch { /* best-effort */ }
    try { await options.afterStop?.() } catch { /* best-effort */ }
  })

  describeWhenOpenCode(name, () => {
    beforeAll(async () => {
      opencode = await (options.start?.() ?? startOpenCodeInstance())
    }, options.timeoutMs ?? 30_000)

    register(ctx)
  })
}

export function describeWithOpenChamber(
  name: string,
  options: OpenChamberSuiteOptions,
  register: (ctx: OpenChamberSuiteContext) => void,
): void {
  let opencode: StartedOpenCode | undefined
  let openchamber: StartedOpenChamber | undefined
  const ctx: OpenChamberSuiteContext = {
    get opencode() {
      return opencode ?? missing("opencode")
    },
    get openchamber() {
      return openchamber ?? missing("openchamber")
    },
  }

  afterAll(async () => {
    try { await options.beforeStop?.(ctx) } catch { /* best-effort */ }
    try { await openchamber?.stop() } catch { /* best-effort */ }
    try { await opencode?.stop() } catch { /* best-effort */ }
    try { await options.afterStop?.() } catch { /* best-effort */ }
  })

  describeWhenOpenCode(name, () => {
    beforeAll(async () => {
      opencode = await (options.start?.() ?? startOpenCodeInstance())
      openchamber = await (options.startOpenChamber?.(opencode) ?? startOpenChamberAgainstOpenCode({ opencodeHost: opencode.baseUrl }))
    }, options.timeoutMs ?? 45_000)

    register(ctx)
  })
}
