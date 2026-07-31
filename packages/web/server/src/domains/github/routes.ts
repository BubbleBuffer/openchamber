import type { Express, Request, Response } from "express";
import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import {
  githubError,
  parseGitHubAuthActivateRequest,
  parseGitHubDeviceFlowCompleteRequest,
  parseGitHubPullRequestCreateRequest,
  parseGitHubPullRequestMergeRequest,
  parseGitHubPullRequestReadyRequest,
  parseGitHubPullRequestUpdateRequest,
  GITHUB_ROUTE_CONTRACTS,
  parseGitHubErrorResponse,
} from "../../contracts/github.js";
import { registerGitHubIssueRoutes } from "./issue-routes.js";
import { resolveGitHubPrStatus } from "./pr-status.js";
import {
  summarizeCheckRuns,
  summarizeCommitStatuses,
  type CheckSummary,
} from "./check-summary.js";

export type GitHubRoutesDeps = Record<string, never>;

type GitHubUserSummary = {
  login: string;
  id: number;
  avatarUrl: string;
  name: string | null;
  email: string | null;
};
type PullUpdateResponse = RestEndpointMethodTypes["pulls"]["update"]["response"];
type WorkflowJobs = RestEndpointMethodTypes["actions"]["listJobsForWorkflowRun"]["response"]["data"]["jobs"];
type CheckAnnotations = RestEndpointMethodTypes["checks"]["listAnnotations"]["response"]["data"];
const errorStatus = (error: unknown): number | undefined =>
  typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;

const errorMessage = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
    ? error.message
    : "";

export function registerGitHubRoutes(app: Express, deps?: GitHubRoutesDeps): void {
  void deps;
  type Handler = (req: Request, res: Response) => Promise<unknown>;
  const queryForContract = (key: string, query: Request["query"]): unknown => {
    if (!key.endsWith("/issues/get") && !key.endsWith("/issues/comments") && !key.endsWith("/pulls/context")) return query;
    const raw = query.number;
    if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return query;
    const number = Number(raw);
    return Number.isSafeInteger(number) ? { ...query, number } : query;
  };
  const wrap = (key: string, handler: Handler): Handler => async (req, res) => {
    const contract = GITHUB_ROUTE_CONTRACTS[key];
    const request = key.startsWith("GET ") ? queryForContract(key, req.query) : req.body;
    if (contract && !contract.request(request).ok) {
      return res.status(400).json(githubError("github_invalid_request"));
    }
    const send = res.json.bind(res);
    res.json = ((payload: unknown) => {
      if (res.statusCode >= 400) {
        const error = parseGitHubErrorResponse(payload);
        if (error.ok) return send(error.value);
        console.error("Invalid GitHub route error", { route: key });
        res.status(500);
        return send(githubError("github_internal_error"));
      }
      if (parseGitHubErrorResponse(payload).ok || !contract) return send(payload);
      const parsed = contract.response(payload);
      if (parsed.ok) return send(parsed.value);
      console.error("Invalid GitHub route response", { route: key, error: parsed.error });
      res.status(500);
      return send(githubError("github_internal_error"));
    }) as Response["json"];
    return handler(req, res);
  };
  const get = (path: string, handler: Handler): void => {
    app.get(path, wrap(`GET ${path}`, handler));
  };
  const post = (path: string, handler: Handler): void => {
    app.post(path, wrap(`POST ${path}`, handler));
  };
  const remove = (path: string, handler: Handler): void => {
    app.delete(path, wrap(`DELETE ${path}`, handler));
  };
  const getGitHubLibraries = async () => {
    return await import("./index.js");
  };

  const getGitHubUserSummary = async (octokit: Octokit): Promise<GitHubUserSummary> => {
    const me = await octokit.rest.users.getAuthenticated();

    let email: string | null =
      typeof me.data.email === "string" ? me.data.email : null;
    if (!email) {
      try {
        const emails = await octokit.rest.users.listEmailsForAuthenticatedUser({ per_page: 100 });
        const list = Array.isArray(emails?.data) ? emails.data : [];
        const primaryVerified = list.find(
          (email) => email.primary && email.verified && typeof email.email === "string"
        );
        const anyVerified = list.find(
          (candidate) => candidate.verified && typeof candidate.email === "string",
        );
        email = primaryVerified?.email || anyVerified?.email || null;
      } catch {
        // ignore (scope might be missing)
      }
    }

    return {
      login: me.data.login,
      id: me.data.id,
      avatarUrl: me.data.avatar_url,
      name: typeof me.data.name === "string" ? me.data.name : null,
      email,
    };
  };

  const isGitHubAuthInvalid = (error: unknown) =>
    errorStatus(error) === 401 || errorStatus(error) === 403;
  const isGitHubResourceUnavailable = (error: unknown) =>
    errorStatus(error) === 403 || errorStatus(error) === 404;

  get("/api/github/auth/status", async (_req: Request, res: Response) => {
    try {
      const libs = await getGitHubLibraries();
      const auth = libs.getGitHubAuth();
      const accounts = libs.getGitHubAuthAccounts();
      if (!auth?.accessToken) {
        return res.json({ connected: false, accounts });
      }

      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false, accounts });
      }

      let user: GitHubUserSummary | null = null;
      try {
        user = await getGitHubUserSummary(octokit);
      } catch (error) {
        if (isGitHubAuthInvalid(error)) {
          libs.clearGitHubAuth();
          return res.json({ connected: false, accounts: libs.getGitHubAuthAccounts() });
        }
      }

      const fallback = auth.user;
      const mergedUser = user || fallback;

      return res.json({
        connected: true,
        user: mergedUser,
        scope: auth.scope,
        accounts,
      });
    } catch (error) {
      console.error("Failed to get GitHub auth status:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  post("/api/github/auth/start", async (_req: Request, res: Response) => {
    try {
      const libs = await getGitHubLibraries();
      const clientId = libs.getGitHubClientId();
      if (!clientId) {
        return res.status(400).json(githubError("github_not_configured"));
      }

      const scope = libs.getGitHubScopes();

      const payload = await libs.startDeviceFlow({
        clientId,
        scope,
      });

      return res.json({
        deviceCode: payload.device_code,
        userCode: payload.user_code,
        verificationUri: payload.verification_uri,
        verificationUriComplete: payload.verification_uri_complete,
        expiresIn: payload.expires_in,
        interval: payload.interval,
        scope,
      });
    } catch (error) {
      console.error("Failed to start GitHub device flow:", error);
      return res.status(500).json(githubError("github_device_flow_failed"));
    }
  });

  post("/api/github/auth/complete", async (req: Request, res: Response) => {
    try {
      const libs = await getGitHubLibraries();
      const clientId = libs.getGitHubClientId();
      if (!clientId) {
        return res.status(400).json(githubError("github_not_configured"));
      }

      const parsedRequest = parseGitHubDeviceFlowCompleteRequest(req.body);
      if (!parsedRequest.ok) return res.status(400).json(githubError("github_invalid_request"));
      const deviceCode = parsedRequest.value.deviceCode;

      const payload = await libs.exchangeDeviceCode({ clientId, deviceCode });

      if (payload?.error) {
        return res.json({
          connected: false,
          status: payload.error,
          error: payload.error_description || payload.error,
        });
      }

      const accessToken = payload?.access_token as string | undefined | null;
      if (!accessToken) {
        return res.status(500).json(githubError("github_upstream_error"));
      }

      const { Octokit } = await import("@octokit/rest");
      const octokit = new Octokit({ auth: accessToken });
      const user = await getGitHubUserSummary(octokit);

      libs.setGitHubAuth({
        accessToken,
        scope: typeof payload.scope === "string" ? payload.scope : "",
        tokenType: typeof payload.token_type === "string" ? payload.token_type : "bearer",
        user,
      });

      return res.json({
        connected: true,
        user,
        scope: typeof payload.scope === "string" ? payload.scope : "",
        accounts: libs.getGitHubAuthAccounts(),
      });
    } catch (error) {
      console.error("Failed to complete GitHub device flow:", error);
      return res.status(500).json(githubError("github_device_flow_failed"));
    }
  });

  post("/api/github/auth/activate", async (req: Request, res: Response) => {
    try {
      const libs = await getGitHubLibraries();
      const parsedRequest = parseGitHubAuthActivateRequest(req.body);
      if (!parsedRequest.ok) return res.status(400).json(githubError("github_invalid_request"));
      const accountId = parsedRequest.value.accountId;
      const activated = libs.activateGitHubAuth(accountId);
      if (!activated) {
        return res.status(404).json(githubError("github_not_found"));
      }

      const auth = libs.getGitHubAuth();
      const accounts = libs.getGitHubAuthAccounts();
      if (!auth?.accessToken) {
        return res.json({ connected: false, accounts });
      }

      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false, accounts });
      }

      let user = auth.user || null;
      try {
        user = await getGitHubUserSummary(octokit);
      } catch (error) {
        if (isGitHubAuthInvalid(error)) {
          libs.clearGitHubAuth();
          return res.json({ connected: false, accounts: libs.getGitHubAuthAccounts() });
        }
      }

      return res.json({
        connected: true,
        user,
        scope: auth.scope,
        accounts,
      });
    } catch (error) {
      console.error("Failed to activate GitHub account:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  remove("/api/github/auth", async (_req: Request, res: Response) => {
    try {
      const libs = await getGitHubLibraries();
      const removed = libs.clearGitHubAuth();
      return res.json({ success: true, removed });
    } catch (error) {
      console.error("Failed to disconnect GitHub:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  get("/api/github/me", async (_req: Request, res: Response) => {
    try {
      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.status(401).json(githubError("github_not_connected"));
      }
      let user: GitHubUserSummary;
      try {
        user = await getGitHubUserSummary(octokit);
      } catch (error) {
        if (isGitHubAuthInvalid(error)) {
          libs.clearGitHubAuth();
          return res.status(401).json(githubError("github_unauthorized"));
        }
        throw error;
      }
      return res.json(user);
    } catch (error) {
      console.error("Failed to fetch GitHub user:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  // ================= GitHub PR APIs =================

  get("/api/github/pr/status", async (req: Request, res: Response) => {
    try {
      const directory =
        typeof req.query?.directory === "string" ? req.query.directory.trim() : "";
      const branch = typeof req.query?.branch === "string" ? req.query.branch.trim() : "";
      const remote =
        typeof req.query?.remote === "string" ? req.query.remote.trim() : "origin";
      if (!directory || !branch) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false });
      }

      const resolvedStatus = await resolveGitHubPrStatus({
        octokit,
        directory,
        branch,
        remoteName: remote,
      });
      const searchRepo = resolvedStatus.repo;
      const first = resolvedStatus.pr;
      if (!searchRepo) {
        return res.json({
          connected: true,
          repo: null,
          branch,
          pr: null,
          checks: null,
          canMerge: false,
          defaultBranch: null,
          resolvedRemoteName: null,
        });
      }
      if (!first) {
        return res.json({
          connected: true,
          repo: searchRepo,
          branch,
          pr: null,
          checks: null,
          canMerge: false,
          defaultBranch: resolvedStatus.defaultBranch ?? null,
          resolvedRemoteName: resolvedStatus.resolvedRemoteName ?? null,
        });
      }

      // Enrich with mergeability fields
      const prFull = await octokit.rest.pulls.get({
        owner: searchRepo.owner,
        repo: searchRepo.repo,
        pull_number: first.number,
      });
      const prData = prFull?.data;
      if (!prData) {
        return res.json({
          connected: true,
          repo: searchRepo,
          branch,
          pr: null,
          checks: null,
          canMerge: false,
        });
      }

      // Checks summary: prefer check-runs (Actions), fallback to classic statuses.
      let checks: CheckSummary | null = null;
      const sha = prData.head?.sha;
      if (sha) {
        try {
          const runs = await octokit.rest.checks.listForRef({
            owner: searchRepo.owner,
            repo: searchRepo.repo,
            ref: sha,
            per_page: 100,
          });
          const checkRuns = Array.isArray(runs?.data?.check_runs) ? runs.data.check_runs : [];
          if (checkRuns.length > 0) {
            checks = summarizeCheckRuns(checkRuns);
          }
        } catch {
          // ignore and fall back
        }

        if (!checks) {
          try {
            const combined = await octokit.rest.repos.getCombinedStatusForRef({
              owner: searchRepo.owner,
              repo: searchRepo.repo,
              ref: sha,
            });
            const statuses = Array.isArray(combined?.data?.statuses) ? combined.data.statuses : [];
            checks = summarizeCommitStatuses(statuses);
          } catch {
            checks = null;
          }
        }
      }

      // Permission check (best-effort)
      let canMerge = false;
      try {
        const auth = libs.getGitHubAuth();
        const username = auth?.user?.login;
        if (username) {
          const perm = await octokit.rest.repos.getCollaboratorPermissionLevel({
            owner: searchRepo.owner,
            repo: searchRepo.repo,
            username,
          });
          const level = perm?.data?.permission;
          canMerge = level === "admin" || level === "maintain" || level === "write";
        }
      } catch {
        canMerge = false;
      }

      const isMerged = Boolean(prData.merged || prData.merged_at);
      const mergedState = isMerged ? "merged" : prData.state === "closed" ? "closed" : "open";

      return res.json({
        connected: true,
        repo: searchRepo,
        branch,
        pr: {
          number: prData.number,
          title: prData.title,
          body: prData.body || "",
          url: prData.html_url,
          state: mergedState,
          draft: Boolean(prData.draft),
          base: prData.base?.ref,
          head: prData.head?.ref,
          headSha: prData.head?.sha,
          mergeable: prData.mergeable,
          mergeableState: prData.mergeable_state,
        },
        checks,
        canMerge,
        defaultBranch: resolvedStatus.defaultBranch ?? null,
        resolvedRemoteName: resolvedStatus.resolvedRemoteName ?? null,
      });
    } catch (error: unknown) {
      if (errorStatus(error) === 401) {
        const libs = await getGitHubLibraries();
        libs.clearGitHubAuth();
        return res.json({ connected: false });
      }
      if (isGitHubResourceUnavailable(error)) {
        return res.json({
          connected: true,
          repo: null,
          branch: typeof req.query?.branch === "string" ? req.query.branch.trim() : "",
          pr: null,
          checks: null,
          canMerge: false,
          defaultBranch: null,
          resolvedRemoteName: null,
        });
      }
      console.error("Failed to load GitHub PR status:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  post("/api/github/pr/create", async (req: Request, res: Response) => {
    try {
      if (!parseGitHubPullRequestCreateRequest(req.body).ok) return res.status(400).json(githubError("github_invalid_request"));
      const directory =
        typeof req.body?.directory === "string" ? req.body.directory.trim() : "";
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const head = typeof req.body?.head === "string" ? req.body.head.trim() : "";
      const requestedBase =
        typeof req.body?.base === "string" ? req.body.base.trim() : "";
      const body = typeof req.body?.body === "string" ? req.body.body : undefined;
      const draft = typeof req.body?.draft === "boolean" ? req.body.draft : undefined;
      // remote = target repo (where PR is created, e.g., 'upstream' for forks)
      const remote =
        typeof req.body?.remote === "string" ? req.body.remote.trim() : "origin";
      // headRemote = source repo (where head branch lives, e.g., 'origin' for forks)
      const headRemote =
        typeof req.body?.headRemote === "string" ? req.body.headRemote.trim() : "";
      if (!directory || !title || !head || !requestedBase) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) return res.status(401).json(githubError("github_not_connected"));

      const ghLib: typeof import("./index.js") = await import("./index.js");
      const { repo } = await ghLib.resolveGitHubRepoFromDirectory(directory, remote);
      if (!repo) {
        return res.status(400).json(githubError("github_repo_unavailable"));
      }

      const normalizeBranchRef = (value: string, remoteNames = new Set<string>()) => {
        if (!value) {
          return value;
        }
        let normalized = value.trim();
        if (normalized.startsWith("refs/heads/")) {
          normalized = normalized.substring("refs/heads/".length);
        }
        if (normalized.startsWith("heads/")) {
          normalized = normalized.substring("heads/".length);
        }
        if (normalized.startsWith("remotes/")) {
          normalized = normalized.substring("remotes/".length);
        }

        const slashIndex = normalized.indexOf("/");
        if (slashIndex > 0) {
          const maybeRemote = normalized.slice(0, slashIndex);
          if (remoteNames.has(maybeRemote)) {
            const withoutRemotePrefix = normalized.slice(slashIndex + 1).trim();
            if (withoutRemotePrefix) {
              normalized = withoutRemotePrefix;
            }
          }
        }

        return normalized;
      };

      // Determine the source remote for the head branch
      // Priority: 1) explicit headRemote, 2) tracking branch remote, 3) 'origin' if targeting non-origin
      let sourceRemote = headRemote;
      const gitLib: typeof import("../git/index.js") = await import("../git/index.js");
      const { getStatus, getRemotes } = gitLib;

      // If no explicit headRemote, check the branch's tracking info
      if (!sourceRemote) {
        const status = await getStatus(directory).catch(() => null);
        if (status?.tracking) {
          // tracking is like "gsxdsm/fix/multi-remote-branch-creation" or "origin/main"
          const trackingRemote = status.tracking.split("/")[0];
          if (trackingRemote) {
            sourceRemote = trackingRemote;
          }
        }
      }

      // Fallback: if targeting non-origin and no tracking info, try 'origin'
      if (!sourceRemote && remote !== "origin") {
        sourceRemote = "origin";
      }

      const remoteNames = new Set([remote]);
      const remotes = await getRemotes(directory).catch(() => []);
      for (const item of remotes) {
        if (item?.name) {
          remoteNames.add(item.name);
        }
      }
      if (sourceRemote) {
        remoteNames.add(sourceRemote);
      }

      const base = normalizeBranchRef(requestedBase, remoteNames);
      if (!base) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      // For fork workflows: we need to determine the correct head reference
      let headRef = head;

      if (sourceRemote && sourceRemote !== remote) {
        // The branch is on a different remote than the target - this is a cross-repo PR
        const headResolved = await ghLib.resolveGitHubRepoFromDirectory(directory, sourceRemote);
        const headRepo = headResolved?.repo;
        if (headRepo) {
          // Always use owner:branch format for cross-repo PRs
          // GitHub API requires this when head is from a different repo/fork
          if (headRepo.owner !== repo.owner || headRepo.repo !== repo.repo) {
            headRef = `${headRepo.owner}:${head}`;
          }
        }
      }

      // For cross-repo PRs, verify the branch exists on the head repo first
      if (headRef.includes(":")) {
        const [headOwner] = headRef.split(":");
        const headRepoName = sourceRemote
          ? (await ghLib.resolveGitHubRepoFromDirectory(directory, sourceRemote))?.repo?.repo
          : repo.repo;

        if (headRepoName) {
          try {
            await octokit.rest.repos.getBranch({
              owner: headOwner,
              repo: headRepoName,
              branch: head,
            });
          } catch (branchError: unknown) {
            if (errorStatus(branchError) === 404) {
              return res.status(400).json(githubError("github_invalid_request"));
            }
            // For other errors, continue - let the PR create attempt handle it
          }
        }
      }

      const created = await octokit.rest.pulls.create({
        owner: repo.owner,
        repo: repo.repo,
        title,
        head: headRef,
        base,
        ...(typeof body === "string" ? { body } : {}),
        ...(typeof draft === "boolean" ? { draft } : {}),
      });

      const pr = created?.data;
      if (!pr) {
        return res.status(500).json(githubError("github_upstream_error"));
      }

      return res.json({
        number: pr.number,
        title: pr.title,
        body: pr.body || "",
        url: pr.html_url,
        state: pr.state === "closed" ? "closed" : "open",
        draft: Boolean(pr.draft),
        base: pr.base?.ref,
        head: pr.head?.ref,
        headSha: pr.head?.sha,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
      });
    } catch (error: unknown) {
      console.error("Failed to create GitHub PR:", error);

      // Check for head validation error (common with fork PRs)
      const message = errorMessage(error);
      const isHeadValidationError =
        message.includes("Validation Failed") &&
        message.includes('"field":"head"') &&
        message.includes('"code":"invalid"');

      if (isHeadValidationError) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      return res.status(500).json(githubError("github_upstream_error"));
    }
  });

  post("/api/github/pr/update", async (req: Request, res: Response) => {
    try {
      if (!parseGitHubPullRequestUpdateRequest(req.body).ok) return res.status(400).json(githubError("github_invalid_request"));
      const directory =
        typeof req.body?.directory === "string" ? req.body.directory.trim() : "";
      const number = typeof req.body?.number === "number" ? req.body.number : null;
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const body = typeof req.body?.body === "string" ? req.body.body : undefined;
      if (!directory || !number || !title) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) return res.status(401).json(githubError("github_not_connected"));

      const ghLib: typeof import("./index.js") = await import("./index.js");
      const { repo } = await ghLib.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.status(400).json(githubError("github_repo_unavailable"));
      }

      let updated: PullUpdateResponse;
      try {
        updated = await octokit.rest.pulls.update({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          title,
          ...(typeof body === "string" ? { body } : {}),
        });
      } catch (error: unknown) {
        if (errorStatus(error) === 401) {
          return res.status(401).json(githubError("github_unauthorized"));
        }
        if (errorStatus(error) === 403) {
          return res.status(403).json(githubError("github_forbidden"));
        }
        if (errorStatus(error) === 404) {
          return res.status(404).json(githubError("github_not_found"));
        }
        if (errorStatus(error) === 422) {
          return res.status(422).json(githubError("github_invalid_request"));
        }
        throw error;
      }

      const pr = updated?.data;
      if (!pr) {
        return res.status(500).json(githubError("github_upstream_error"));
      }

      return res.json({
        number: pr.number,
        title: pr.title,
        body: pr.body || "",
        url: pr.html_url,
        state: pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open",
        draft: Boolean(pr.draft),
        base: pr.base?.ref,
        head: pr.head?.ref,
        headSha: pr.head?.sha,
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
      });
    } catch (error) {
      console.error("Failed to update GitHub PR:", error);
      return res.status(500).json(githubError("github_upstream_error"));
    }
  });

  post("/api/github/pr/merge", async (req: Request, res: Response) => {
    try {
      if (!parseGitHubPullRequestMergeRequest(req.body).ok) return res.status(400).json(githubError("github_invalid_request"));
      const directory =
        typeof req.body?.directory === "string" ? req.body.directory.trim() : "";
      const number = typeof req.body?.number === "number" ? req.body.number : null;
      const method =
        typeof req.body?.method === "string" ? req.body.method : "merge";
      if (!directory || !number) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.status(401).json(githubError("github_not_connected"));
      }

      const ghLib: typeof import("./index.js") = await import("./index.js");
      const { repo } = await ghLib.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.status(400).json(githubError("github_repo_unavailable"));
      }

      try {
        const result = await octokit.rest.pulls.merge({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          merge_method: method as "merge" | "squash" | "rebase",
        });
        return res.json({ merged: Boolean(result?.data?.merged), message: result?.data?.message });
      } catch (error: unknown) {
        if (errorStatus(error) === 403) {
          return res.status(403).json(githubError("github_forbidden"));
        }
        if (errorStatus(error) === 405 || errorStatus(error) === 409) {
          return res.json({ merged: false, message: "PR not mergeable" });
        }
        throw error;
      }
    } catch (error) {
      console.error("Failed to merge GitHub PR:", error);
      return res.status(500).json(githubError("github_upstream_error"));
    }
  });

  post("/api/github/pr/ready", async (req: Request, res: Response) => {
    try {
      if (!parseGitHubPullRequestReadyRequest(req.body).ok) return res.status(400).json(githubError("github_invalid_request"));
      const directory =
        typeof req.body?.directory === "string" ? req.body.directory.trim() : "";
      const number = typeof req.body?.number === "number" ? req.body.number : null;
      if (!directory || !number) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.status(401).json(githubError("github_not_connected"));
      }

      const ghLib: typeof import("./index.js") = await import("./index.js");
      const { repo } = await ghLib.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.status(400).json(githubError("github_repo_unavailable"));
      }

      const pr = await octokit.rest.pulls.get({ owner: repo.owner, repo: repo.repo, pull_number: number });
      const nodeId = pr?.data?.node_id;
      if (!nodeId) {
        return res.status(500).json(githubError("github_upstream_error"));
      }

      if (pr?.data?.draft === false) {
        return res.json({ ready: true });
      }

      try {
        await octokit.graphql(
          `mutation($pullRequestId: ID!) {\n  markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {\n    pullRequest {\n      id\n      isDraft\n    }\n  }\n}`,
          { pullRequestId: nodeId }
        );
      } catch (error: unknown) {
        if (errorStatus(error) === 403) {
          return res.status(403).json(githubError("github_forbidden"));
        }
        throw error;
      }

      return res.json({ ready: true });
    } catch (error) {
      console.error("Failed to mark PR ready:", error);
      return res.status(500).json(githubError("github_upstream_error"));
    }
  });

  registerGitHubIssueRoutes(get);

  // ================= GitHub Pull Request Context APIs =================

  get("/api/github/pulls/list", async (req: Request, res: Response) => {
    try {
      const directory =
        typeof req.query?.directory === "string" ? req.query.directory.trim() : "";
      const page =
        typeof req.query?.page === "string" ? Number(req.query.page) : 1;
      if (!directory) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false });
      }

      const ghLib: typeof import("./index.js") = await import("./index.js");
      const { repo } = await ghLib.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.json({ connected: true, repo: null, prs: [] });
      }

      const list = await octokit.rest.pulls.list({
        owner: repo.owner,
        repo: repo.repo,
        state: "open",
        per_page: 50,
        page: Number.isFinite(page) && page > 0 ? page : 1,
      });

      const link = typeof list?.headers?.link === "string" ? list.headers.link : "";
      const hasMore = /rel="next"/.test(link);

      const prs = (Array.isArray(list?.data) ? list.data : []).map((pr) => {
        const mergedState = pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open";
        const headRepo = pr.head?.repo
          ? {
              owner: pr.head.repo.owner?.login,
              repo: pr.head.repo.name,
              url: pr.head.repo.html_url,
              cloneUrl: pr.head.repo.clone_url,
              sshUrl: pr.head.repo.ssh_url,
            }
          : null;
        return {
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          state: mergedState,
          draft: Boolean(pr.draft),
          base: pr.base?.ref,
          head: pr.head?.ref,
          headSha: pr.head?.sha,
          mergeable: undefined,
          mergeableState: undefined,
          author: pr.user
            ? { login: pr.user.login, id: pr.user.id, avatarUrl: pr.user.avatar_url }
            : null,
          headLabel: pr.head?.label,
          headRepo:
            headRepo && headRepo.owner && headRepo.repo && headRepo.url ? headRepo : null,
        };
      });

      return res.json({
        connected: true,
        repo,
        prs,
        page: Number.isFinite(page) && page > 0 ? page : 1,
        hasMore,
      });
    } catch (error: unknown) {
      if (errorStatus(error) === 401) {
        const libs = await getGitHubLibraries();
        libs.clearGitHubAuth();
        return res.json({ connected: false });
      }
      console.error("Failed to list GitHub PRs:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });

  get("/api/github/pulls/context", async (req: Request, res: Response) => {
    try {
      const directory =
        typeof req.query?.directory === "string" ? req.query.directory.trim() : "";
      const number =
        typeof req.query?.number === "string" ? Number(req.query.number) : null;
      const includeDiff = req.query?.diff === "1" || req.query?.diff === "true";
      const includeCheckDetails = req.query?.checkDetails === "1" || req.query?.checkDetails === "true";
      if (!directory || !number) {
        return res.status(400).json(githubError("github_invalid_request"));
      }

      const libs = await getGitHubLibraries();
      const octokit = libs.getOctokitOrNull();
      if (!octokit) {
        return res.json({ connected: false });
      }

      const ghLib: typeof import("./index.js") = await import("./index.js");
      const { repo } = await ghLib.resolveGitHubRepoFromDirectory(directory);
      if (!repo) {
        return res.json({ connected: true, repo: null, pr: null });
      }

      const prResp = await octokit.rest.pulls.get({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: number,
      });
      const prData = prResp?.data;
      if (!prData) {
        return res.status(404).json(githubError("github_not_found"));
      }

      const headRepo = prData.head?.repo
        ? {
            owner: prData.head.repo.owner?.login,
            repo: prData.head.repo.name,
            url: prData.head.repo.html_url,
            cloneUrl: prData.head.repo.clone_url,
            sshUrl: prData.head.repo.ssh_url,
          }
        : null;

      const mergedState = prData.merged ? "merged" : prData.state === "closed" ? "closed" : "open";
      const pr = {
        number: prData.number,
        title: prData.title,
        url: prData.html_url,
        state: mergedState,
        draft: Boolean(prData.draft),
        base: prData.base?.ref,
        head: prData.head?.ref,
        headSha: prData.head?.sha,
        mergeable: prData.mergeable,
        mergeableState: prData.mergeable_state,
        author: prData.user
          ? { login: prData.user.login, id: prData.user.id, avatarUrl: prData.user.avatar_url }
          : null,
        headLabel: prData.head?.label,
        headRepo: headRepo && headRepo.owner && headRepo.repo && headRepo.url ? headRepo : null,
        body: prData.body || "",
        createdAt: prData.created_at,
        updatedAt: prData.updated_at,
      };

      const issueCommentsResp = await octokit.rest.issues.listComments({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: number,
        per_page: 100,
      });
      const issueComments = (
        Array.isArray(issueCommentsResp?.data) ? issueCommentsResp.data : []
      ).map((comment) => ({
        id: comment.id,
        url: comment.html_url,
        body: comment.body || "",
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        author: comment.user
          ? { login: comment.user.login, id: comment.user.id, avatarUrl: comment.user.avatar_url }
          : null,
      }));

      const reviewCommentsResp = await octokit.rest.pulls.listReviewComments({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: number,
        per_page: 100,
      });
      const reviewComments = (
        Array.isArray(reviewCommentsResp?.data) ? reviewCommentsResp.data : []
      ).map((comment) => ({
        id: comment.id,
        url: comment.html_url,
        body: comment.body || "",
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        path: comment.path,
        line: typeof comment.line === "number" ? comment.line : null,
        position: typeof comment.position === "number" ? comment.position : null,
        author: comment.user
          ? { login: comment.user.login, id: comment.user.id, avatarUrl: comment.user.avatar_url }
          : null,
      }));

      const filesResp = await octokit.rest.pulls.listFiles({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: number,
        per_page: 100,
      });
      const files = (Array.isArray(filesResp?.data) ? filesResp.data : []).map((f) => ({
        filename: f.filename || "",
        status: f.status || "",
        additions: f.additions || 0,
        deletions: f.deletions || 0,
        changes: f.changes || 0,
        patch: f.patch,
      }));

      // checks summary (same logic as status endpoint)
      let checks: CheckSummary | null = null;
      let checkRunsOut: unknown[] | undefined;
      const sha = prData.head?.sha;
      if (sha) {
        try {
          const runs = await octokit.rest.checks.listForRef({
            owner: repo.owner,
            repo: repo.repo,
            ref: sha,
            per_page: 100,
          });
          const checkRuns = Array.isArray(runs?.data?.check_runs) ? runs.data.check_runs : [];
          if (checkRuns.length > 0) {
            const parsedJobs = new Map<number, WorkflowJobs>();
            const parsedAnnotations = new Map<number, CheckAnnotations>();
            if (includeCheckDetails) {
              // Prefetch actions jobs per runId.
              const runIds = new Set<number>();
              const jobIds = new Map<string, { runId: number; jobId: number | null }>();
              for (const run of checkRuns) {
                const details =
                  typeof run.details_url === "string" ? run.details_url : "";
                const match = details.match(/\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/);
                if (match) {
                  const runId = Number(match[1]);
                  const jobId = match[2] ? Number(match[2]) : null;
                  if (Number.isFinite(runId) && runId > 0) {
                    runIds.add(runId);
                    if (jobId && Number.isFinite(jobId) && jobId > 0) {
                      jobIds.set(details, { runId, jobId });
                    } else {
                      jobIds.set(details, { runId, jobId: null });
                    }
                  }
                }
              }

              for (const runId of runIds) {
                try {
                  const jobsResp = await octokit.rest.actions.listJobsForWorkflowRun({
                    owner: repo.owner,
                    repo: repo.repo,
                    run_id: runId,
                    per_page: 100,
                  });
                  const jobs = Array.isArray(jobsResp?.data?.jobs) ? jobsResp.data.jobs : [];
                  parsedJobs.set(runId, jobs);
                } catch {
                  parsedJobs.set(runId, []);
                }
              }

              for (const run of checkRuns) {
                const runConclusion =
                  typeof run?.conclusion === "string" ? run.conclusion.toLowerCase() : "";
                const shouldLoadAnnotations = Boolean(
                  run?.id && runConclusion && !["success", "neutral", "skipped"].includes(runConclusion)
                );
                if (!shouldLoadAnnotations) {
                  continue;
                }

                const checkRunId = Number(run.id);
                if (!Number.isFinite(checkRunId) || checkRunId <= 0) {
                  continue;
                }

                const annotations: CheckAnnotations = [];
                for (let page = 1; page <= 3; page += 1) {
                  try {
                    const annotationsResp = await octokit.rest.checks.listAnnotations({
                      owner: repo.owner,
                      repo: repo.repo,
                      check_run_id: checkRunId,
                      per_page: 50,
                      page,
                    });
                    const chunk = Array.isArray(annotationsResp?.data) ? annotationsResp.data : [];
                    annotations.push(...chunk);
                    if (chunk.length < 50) {
                      break;
                    }
                  } catch {
                    break;
                  }
                }

                if (annotations.length > 0) {
                  parsedAnnotations.set(checkRunId, annotations);
                }
              }
            }

            checkRunsOut = checkRuns.map((run) => {
              const detailsUrl =
                typeof run.details_url === "string" ? run.details_url : undefined;
              let job: {
                runId: number;
                jobId?: number;
                url?: string | null;
                name?: string;
                conclusion?: string | null;
                steps?: Array<{
                  name: string;
                  status: string;
                  conclusion: string | null;
                  number: number;
                  startedAt?: string;
                  completedAt?: string;
                }>;
              } | undefined;
              if (includeCheckDetails && detailsUrl) {
                const match = detailsUrl.match(/\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/);
                const runId = match ? Number(match[1]) : null;
                const jobId = match && match[2] ? Number(match[2]) : null;
                if (runId && Number.isFinite(runId)) {
                  const jobs = parsedJobs.get(runId) || [];
                  const matched = jobId ? jobs.find((candidate) => candidate.id === jobId) : null;
                  const picked = matched || jobs.find((candidate) => candidate.name === run.name) || null;
                  if (picked) {
                    job = {
                      runId,
                      jobId: picked.id,
                      url: picked.html_url,
                      name: picked.name,
                      conclusion: picked.conclusion,
                      steps: Array.isArray(picked.steps)
                        ? picked.steps.map((step) => ({
                            name: step.name,
                            status: step.status,
                            conclusion: step.conclusion,
                            number: step.number,
                            startedAt: step.started_at || undefined,
                            completedAt: step.completed_at || undefined,
                          }))
                        : undefined,
                    };
                  } else {
                    job = { runId, ...(jobId ? { jobId } : {}), url: detailsUrl };
                  }
                }
              }

              return {
                id: run.id,
                name: run.name,
                app: run.app
                  ? {
                      name: run.app.name || undefined,
                      slug: run.app.slug || undefined,
                    }
                  : undefined,
                status: run.status,
                conclusion: run.conclusion,
                detailsUrl,
                output: run.output
                  ? {
                      title: run.output.title || undefined,
                      summary: run.output.summary || undefined,
                      text: run.output.text || undefined,
                    }
                  : undefined,
                ...(job ? { job } : {}),
                ...(run.id && parsedAnnotations.has(run.id)
                  ? {
                      annotations: parsedAnnotations
                        .get(run.id)!
                        .map((annotation) => ({
                          path: annotation.path || undefined,
                          startLine: typeof annotation.start_line === "number" ? annotation.start_line : undefined,
                          endLine: typeof annotation.end_line === "number" ? annotation.end_line : undefined,
                          level: annotation.annotation_level || undefined,
                          message: annotation.message || "",
                          title: annotation.title || undefined,
                          rawDetails: annotation.raw_details || undefined,
                        }))
                        .filter((annotation) => annotation.message),
                    }
                  : {}),
              };
            });
            checks = summarizeCheckRuns(checkRuns);
          }
        } catch {
          // ignore and fall back
        }
        if (!checks) {
          try {
            const combined = await octokit.rest.repos.getCombinedStatusForRef({
              owner: repo.owner,
              repo: repo.repo,
              ref: sha,
            });
            const statuses = Array.isArray(combined?.data?.statuses) ? combined.data.statuses : [];
            checks = summarizeCommitStatuses(statuses);
          } catch {
            checks = null;
          }
        }
      }

      let diff: string | undefined;
      if (includeDiff) {
        const diffResp = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
          owner: repo.owner,
          repo: repo.repo,
          pull_number: number,
          headers: { accept: "application/vnd.github.v3.diff" },
        });
        diff = typeof diffResp?.data === "string" ? diffResp.data : undefined;
      }

      return res.json({
        connected: true,
        repo,
        pr,
        issueComments,
        reviewComments,
        files,
        ...(diff ? { diff } : {}),
        checks,
        ...(Array.isArray(checkRunsOut) ? { checkRuns: checkRunsOut } : {}),
      });
    } catch (error: unknown) {
      if (errorStatus(error) === 401) {
        const libs = await getGitHubLibraries();
        libs.clearGitHubAuth();
        return res.json({ connected: false });
      }
      console.error("Failed to load GitHub PR context:", error);
      return res.status(500).json(githubError("github_internal_error"));
    }
  });
}
