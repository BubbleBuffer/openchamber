import "happy-dom";
import { ensureDom } from "@/stores/utils/setupDom";

ensureDom();

import { describe, expect, it } from "bun:test";

const { flushSettings, requestConfigReload, updateDesktopSettings } = await import("./persistence");

describe("settings persistence coordination", () => {
  it("coalesces updates while allowing an explicit flush to await the PUT", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ method?: string; body?: string }> = [];
    let resolvePut: (() => void) | undefined;
    let resolvePutStarted: (() => void) | undefined;
    const putStarted = new Promise<void>((resolve) => {
      resolvePutStarted = resolve;
    });

    globalThis.fetch = (async (_input, init) => {
      if (init?.method !== "PUT") {
        return { ok: false, json: async () => null } as Response;
      }

      requests.push({
        method: init?.method,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      resolvePutStarted?.();

      await new Promise<void>((resolve) => {
        resolvePut = resolve;
      });

      return {
        ok: true,
        json: async () => ({ opencodeBinary: "/tmp/opencode" }),
      } as Response;
    }) as typeof fetch;

    try {
      await updateDesktopSettings({ opencodeBinary: "/tmp/old" });
      await updateDesktopSettings({ opencodeBinary: "/tmp/opencode" });

      expect(requests).toEqual([]);

      let flushComplete = false;
      const flushPromise = flushSettings().then(() => {
        flushComplete = true;
      });

      await putStarted;
      expect(requests).toHaveLength(1);
      expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
        opencodeBinary: "/tmp/opencode",
      });
      expect(flushComplete).toBe(false);

      if (!resolvePut) throw new Error("PUT was not held open");
      resolvePut();
      await flushPromise;
      expect(flushComplete).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      await flushSettings();
    }
  });

  it("throws the server error when configuration reload fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      json: async () => ({ error: "OpenCode is not ready" }),
    })) as unknown as typeof fetch;

    try {
      await expect(requestConfigReload()).rejects.toThrow("OpenCode is not ready");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes reload request failures for callers to surface", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    try {
      await expect(requestConfigReload()).rejects.toThrow("Failed to reload configuration");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
