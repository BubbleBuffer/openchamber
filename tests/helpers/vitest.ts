import { test } from "vitest"

export const slowTestsEnabled = process.env.RUN_SLOW_TESTS === "1"
export const slowTest = slowTestsEnabled ? test : test.skip
