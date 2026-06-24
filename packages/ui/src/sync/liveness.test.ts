import { describe, expect, test } from "bun:test"
import { createLivenessMonitor } from "./liveness"

describe("createLivenessMonitor", () => {
  test("fires onDataStall after dataSilenceMs without data events", async () => {
    const stall = new Promise<number>((resolve) => {
      const monitor = createLivenessMonitor({
        dataSilenceMs: 50,
        socketTimeoutMs: 5000,
        onDataStall: ({ duration }) => resolve(duration),
      })
      monitor.markDataEvent()
    })
    const duration = await stall
    expect(duration).toBeGreaterThan(47)
  })

  test("does NOT reset data timer on markSocketActivity", async () => {
    let stalled = false
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
      onDataStall: () => { stalled = true },
    })
    monitor.markSocketActivity()
    await new Promise((r) => setTimeout(r, 80))
    expect(stalled).toBe(true)
  })

  test("fires onSocketTimeout if no socket activity for socketTimeoutMs", async () => {
    const timeout = new Promise<void>((resolve) => {
      const monitor = createLivenessMonitor({
        dataSilenceMs: 5000,
        socketTimeoutMs: 50,
        onSocketTimeout: () => resolve(),
      })
      monitor.markSocketActivity()
    })
    await timeout
  })

  test("data events reset the data stall timer", async () => {
    let stalled = false
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
      onDataStall: () => { stalled = true },
    })
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 30))
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 30))
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 30))
    expect(stalled).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(stalled).toBe(true)
  })

  test("handles data_resumed signal and clears stall state", async () => {
    let resumed = false
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
      onDataStall: () => {},
      onDataResumed: () => { resumed = true },
    })
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 80))
    monitor.handleResumedSignal()
    expect(resumed).toBe(true)
  })

  test("resetDataTimer extends the data window", () => {
    const monitor = createLivenessMonitor({
      dataSilenceMs: 1000,
      socketTimeoutMs: 5000,
    })
    monitor.markDataEvent()
    monitor.resetDataTimer()
    expect(monitor.getDataSilenceElapsed()).toBeLessThan(50)
  })

  test("isDataFlowing returns true after data event, false after stall", async () => {
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
    })
    expect(monitor.isDataFlowing()).toBe(false) // not yet started
    monitor.markDataEvent()
    expect(monitor.isDataFlowing()).toBe(true)
    await new Promise((r) => setTimeout(r, 80))
    expect(monitor.isDataFlowing()).toBe(false)
  })

  test("isSocketAlive returns true within timeout", () => {
    const monitor = createLivenessMonitor({
      dataSilenceMs: 5000,
      socketTimeoutMs: 5000,
    })
    monitor.markSocketActivity()
    expect(monitor.isSocketAlive()).toBe(true)
  })
})
