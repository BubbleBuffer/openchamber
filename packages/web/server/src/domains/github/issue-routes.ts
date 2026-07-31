/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Request, Response } from "express";
import { githubError } from "../../contracts/github.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;
type GetRoute = (path: string, handler: Handler) => void;

const getGitHubLibraries = async () => await import("./index.js");

const directoryFrom = (req: Request): string =>
  typeof req.query?.directory === "string" ? req.query.directory.trim() : "";

const pageFrom = (req: Request): number => {
  const candidate = typeof req.query?.page === "string" ? Number(req.query.page) : 1;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
};

const numberFrom = (req: Request): number | null =>
  typeof req.query?.number === "string" ? Number(req.query.number) : null;

const userSummary = (user: any) =>
  user ? { login: user.login, id: user.id, avatarUrl: user.avatar_url } : null;

const labelsFrom = (labels: any) => {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label: any) => {
      if (typeof label === "string") return null;
      const name = typeof label?.name === "string" ? label.name : "";
      if (!name) return null;
      return { name, color: typeof label?.color === "string" ? label.color : undefined };
    })
    .filter(Boolean);
};

const issueSummary = (item: any) => ({
  number: item.number,
  title: item.title,
  url: item.html_url,
  state: item.state === "closed" ? "closed" : "open",
  author: userSummary(item.user),
  labels: labelsFrom(item.labels),
});

const issueDetail = (issue: any) => ({
  ...issueSummary(issue),
  body: issue.body || "",
  createdAt: issue.created_at,
  updatedAt: issue.updated_at,
  assignees: Array.isArray(issue.assignees)
    ? issue.assignees.map(userSummary).filter(Boolean)
    : [],
});

const issueComment = (comment: any) => ({
  id: comment.id,
  url: comment.html_url,
  body: comment.body || "",
  createdAt: comment.created_at,
  updatedAt: comment.updated_at,
  author: userSummary(comment.user),
});

export function registerGitHubIssueRoutes(get: GetRoute): void {
  get("/api/github/issues/list", async (req: Request, res: Response) => {
    try {
      const directory = directoryFrom(req);
      const page = pageFrom(req);
      if (!directory) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false });
      }

      const { repo } = await libs.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.json({ connected: true, repo: null, issues: [] });
      }

      const list = await octokit.rest.issues.listForRepo({
        owner: repo.owner,
        repo: repo.repo,
        state: "open",
        per_page: 50,
        page,
      });
      const link = typeof list?.headers?.link === "string" ? list.headers.link : "";
      const hasMore = /rel="next"/.test(link);
      const issues = (Array.isArray(list?.data) ? list.data : [])
        .filter((item: any) => !item?.pull_request)
        .map(issueSummary);

      return res.json({
        connected: true,
        repo,
        issues,
        page,
        hasMore,
      });
    } catch (error) {
      console.error("Failed to list GitHub issues:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  get("/api/github/issues/get", async (req: Request, res: Response) => {
    try {
      const directory = directoryFrom(req);
      const number = numberFrom(req);
      if (!directory || !number) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false });
      }

      const { repo } = await libs.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.json({ connected: true, repo: null, issue: null });
      }

      const result = await octokit.rest.issues.get({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: number,
      });
      const issue = result?.data;
      if (!issue || issue.pull_request) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      return res.json({
        connected: true,
        repo,
        issue: issueDetail(issue),
      });
    } catch (error) {
      console.error("Failed to fetch GitHub issue:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  get("/api/github/issues/comments", async (req: Request, res: Response) => {
    try {
      const directory = directoryFrom(req);
      const number = numberFrom(req);
      if (!directory || !number) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false });
      }

      const { repo } = await libs.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.json({ connected: true, repo: null, comments: [] });
      }

      const result = await octokit.rest.issues.listComments({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: number,
        per_page: 100,
      });
      const comments = (Array.isArray(result?.data) ? result.data : []).map(issueComment);

      return res.json({ connected: true, repo, comments });
    } catch (error) {
      console.error("Failed to fetch GitHub issue comments:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });
}
