import { describe, expect, it } from "vitest";

import { createOpenCodeRuntime } from "./open-code-runtime.js";

describe("createOpenCodeRuntime", () => {
  it("returns configured Basic auth headers synchronously", () => {
    const runtime = createOpenCodeRuntime({
      eventBus: {},
      config: {
        env: {},
        syncToHmrState: () => {},
        syncFromHmrState: () => {},
        applyOpencodeBinaryFromSettings: () => {},
        ensureOpencodeCliEnv: () => {},
        buildWslExecArgs: () => [],
        resolveWslExecutablePath: () => null,
        resolveManagedOpenCodeLaunchSpec: () => null,
        buildAugmentedPath: () => "",
        buildManagedOpenCodePath: () => "",
        clearResolvedOpenCodeBinary: () => {},
        normalizeApiPrefix: (prefix: string) => prefix,
        setupProxy: () => ({}),
      },
    });
    runtime.syncFromHmrState({ openCodeAuthPassword: "test-password" });

    const headers = runtime.getAuthHeaders();

    expect(headers).not.toBeInstanceOf(Promise);
    expect(headers).toEqual({
      Authorization: "Basic b3BlbmNvZGU6dGVzdC1wYXNzd29yZA==",
    });
  });
});
