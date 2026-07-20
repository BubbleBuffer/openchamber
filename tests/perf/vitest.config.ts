import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const perfDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(perfDir, "../..")
const uiSrc = path.resolve(repoRoot, "packages/web/src/ui")

export default defineConfig({
  // @ts-expect-error vite 7.3.x type collision with @vitejs/plugin-react 5.x — see slice 1 infra
  plugins: [react()],
  resolve: {
    alias: {
      "@": uiSrc,
      "@contracts": path.resolve(repoRoot, "packages/web/server/src/contracts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["perf/**/*.bench.ts", "perf/**/*.bench.tsx"],
    setupFiles: ["perf/setup.ts"],
    benchmark: {
      includeSamples: true,
    },
    isolate: true,
    restoreMocks: true,
    clearMocks: true,
  },
})
