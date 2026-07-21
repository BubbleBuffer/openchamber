import { describe, expect, it } from "vitest";
import { registerMagicPromptRoutes } from "./routes.js";

type Handler = (req: { body?: unknown; params?: { id?: unknown } }, res: ReturnType<typeof response>) => Promise<unknown>;
const registry = () => {
  const handlers = new Map<string, Handler>();
  const app = { get: (path: string, handler: Handler) => handlers.set(`GET ${path}`, handler), put: (path: string, handler: Handler) => handlers.set(`PUT ${path}`, handler), delete: (path: string, handler: Handler) => handlers.set(`DELETE ${path}`, handler) };
  return { app: app as never, handler: (method: string, path: string) => handlers.get(`${method} ${path}`) };
};
const response = () => {
  let statusCode = 200; let payload: unknown;
  return { status: (status: number) => { statusCode = status; return { json: (value: unknown) => { payload = value; } }; }, json: (value: unknown) => { payload = value; }, get statusCode() { return statusCode; }, get payload() { return payload; } };
};
const deps = (writeFile: () => Promise<void> = async () => {}) => ({ openchamberDataDir: "/data", path: { join: (...parts: string[]) => parts.join("/"), dirname: () => "/data" }, fsPromises: { mkdir: async () => {}, readFile: async () => JSON.stringify({ version: 1, overrides: {} }), writeFile } });

describe("magic-prompt routes", () => {
  it("rejects invalid prompt paths and bodies with a safe contracted error", async () => {
    const routes = registry(); registerMagicPromptRoutes(routes.app, deps());
    for (const req of [{ params: { id: "../../secret" }, body: { text: "prompt" } }, { params: { id: "git.commit.generate.visible" }, body: { text: 1 } }]) {
      const res = response(); await routes.handler("PUT", "/api/magic-prompts/:id")?.(req, res);
      expect(res.statusCode).toBe(400); expect(res.payload).toEqual({ error: "Request failed", code: "opencode_invalid_request" });
    }
  });

  it("returns contracted success state and hides write failures", async () => {
    const routes = registry(); registerMagicPromptRoutes(routes.app, deps(async () => { throw new Error("token=secret /private/path"); }));
    const success = response(); await routes.handler("GET", "/api/magic-prompts")?.({}, success);
    expect(success.payload).toEqual({ version: 1, overrides: {} });
    const failed = response(); await routes.handler("PUT", "/api/magic-prompts/:id")?.({ params: { id: "git.commit.generate.visible" }, body: { text: "prompt" } }, failed);
    expect(failed.statusCode).toBe(500); expect(failed.payload).toEqual({ error: "Internal server error", code: "opencode_internal_error" });
  });
});
