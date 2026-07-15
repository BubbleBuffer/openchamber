import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("checkForUpdates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:os");
    vi.resetModules();
  });

  it("sends the web app type and host platform details to the update API", async () => {
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "openchamber-package-manager-"));
    const previousFetch = globalThis.fetch;
    let requestPayload: Record<string, unknown> | undefined;

    vi.doMock("node:os", () => ({
      homedir: () => homeDirectory,
    }));
    globalThis.fetch = (async (_input, init) => {
      requestPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          latestVersion: "1.0.0",
          updateAvailable: false,
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const { checkForUpdates } = await import("./package-manager.js");

      await checkForUpdates({
        currentVersion: "1.0.0",
        appType: "vscode",
        platform: "windows",
        arch: "arm64",
      });

      const expectedPlatform = ({ darwin: "macos", win32: "windows", linux: "linux" } as Record<string, string>)[process.platform] ?? "web";
      const expectedArch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : "unknown";
      expect(requestPayload).toMatchObject({
        appType: "web",
        platform: expectedPlatform,
        arch: expectedArch,
      });
    } finally {
      globalThis.fetch = previousFetch;
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
