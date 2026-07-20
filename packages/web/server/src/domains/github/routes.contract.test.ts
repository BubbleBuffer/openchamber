/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./index.js", () => ({
  getGitHubAuth: vi.fn(),
  getGitHubAuthAccounts: vi.fn(),
  getGitHubClientId: vi.fn(),
  getGitHubScopes: vi.fn(),
  getOctokitOrNull: vi.fn(),
  resolveGitHubRepoFromDirectory: vi.fn(),
}));

import { registerGitHubRoutes } from "./routes.js";
import { getOctokitOrNull, resolveGitHubRepoFromDirectory } from "./index.js";
import { GITHUB_ROUTE_CONTRACTS } from "../../contracts/github.js";

const routeHandlers = () => {
  const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
  registerGitHubRoutes({
    get(path: string, handler: any) { routes.set(`GET ${path}`, handler); },
    post(path: string, handler: any) { routes.set(`POST ${path}`, handler); },
    delete(path: string, handler: any) { routes.set(`DELETE ${path}`, handler); },
  } as never);
  return routes;
};

const response = () => ({ statusCode: 200, status: vi.fn(function (this: any, statusCode: number) { this.statusCode = statusCode; return this; }), json: vi.fn() });

const octokit = {
  rest: {
    issues: {
      get: vi.fn(async () => ({ data: { number: 123, title: "Issue", html_url: "https://example.test/issues/123", state: "open", body: "", created_at: "2025-01-01", updated_at: "2025-01-02", user: null, assignees: [], labels: [] } })),
      listComments: vi.fn(async () => ({ data: [] })),
    },
    pulls: {
      get: vi.fn(async () => ({ data: { number: 123, title: "PR", html_url: "https://example.test/pulls/123", state: "open", draft: false, base: { ref: "main" }, head: { ref: "topic", sha: "abc" }, body: "", created_at: "2025-01-01", updated_at: "2025-01-02", user: null } })),
      listReviewComments: vi.fn(async () => ({ data: [] })),
      listFiles: vi.fn(async () => ({ data: [] })),
    },
    checks: { listForRef: vi.fn(async () => ({ data: { check_runs: [] } })) },
    repos: { getCombinedStatusForRef: vi.fn(async () => ({ data: { statuses: [] } })) },
  },
};

describe("GitHub route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it.each([
    ["GET /api/github/issues/get", "issues", "get", "issue_number"],
    ["GET /api/github/issues/comments", "issues", "listComments", "issue_number"],
    ["GET /api/github/pulls/context", "pulls", "get", "pull_number"],
  ])("converts canonical query number for %s before reaching its dependency", async (route, resource, method, numberKey) => {
    vi.mocked(getOctokitOrNull).mockReturnValue(octokit as never);
    vi.mocked(resolveGitHubRepoFromDirectory).mockResolvedValue({ repo: { owner: "openchamber", repo: "web" } } as never);
    const request = vi.spyOn(GITHUB_ROUTE_CONTRACTS[route], "request");
    const res = response();

    await routeHandlers().get(route)!({ query: { directory: "/repo", number: "123" } }, res);

    expect(request).toHaveBeenCalledWith({ directory: "/repo", number: 123 });
    expect((octokit.rest as any)[resource][method]).toHaveBeenCalledWith(expect.objectContaining({ [numberKey]: 123 }));
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(["1.5", "Infinity", "01", "", ["123", "123"]])("rejects invalid query number %j before a GitHub dependency for each active number route", async (number) => {
    const routes = routeHandlers();
    const res = response();

    await Promise.all([
      routes.get("GET /api/github/issues/get")!({ query: { directory: "/repo", number } }, res),
      routes.get("GET /api/github/issues/comments")!({ query: { directory: "/repo", number } }, res),
      routes.get("GET /api/github/pulls/context")!({ query: { directory: "/repo", number } }, res),
    ]);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "GitHub request failed", code: "github_invalid_request" });
    expect(getOctokitOrNull).not.toHaveBeenCalled();
    expect(resolveGitHubRepoFromDirectory).not.toHaveBeenCalled();
  });
});
