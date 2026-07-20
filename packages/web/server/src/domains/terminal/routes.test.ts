import { describe, expect, it, vi } from "vitest";
import {
  terminalError,
} from "../../contracts/terminal.js";
import { registerTerminalRoutes } from "./routes.js";

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
});
