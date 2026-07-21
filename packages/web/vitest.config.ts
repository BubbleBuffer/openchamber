import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Vitest owns explicit API, contract, and server suites. The remaining
// `*.test.*` files import `bun:test` and are exercised by `test:stores`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: [
        "src/api/**/*.test.{ts,tsx}",
        "src/ui/**/*.contract.test.{ts,tsx}",
        "src/ui/sync/event-pipeline.test.ts",
        "src/ui/lib/terminal/terminalApi.test.ts",
        "src/ui/components/ui/UpdateDialog.test.ts",
        "src/ui/stores/config/useProviderConfigStore.test.ts",
        "server/src/**/*.test.ts",
        "package-manifest.test.js",
        "bin/cli.test.js",
      ],
      environment: "node",
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
