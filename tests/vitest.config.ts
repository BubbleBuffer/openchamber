import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["opencode/**/*.test.ts", "web/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
    isolate: true,
    // Run one file at a time because every test file starts its own
    // OpenCode + OpenChamber child processes. Parallel execution
    // causes resource contention and unreliable timeouts.
    fileParallelism: false,
    env: {
      OPENCODE_SKIP_START: "true",
      OPENCHAMBER_SKIP_OPENCODE_START: "true",
    },
  },
})
