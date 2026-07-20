/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

vi.mock("./index.js", () => ({
  isGitRepository: vi.fn(async () => true),
  getStatus: vi.fn(async () => ({ current: null, tracking: null, ahead: 0, behind: 0, files: [], isClean: true, mergeInProgress: null, rebaseInProgress: null, attentionReason: "rebase" })),
}));

import { registerGitRoutes } from "./routes.js";

describe("git route contracts", () => {
  it("returns stable coded errors for invalid status directories", async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
    registerGitRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); }, post() {}, put() {}, delete() {} } as never);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes.get("GET /api/git/status")!({ query: {} }, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: "Invalid git request", code: "git_invalid_request" });
  });

  it("keeps nullable branch and attention state in status responses", async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
    registerGitRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); }, post() {}, put() {}, delete() {} } as never);
    const response = { json: vi.fn() };
    await routes.get("GET /api/git/status")!({ query: { directory: "/repo" } }, response);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ current: null, tracking: null, attentionReason: "rebase" }));
  });
});
