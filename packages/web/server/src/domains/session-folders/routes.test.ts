import { describe, expect, it } from "vitest";
import { registerSessionFoldersRoutes } from "./routes.js";

type Handler = (req: { body?: unknown }, res: ReturnType<typeof response>) => Promise<unknown>;
const registry = () => {
  const handlers = new Map<string, Handler>();
  return {
    app: { get: (path: string, handler: Handler) => handlers.set(`GET ${path}`, handler), post: (path: string, handler: Handler) => handlers.set(`POST ${path}`, handler) } as never,
    handler: (method: string, path: string) => handlers.get(`${method} ${path}`),
  };
};
const response = () => {
  let statusCode = 200; let payload: unknown;
  return { status: (status: number) => { statusCode = status; return { json: (value: unknown) => { payload = value; } }; }, json: (value: unknown) => { payload = value; }, get statusCode() { return statusCode; }, get payload() { return payload; } };
};
const validState = { version: 1, foldersMap: { scope: [{ id: "folder", name: "Inbox", sessionIds: ["session"], createdAt: 1, parentId: null }] }, collapsedFolderIds: [], updatedAt: 2 };

describe("session-folder routes", () => {
  it("rejects malformed updates and does not write them", async () => {
    const routes = registry(); let writes = 0;
    registerSessionFoldersRoutes(routes.app, { openchamberDataDir: "/data", path: { join: (...parts: string[]) => parts.join("/"), dirname: () => "/data" }, fsPromises: { mkdir: async () => {}, readFile: async () => "", writeFile: async () => { writes += 1; }, rename: async () => {} } });
    const res = response();
    await routes.handler("POST", "/api/session-folders")?.({
      body: { ...validState, foldersMap: { scope: [{ ...validState.foldersMap.scope[0], name: " " }] } },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "Request failed", code: "opencode_invalid_request" });
    expect(writes).toBe(0);

    const success = response();
    await routes.handler("POST", "/api/session-folders")?.({ body: validState }, success);
    expect(success.statusCode).toBe(200);
    expect(success.payload).toEqual({ success: true });
    expect(writes).toBe(1);
  });

  it("returns only a contracted folder state and safe internal errors", async () => {
    const routes = registry();
    registerSessionFoldersRoutes(routes.app, { openchamberDataDir: "/data", path: { join: (...parts: string[]) => parts.join("/"), dirname: () => "/data" }, fsPromises: { mkdir: async () => {}, readFile: async () => { throw new Error("/private/path token=secret"); }, writeFile: async () => {}, rename: async () => {} } });
    const res = response();
    await routes.handler("GET", "/api/session-folders")?.({}, res);
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ error: "Internal server error", code: "opencode_internal_error" });
  });
});
