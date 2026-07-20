/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { registerGitHubRoutes } from "./routes.js";

describe("GitHub route contracts", () => {
  it("inventories every public GitHub route", () => {
    const routes = new Map<string, any>();
    registerGitHubRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); }, post(path: string, handler: any) { routes.set(`POST ${path}`, handler); }, delete(path: string, handler: any) { routes.set(`DELETE ${path}`, handler); } } as never);
    expect([...routes.keys()]).toEqual(expect.arrayContaining(["GET /api/github/auth/status", "POST /api/github/auth/complete", "POST /api/github/pr/create", "POST /api/github/pr/update", "POST /api/github/pr/merge", "POST /api/github/pr/ready", "GET /api/github/issues/list", "GET /api/github/issues/get", "GET /api/github/issues/comments", "GET /api/github/pulls/list", "GET /api/github/pulls/context"]));
  });

  it("returns a stable safe error for malformed mutation payloads", async () => {
    const routes = new Map<string, any>();
    registerGitHubRoutes({ get() {}, post(path: string, handler: any) { routes.set(`POST ${path}`, handler); }, delete() {} } as never);
    const send = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), json: send };
    await routes.get("POST /api/github/pr/update")({ body: { directory: "/repo", number: "1", title: "bad" } }, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith({ error: "GitHub request failed", code: "github_invalid_request" });
  });
});
