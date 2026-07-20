/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi } from "vitest";

vi.mock("./index.js", () => ({
  getWorktrees: vi.fn(async (directory: string) => [{ head: "abc123", name: "feature-worktree", branch: "feature/worktree", path: directory }]),
}));

import { registerGitRoutes } from "./routes.js";
import { getWorktrees } from "./index.js";

describe("git worktree routes", () => {
  it("forwards the validated directory to lazy git worktree discovery", async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
    const app = {
      get(path: string, handler: (req: any, res: any) => Promise<unknown>) { routes.set(`GET ${path}`, handler); },
      post() {},
      put() {},
      delete() {},
    };
    registerGitRoutes(app as never);

    const response = { json: vi.fn() };
    await routes.get("GET /api/git/worktrees")!({ query: { directory: "/validated/project" } }, response);

    expect(getWorktrees).toHaveBeenCalledWith("/validated/project");
    expect(response.json).toHaveBeenCalledWith([{ head: "abc123", name: "feature-worktree", branch: "feature/worktree", path: "/validated/project" }]);
  });
});
