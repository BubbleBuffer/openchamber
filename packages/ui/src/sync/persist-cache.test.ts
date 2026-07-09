import { describe, expect, test } from "bun:test"
import { writeCache, readCache } from "./persist-cache"

// Minimal localStorage mock for Node/bun test environment
const storage = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
    clear: () => { storage.clear() },
    get length() { return storage.size },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
  },
  writable: true,
})

describe("persist-cache quota recovery", () => {
  test("clears directory cache and retries on quota error", () => {
    const dir = "/tmp/quota-test-dir"
    let count = 0
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = (key: string, value: string) => {
      if (count === 0) { count++; throw new DOMException("Quota exceeded", "QuotaExceededError") }
      return originalSetItem(key, value)
    }
    writeCache(dir, "vcs", { branch: "main" })
    localStorage.setItem = originalSetItem
    expect(readCache<{ branch: string }>(dir, "vcs")).toEqual({ branch: "main" })
  })
})
