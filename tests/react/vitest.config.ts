import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const reactDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(reactDir, "../..")
const uiSrc = path.resolve(repoRoot, "packages/web/src/ui")

export default defineConfig({
  // @ts-expect-error — vite version collision in monorepo (see bun.lock)
  plugins: [react()],
  resolve: {
    alias: {
      "@": uiSrc,
      "@contracts": path.resolve(repoRoot, "packages/web/server/src/contracts"),
      "@openchamber/agent-ui-react": path.resolve(repoRoot, "packages/agent-ui-react/src/index.ts"),
      "@openchamber/agent-ui-core": path.resolve(repoRoot, "packages/agent-ui-core/src/index.ts"),
      "@tanstack/react-virtual": path.resolve(reactDir, "mocks/tanstack-react-virtual.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["react/**/*.test.ts", "react/**/*.test.tsx"],
    setupFiles: ["react/setup.ts"],
    isolate: true,
    restoreMocks: true,
    clearMocks: true,
  },
})
