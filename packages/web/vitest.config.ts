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
        "src/sw.test.ts",
        "src/ui/**/*.contract.test.{ts,tsx}",
        "src/ui/sync/event-pipeline.test.ts",
        "src/ui/lib/terminal/terminalApi.test.ts",
        "src/ui/lib/tools/promptTemplates.test.ts",
        "src/ui/components/ui/UpdateDialog.test.ts",
        "src/ui/stores/config/useProviderConfigStore.test.ts",
        "server/src/**/*.test.ts",
        "package-manifest.test.js",
        "vite.chunking.test.ts",
        "bin/cli.test.js",
        "bin/cli-args.test.js",
        "bin/cli-output.test.js",
        "bin/cli-dispatch.test.js",
        "bin/cli/create-commands.test.js",
        "bin/cli/instance-store.test.js",
        "bin/cli/process-runtime.test.js",
        "bin/cli/log-files.test.js",
        "bin/cli/commands/serve.test.js",
        "bin/cli/commands/stop.test.js",
        "bin/cli/commands/restart.test.js",
        "bin/cli/commands/status.test.js",
        "bin/cli/commands/logs.test.js",
        "bin/cli/commands/update.test.js",
        "bin/cli/daemon-entry.test.js",
      ],
      environment: "node",
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
);
