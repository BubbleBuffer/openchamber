import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMessageStreamWsRuntime } from "../event-stream/runtime.js";
import { createTerminalWsServer } from "../terminal/ws-server.js";

const flushUpgrades = () => new Promise((resolve) => setImmediate(resolve));

function createProtectedDeps(sessionToken: string | null, originAllowed = true) {
  const rejectWebSocketUpgrade = vi.fn();
  return {
    deps: {
      uiAuthController: { enabled: true, ensureSessionToken: async () => sessionToken },
      isRequestOriginAllowed: async () => originAllowed,
      rejectWebSocketUpgrade,
    },
    rejectWebSocketUpgrade,
  };
}

describe("protected WebSocket upgrades", () => {
  const runtimes: Array<{ close?: () => unknown; shutdown?: () => unknown }> = [];
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close?.() ?? runtime.shutdown?.()));
    vi.restoreAllMocks();
  });

  it.each([
    ["event stream", "/api/global/event/ws", (server: EventEmitter, deps: Record<string, unknown>) => createMessageStreamWsRuntime({ server: server as never, ...deps, openCodeRuntime: {}, processForwardedEventPayload: () => {} } as never)],
    ["terminal", "/api/terminal/ws", (server: EventEmitter, deps: Record<string, unknown>) => createTerminalWsServer(server as never, { ...deps } as never)],
  ])("rejects missing credentials on the %s path", async (_name, path, createRuntime) => {
    const server = new EventEmitter();
    const { deps, rejectWebSocketUpgrade } = createProtectedDeps(null);
    const runtime = createRuntime(server, deps);
    runtimes.push(runtime);

    server.emit("upgrade", { url: path }, {}, Buffer.alloc(0));
    await flushUpgrades();

    expect(rejectWebSocketUpgrade).toHaveBeenCalledWith({}, 401, "UI authentication required");
  });

  it.each([
    ["event stream", "/api/event/ws", (server: EventEmitter, deps: Record<string, unknown>) => createMessageStreamWsRuntime({ server: server as never, ...deps, openCodeRuntime: {}, processForwardedEventPayload: () => {} } as never)],
    ["terminal", "/api/terminal/ws", (server: EventEmitter, deps: Record<string, unknown>) => createTerminalWsServer(server as never, { ...deps } as never)],
  ])("rejects an invalid Origin on the %s path", async (_name, path, createRuntime) => {
    const server = new EventEmitter();
    const { deps, rejectWebSocketUpgrade } = createProtectedDeps("valid-session", false);
    const runtime = createRuntime(server, deps);
    runtimes.push(runtime);

    server.emit("upgrade", { url: path }, {}, Buffer.alloc(0));
    await flushUpgrades();

    expect(rejectWebSocketUpgrade).toHaveBeenCalledWith({}, 403, "Invalid origin");
  });
});
