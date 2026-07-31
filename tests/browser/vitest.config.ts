import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["support/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
})
