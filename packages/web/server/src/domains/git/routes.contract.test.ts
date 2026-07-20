/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

vi.mock("./index.js", () => ({
  isGitRepository: vi.fn(async () => true),
  getStatus: vi.fn(async () => ({ current: null, tracking: null, ahead: 0, behind: 0, files: [], isClean: true, mergeInProgress: null, rebaseInProgress: null, attentionReason: "rebase" })),
  rebase: vi.fn(async () => ({ success: false, conflict: true, conflictFiles: ["rebase.ts"] })),
  continueRebase: vi.fn(async () => ({ success: false, conflict: true, conflictFiles: ["continue.ts"] })),
  merge: vi.fn(async () => ({ success: false, conflict: true, conflictFiles: ["merge.ts"] })),
  continueMerge: vi.fn(async () => ({ success: false, conflict: true, conflictFiles: ["continue-merge.ts"] })),
  previewWorktreeCreate: vi.fn(async () => ({ name: "topic", branch: "topic", path: "/worktrees/topic" })),
  getGlobalIdentity: vi.fn(async () => ({ userName: "Ada", userEmail: "ada@example.test", sshCommand: "ssh -i /keys/id_ed25519" })),
  setLocalIdentity: vi.fn(async () => undefined),
}));

import { registerGitRoutes } from "./routes.js";
import { isGitRepository, setLocalIdentity } from "./index.js";

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

  it("rejects malformed service successes at the public adapter seam", async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
    registerGitRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); }, post() {}, put() {}, delete() {} } as never);
    vi.mocked(isGitRepository).mockResolvedValueOnce("yes" as never);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await routes.get("GET /api/git/check")!({ query: { directory: "/repo" } }, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: "Git operation failed", code: "git_internal_error" });
  });

  it("does not expose unexpected failure details to the browser", async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
    registerGitRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); }, post() {}, put() {}, delete() {} } as never);
    vi.mocked(isGitRepository).mockRejectedValueOnce(new Error("token=secret /private/repo"));
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await routes.get("GET /api/git/check")!({ query: { directory: "/repo" } }, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: "Git operation failed", code: "git_internal_error" });
  });

  it("preserves service conflict results and accepts headless worktree previews", async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
    registerGitRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); }, post(path: string, handler: any) { routes.set(`POST ${path}`, handler); }, put() {}, delete() {} } as never);
    const response = { json: vi.fn() };
    await routes.get("POST /api/git/rebase")!({ query: { directory: "/repo" }, body: { onto: "main" } }, response);
    await routes.get("POST /api/git/rebase/continue")!({ query: { directory: "/repo" }, body: {} }, response);
    await routes.get("POST /api/git/merge")!({ query: { directory: "/repo" }, body: { branch: "topic" } }, response);
    await routes.get("POST /api/git/merge/continue")!({ query: { directory: "/repo" }, body: {} }, response);
    await routes.get("POST /api/git/worktrees/preview")!({ query: { directory: "/repo" }, body: { mode: "new" } }, response);
    expect(response.json).toHaveBeenNthCalledWith(1, { success: false, conflict: true, conflictFiles: ["rebase.ts"] });
    expect(response.json).toHaveBeenNthCalledWith(2, { success: false, conflict: true, conflictFiles: ["continue.ts"] });
    expect(response.json).toHaveBeenNthCalledWith(3, { success: false, conflict: true, conflictFiles: ["merge.ts"] });
    expect(response.json).toHaveBeenNthCalledWith(4, { success: false, conflict: true, conflictFiles: ["continue-merge.ts"] });
    expect(response.json).toHaveBeenNthCalledWith(5, { name: "topic", branch: "topic", path: "/worktrees/topic" });
  });

  it("maps a global sshCommand into the local identity sshKey field", async () => {
    const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
    registerGitRoutes({ get() {}, post(path: string, handler: any) { routes.set(`POST ${path}`, handler); }, put() {}, delete() {} } as never);
    const response = { json: vi.fn() };
    await routes.get("POST /api/git/set-identity")!({ query: { directory: "/repo" }, body: { profileId: "global" } }, response);
    expect(setLocalIdentity).toHaveBeenCalledWith("/repo", expect.objectContaining({ sshKey: "ssh -i /keys/id_ed25519" }));
  });
});
