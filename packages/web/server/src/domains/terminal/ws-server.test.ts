import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalWsControlFrame, readTerminalWsControlFrame } from "./protocol.js";
import { createTerminalWsServer } from "./ws-server.js";
import { createTerminalOutputReplayBuffer } from "./replay-buffer.js";
import { getTerminalSessions } from "./sessions.js";

const decodeControl = (frame: unknown) => readTerminalWsControlFrame(frame);

describe("terminal websocket acceptance", () => {
  afterEach(async () => {
    getTerminalSessions().clear();
  });

  it("binds a session, preserves opaque input, rejects malformed control, and replays buffered output", async () => {
    const writes = vi.fn();
    const socket = Object.assign(new EventEmitter(), {
      readyState: 1,
      send: vi.fn(),
      ping: vi.fn(),
      close: vi.fn(),
    });
    const sessions = getTerminalSessions();
    sessions.set("terminal-1", {
      ptyProcess: { write: writes, resize: vi.fn(), kill: vi.fn(), onData: vi.fn(), onExit: vi.fn() },
      ptyBackend: "test-pty",
      cwd: "/work",
      lastActivity: 0,
      clients: new Set(),
      outputReplayBuffer: createTerminalOutputReplayBuffer(),
    });
    const ws = createTerminalWsServer(new EventEmitter() as never, {
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade: vi.fn(),
    } as never);
    ws.wsServer!.emit("connection", socket);

    ws.broadcastOutput("terminal-1", sessions.get("terminal-1")!, "buffered\u001b[31moutput");
    socket.emit("message", createTerminalWsControlFrame({ t: "b", s: "terminal-1", r: 0, v: 2 }), true);
    socket.emit("message", "\u001b[A\r", false);
    ws.broadcastOutput("terminal-1", sessions.get("terminal-1")!, "live-output");

    expect(socket.send.mock.calls.map(([frame]) => decodeControl(frame)).filter(Boolean)).toContainEqual(
      expect.objectContaining({ t: "bok", s: "terminal-1" }),
    );
    expect(socket.send).toHaveBeenCalledWith("buffered\u001b[31moutput");
    expect(socket.send).toHaveBeenCalledWith("live-output");
    expect(writes).toHaveBeenCalledWith("\u001b[A\r");

    socket.emit("message", Buffer.from([1, 123]), true);
    expect(socket.send.mock.calls.map(([frame]) => decodeControl(frame))).toContainEqual(
      { t: "e", c: "terminal_bad_frame", f: false },
    );
    expect(writes).toHaveBeenCalledTimes(1);

    await ws.shutdown();
  });
});
