import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("checkForUpdates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:os");
    vi.doUnmock("node:child_process");
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

  it("does not short-circuit desktop runtime inputs or restore desktop package metadata", async () => {
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "openchamber-package-manager-"));
    const previousRuntime = process.env.OPENCHAMBER_RUNTIME;
    const previousFetch = globalThis.fetch;
    let requestPayload: Record<string, unknown> | undefined;
    const spawnSync = vi.fn(() => ({ status: 1, stdout: "", stderr: "" }));
    const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      requestPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          latestVersion: "1.0.0",
          updateAvailable: false,
        }),
      } as Response;
    });

    vi.doMock("node:os", () => ({
      homedir: () => homeDirectory,
    }));
    vi.doMock("node:child_process", () => ({ spawnSync }));
    process.env.OPENCHAMBER_RUNTIME = "desktop";
    globalThis.fetch = fetch as typeof globalThis.fetch;

    try {
      const { checkForUpdates } = await import("./package-manager.js");

      const result = await checkForUpdates({
        currentVersion: "1.0.0",
        appType: "desktop-tauri",
        instanceMode: "desktop",
      });

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(result.packageManager).toBe("npm");
      expect(result.packageManager).not.toBe("electron");
      expect(requestPayload).toMatchObject({
        appType: "web",
      });
      const installIdFiles = await readdir(path.join(homeDirectory, ".config", "openchamber"));
      expect(installIdFiles).toContain("install-id-web");
      expect(installIdFiles).not.toContain("install-id-desktop-tauri");
      expect(spawnSync).toHaveBeenCalled();
    } finally {
      if (previousRuntime === undefined) {
        delete process.env.OPENCHAMBER_RUNTIME;
      } else {
        process.env.OPENCHAMBER_RUNTIME = previousRuntime;
      }
      globalThis.fetch = previousFetch;
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
