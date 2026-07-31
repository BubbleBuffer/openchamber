import { describe, expect, test } from "bun:test"
import { runDedupedSessionLoad } from "./session-resource-manager"

describe("session resource manager", () => {
  test("deduplicates concurrent loads for one directory and session", async () => {
    let calls = 0
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const load = () => {
      calls += 1
      return pending
    }

    const first = runDedupedSessionLoad("/repo\nsession-1", load)
    const second = runDedupedSessionLoad("/repo\nsession-1", load)

    expect(second).toBe(first)
    expect(calls).toBe(1)
    release?.()
    await first
  })

  test("clears completed and failed requests so they can be retried", async () => {
    let calls = 0
    const key = "/repo\nsession-retry"

    await runDedupedSessionLoad(key, async () => {
      calls += 1
    })
    await runDedupedSessionLoad(key, async () => {
      calls += 1
      throw new Error("expected")
    }).catch(() => undefined)
    await runDedupedSessionLoad(key, async () => {
      calls += 1
    })

    expect(calls).toBe(3)
  })

  test("does not merge requests from different directories", async () => {
    let calls = 0
    await Promise.all([
      runDedupedSessionLoad("/repo-a\nsession-1", async () => {
        calls += 1
      }),
      runDedupedSessionLoad("/repo-b\nsession-1", async () => {
        calls += 1
      }),
    ])

    expect(calls).toBe(2)
  })
})
