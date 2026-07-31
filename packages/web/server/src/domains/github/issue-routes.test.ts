/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./index.js", () => ({
  getOctokitOrNull: vi.fn(),
  resolveGitHubRepoFromDirectory: vi.fn(),
}));

import { getOctokitOrNull, resolveGitHubRepoFromDirectory } from "./index.js";
import { registerGitHubIssueRoutes } from "./issue-routes.js";

const routeHandlers = () => {
  const routes = new Map<string, (req: any, res: any) => Promise<unknown>>();
  registerGitHubIssueRoutes((path, handler) => routes.set(path, handler));
  return routes;
};

const response = () => ({
  statusCode: 200,
  status: vi.fn(function (this: any, statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }),
  json: vi.fn(),
});

describe("GitHub issue routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes issue listing to the requested directory and excludes pull requests", async () => {
    const listForRepo = vi.fn(async () => ({
      headers: { link: '<https://api.github.test/repos/openchamber/web/issues?page=3>; rel="next"' },
      data: [
        {
          number: 12,
          title: "Keep me",
          html_url: "https://github.test/openchamber/web/issues/12",
          state: "open",
          user: { login: "octo", id: 7, avatar_url: "https://github.test/octo.png" },
          labels: ["legacy", { name: "bug", color: "ff0000" }, { name: "" }],
        },
        {
          number: 13,
          title: "Pull request",
          pull_request: { url: "https://api.github.test/pulls/13" },
        },
      ],
    }));
    vi.mocked(getOctokitOrNull).mockReturnValue({ rest: { issues: { listForRepo } } } as never);
    vi.mocked(resolveGitHubRepoFromDirectory).mockResolvedValue({
      repo: { owner: "openchamber", repo: "web" },
    } as never);
    const res = response();

    await routeHandlers().get("/api/github/issues/list")!(
      { query: { directory: " /workspace/repo ", page: "2" } },
      res,
    );

    expect(resolveGitHubRepoFromDirectory).toHaveBeenCalledWith("/workspace/repo");
    expect(listForRepo).toHaveBeenCalledWith({
      owner: "openchamber",
      repo: "web",
      state: "open",
      per_page: 50,
      page: 2,
    });
    expect(res.json).toHaveBeenCalledWith({
      connected: true,
      repo: { owner: "openchamber", repo: "web" },
      issues: [
        {
          number: 12,
          title: "Keep me",
          url: "https://github.test/openchamber/web/issues/12",
          state: "open",
          author: { login: "octo", id: 7, avatarUrl: "https://github.test/octo.png" },
          labels: [{ name: "bug", color: "ff0000" }],
        },
      ],
      page: 2,
      hasMore: true,
    });
  });

  it("does not resolve a repository while GitHub is disconnected", async () => {
    vi.mocked(getOctokitOrNull).mockReturnValue(null);
    const res = response();

    await routeHandlers().get("/api/github/issues/comments")!(
      { query: { directory: "/workspace/repo", number: "12" } },
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ connected: false });
    expect(resolveGitHubRepoFromDirectory).not.toHaveBeenCalled();
  });
});
