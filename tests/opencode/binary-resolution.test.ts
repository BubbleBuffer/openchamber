import { afterEach, describe, expect, test } from "vitest"
import { getOpencodeBinary } from "../helpers/env"

const BINARY_ENV_KEYS = [
  "TEST_OPENCODE_BINARY",
  "OPENCODE_BINARY",
  "OPENCODE_PATH",
  "OPENCHAMBER_OPENCODE_PATH",
  "OPENCHAMBER_OPENCODE_BIN",
] as const

const original = Object.fromEntries(BINARY_ENV_KEYS.map((key) => [key, process.env[key]])) as Record<(typeof BINARY_ENV_KEYS)[number], string | undefined>

function clearBinaryEnv(): void {
  for (const key of BINARY_ENV_KEYS) delete process.env[key]
}

afterEach(() => {
  for (const key of BINARY_ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

describe("OpenCode binary resolution", () => {
  test("uses TEST_OPENCODE_BINARY first", () => {
    clearBinaryEnv()
    process.env.TEST_OPENCODE_BINARY = "/tmp/test-opencode"
    process.env.OPENCODE_BINARY = "/tmp/opencode"
    expect(getOpencodeBinary()).toBe("/tmp/test-opencode")
  })

  test("falls back to OPENCODE_BINARY", () => {
    clearBinaryEnv()
    process.env.OPENCODE_BINARY = "/tmp/opencode"
    expect(getOpencodeBinary()).toBe("/tmp/opencode")
  })

  test("falls back to OPENCODE_PATH", () => {
    clearBinaryEnv()
    process.env.OPENCODE_PATH = "/tmp/opencode-path"
    expect(getOpencodeBinary()).toBe("/tmp/opencode-path")
  })

  test("falls back to OPENCHAMBER_OPENCODE_PATH", () => {
    clearBinaryEnv()
    process.env.OPENCHAMBER_OPENCODE_PATH = "/tmp/openchamber-opencode-path"
    expect(getOpencodeBinary()).toBe("/tmp/openchamber-opencode-path")
  })

  test("falls back to OPENCHAMBER_OPENCODE_BIN", () => {
    clearBinaryEnv()
    process.env.OPENCHAMBER_OPENCODE_BIN = "/tmp/openchamber-opencode-bin"
    expect(getOpencodeBinary()).toBe("/tmp/openchamber-opencode-bin")
  })

  test("defaults to opencode", () => {
    clearBinaryEnv()
    expect(getOpencodeBinary()).toBe("opencode")
  })
})
