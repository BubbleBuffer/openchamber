import { describe, expect, it } from "vitest";
import {
  TERMINAL_ERROR_CODES,
  parseTerminalCreateRequest,
  parseTerminalErrorResponse,
  parseTerminalSessionResponse,
  parseTerminalWsControlFrame,
  parseTerminalWsDataFrame,
} from "./terminal.js";

describe("terminal contract", () => {
  it("accepts terminal session creation and capability responses", () => {
    expect(parseTerminalCreateRequest({ cwd: "/work", cols: 120, rows: 40 })).toEqual({
      ok: true,
      value: { cwd: "/work", cols: 120, rows: 40 },
    });
    expect(parseTerminalSessionResponse({
      sessionId: "terminal-1",
      cols: 120,
      rows: 40,
      capabilities: {
        input: { preferred: "ws", transports: ["ws", "http"], ws: { path: "/api/terminal/ws", v: 2, enc: "json" } },
        stream: { preferred: "ws", transports: ["ws", "sse"], ws: { path: "/api/terminal/ws", v: 2, enc: "json" } },
      },
    }).ok).toBe(true);
  });

  it("rejects malformed dimensions, encoded input bodies, and error payloads", () => {
    expect(parseTerminalCreateRequest({ cwd: "/work", cols: 0, rows: 24 }).ok).toBe(false);
    expect(parseTerminalCreateRequest({ cwd: "/work", cols: 80.5, rows: 24 }).ok).toBe(false);
    expect(parseTerminalWsDataFrame({ data: "x" }).ok).toBe(false);
    expect(parseTerminalErrorResponse({ error: "failed", code: "terminal_process_failed" }).ok).toBe(true);
    expect(TERMINAL_ERROR_CODES).toContain("terminal_unauthorized");
  });

  it("parses valid control frames while rejecting malformed reconnect state", () => {
    expect(parseTerminalWsControlFrame({ t: "b", s: "terminal-1", r: 2, v: 2 })).toEqual({
      ok: true,
      value: { t: "b", s: "terminal-1", r: 2, v: 2 },
    });
    expect(parseTerminalWsControlFrame({ t: "b", s: "terminal-1", r: -1, v: 2 }).ok).toBe(false);
    expect(parseTerminalWsControlFrame({ t: "x", s: "terminal-1", exitCode: "1", signal: 0, v: 2 }).ok).toBe(false);
  });
});
