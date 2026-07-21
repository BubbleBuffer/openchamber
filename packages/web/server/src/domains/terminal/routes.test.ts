import { describe, expect, it, vi } from "vitest";
import {
  terminalError,
} from "../../contracts/terminal.js";
import { registerTerminalRoutes } from "./routes.js";
import { getTerminalSessions } from "./sessions.js";

describe("terminal route contract boundaries", () => {
  it("rejects malformed create bodies at the registered HTTP seam with a safe coded error", async () => {
    const routes = new Map<string, (...args: never[]) => unknown>();
    const app = {
      post: (path: string, ...handlers: Array<(...args: never[]) => unknown>) => routes.set(`POST ${path}`, handlers.at(-1)!),
      get: (path: string, handler: (...args: never[]) => unknown) => routes.set(`GET ${path}`, handler),
      delete: (path: string, handler: (...args: never[]) => unknown) => routes.set(`DELETE ${path}`, handler),
    };
    registerTerminalRoutes(app as never, { text: () => vi.fn() } as never, {
      fs: {} as never,
      buildAugmentedPath: () => "",
      searchPathFor: () => null,
      isExecutable: () => false,
    } as never, {} as never);

    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const createRoute = routes.get("POST /api/terminal/create") as unknown as (req: unknown, res: unknown) => Promise<void>;
    await createRoute({ body: { cwd: "/work", cols: 0, rows: 24 } }, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(terminalError("terminal_invalid_request"));
  });

  it("keeps process failures safe and coded", () => {
    expect(terminalError("terminal_process_failed")).toEqual({
      error: "Terminal operation failed",
      code: "terminal_process_failed",
    });
  });

  it("serializes valid terminal SSE events through the contract parser", () => {
    const routes = new Map<string, (...args: never[]) => unknown>();
    const app = {
      post: (path: string, ...handlers: Array<(...args: never[]) => unknown>) => routes.set(`POST ${path}`, handlers.at(-1)!),
      get: (path: string, handler: (...args: never[]) => unknown) => routes.set(`GET ${path}`, handler),
      delete: (path: string, handler: (...args: never[]) => unknown) => routes.set(`DELETE ${path}`, handler),
    };
    const onData = vi.fn();
    const onExit = vi.fn();
    getTerminalSessions().set("terminal-1", {
      ptyProcess: { onData, onExit }, ptyBackend: "test", cwd: "/work", lastActivity: 0, clients: new Set(), outputReplayBuffer: { chunks: [], totalBytes: 0, nextId: 1 },
    } as never);
    registerTerminalRoutes(app as never, { text: () => vi.fn() } as never, {} as never, {} as never);
    const response = { setHeader: vi.fn(), write: vi.fn().mockReturnValue(true), end: vi.fn() };
    const streamRoute = routes.get("GET /api/terminal/:sessionId/stream") as unknown as (req: unknown, res: unknown) => void;
    streamRoute({ params: { sessionId: "terminal-1" }, on: vi.fn() }, response);

    onData.mock.calls[0]![0]("prompt> ");
    onExit.mock.calls[0]![0]({ exitCode: 0, signal: 0 });
    expect(response.write).toHaveBeenCalledWith('data: {"type":"data","data":"prompt> "}\n\n');
    expect(response.write).toHaveBeenCalledWith('data: {"type":"exit","exitCode":0,"signal":0}\n\n');
    getTerminalSessions().clear();
  });
});
