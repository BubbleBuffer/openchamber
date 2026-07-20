/* eslint-disable @typescript-eslint/no-explicit-any, complexity */
import type { Express, Request, Response } from "express";
import {
  GIT_ROUTE_CONTRACTS,
  gitError,
  parseGitDirectoryQuery,
  type GitErrorCode,
} from "../../contracts/git.js";

type RouteKey = keyof typeof GIT_ROUTE_CONTRACTS;

export function registerGitRoutes(app: Express): void {
  let gitLibraries: typeof import("./index.js") | null = null;
  const getGitLibraries = async (): Promise<typeof import("./index.js")> => gitLibraries ??= await import("./index.js");
  const invalid = (res: Response) => res.status(400).json(gitError("git_invalid_request"));
  const errorText = (error: unknown) => error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const failure = (res: Response, error: unknown, label: string) => {
    console.error(label, error);
    const text = errorText(error);
    const [status, code]: [number, GitErrorCode] = /not a git repository/i.test(text) ? [404, "git_not_repository"]
      : /not found|does not exist|unknown (branch|revision|remote|profile)/i.test(text) ? [404, "git_not_found"]
      : /conflict|already exists|not possible because you have unmerged/i.test(text) ? [409, "git_conflict"]
      : /authentication|unauthorized|credentials/i.test(text) ? [401, "git_unauthorized"]
      : /permission denied|forbidden/i.test(text) ? [403, "git_forbidden"]
      : /unavailable|timed? out|network/i.test(text) ? [503, "git_unavailable"]
      : [500, "git_internal_error"];
    return res.status(status).json(gitError(code));
  };
  const request = <T>(key: RouteKey, value: unknown, res: Response): T | null => {
    const parsed = GIT_ROUTE_CONTRACTS[key].request(value);
    return parsed.ok ? parsed.value as T : (invalid(res), null);
  };
  const directory = (req: Request, res: Response): string | null => {
    const parsed = parseGitDirectoryQuery(req.query);
    return parsed.ok ? parsed.value.directory : (invalid(res), null);
  };
  const respond = (key: RouteKey, res: Response, value: unknown) => {
    const parsed = GIT_ROUTE_CONTRACTS[key].response(value);
    return parsed.ok ? res.json(parsed.value) : failure(res, new Error("Malformed git service response"), `Invalid git response for ${key}:`);
  };
  const operation = (key: RouteKey, fn: (req: Request, directory: string, body: any, git: any) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const dir = directory(req, res); if (!dir) return;
      const body = request<any>(key, req.body, res); if (!body) return;
      return respond(key, res, await fn(req, dir, body, await getGitLibraries()));
    } catch (error) { return failure(res, error, `Git route ${key} failed:`); }
  };
  const emptyOperation = (key: RouteKey, fn: (req: Request, directory: string, git: any) => Promise<unknown>) => operation(key, (req, dir, _body, git) => fn(req, dir, git));

  app.get("/api/git/identities", async (_req, res) => {
    try { if (!request("GET /api/git/identities", undefined, res)) return; return respond("GET /api/git/identities", res, (await getGitLibraries()).getProfiles()); }
    catch (error) { return failure(res, error, "Failed to list git identity profiles:"); }
  });
  app.post("/api/git/identities", async (req, res) => {
    try { const body = request<any>("POST /api/git/identities", req.body, res); if (!body) return; return respond("POST /api/git/identities", res, (await getGitLibraries()).createProfile(body)); }
    catch (error) { return failure(res, error, "Failed to create git identity profile:"); }
  });
  app.put("/api/git/identities/:id", async (req, res) => {
    try { const body = request<any>("PUT /api/git/identities/:id", req.body, res); const id = request<any>("POST /api/git/set-identity", { profileId: req.params.id }, res); if (!body || !id) return; return respond("PUT /api/git/identities/:id", res, (await getGitLibraries()).updateProfile(id.profileId, body)); }
    catch (error) { return failure(res, error, "Failed to update git identity profile:"); }
  });
  app.delete("/api/git/identities/:id", async (req, res) => {
    try { if (!request("DELETE /api/git/identities/:id", undefined, res) || !request("POST /api/git/set-identity", { profileId: req.params.id }, res)) return; (await getGitLibraries()).deleteProfile(req.params.id); return respond("DELETE /api/git/identities/:id", res, { success: true }); }
    catch (error) { return failure(res, error, "Failed to delete git identity profile:"); }
  });
  app.get("/api/git/global-identity", async (_req, res) => { try { if (!request("GET /api/git/global-identity", undefined, res)) return; return respond("GET /api/git/global-identity", res, await (await getGitLibraries()).getGlobalIdentity()); } catch (error) { return failure(res, error, "Failed to get global git identity:"); } });
  app.get("/api/git/discover-credentials", async (_req, res) => { try { if (!request("GET /api/git/discover-credentials", undefined, res)) return; return respond("GET /api/git/discover-credentials", res, (await getGitLibraries()).discoverGitCredentials()); } catch (error) { return failure(res, error, "Failed to discover git credentials:"); } });
  app.get("/api/git/check", async (req, res) => { try { const query = request<any>("GET /api/git/check", req.query, res); if (!query) return; return respond("GET /api/git/check", res, { isGitRepository: await (await getGitLibraries()).isGitRepository(query.directory) }); } catch (error) { return failure(res, error, "Failed to check git repository:"); } });
  app.post("/api/git/check-batch", async (req, res) => { try { const body = request<any>("POST /api/git/check-batch", req.body, res); if (!body) return; const git = await getGitLibraries(); const results: Record<string, boolean> = {}; await Promise.all(body.directories.map(async (value: string) => { try { results[value] = await git.isGitRepository(value); } catch { results[value] = false; } })); return respond("POST /api/git/check-batch", res, { results }); } catch (error) { return failure(res, error, "Failed to batch-check git repositories:"); } });
  app.get("/api/git/remote-url", async (req, res) => { try { const query = request<any>("GET /api/git/remote-url", req.query, res); if (!query) return; return respond("GET /api/git/remote-url", res, { url: await (await getGitLibraries()).getRemoteUrl(query.directory, query.remote ?? "origin") }); } catch (error) { return failure(res, error, "Failed to get remote url:"); } });
  app.get("/api/git/current-identity", async (req, res) => { try { const query = request<any>("GET /api/git/current-identity", req.query, res); if (!query) return; return respond("GET /api/git/current-identity", res, await (await getGitLibraries()).getCurrentIdentity(query.directory)); } catch (error) { return failure(res, error, "Failed to get current git identity:"); } });
  app.get("/api/git/has-local-identity", async (req, res) => { try { const query = request<any>("GET /api/git/has-local-identity", req.query, res); if (!query) return; return respond("GET /api/git/has-local-identity", res, { hasLocalIdentity: await (await getGitLibraries()).hasLocalIdentity(query.directory) }); } catch (error) { return failure(res, error, "Failed to check local git identity:"); } });
  app.post("/api/git/set-identity", async (req, res) => { try { const dir = directory(req, res); const body = request<any>("POST /api/git/set-identity", req.body, res); if (!dir || !body) return; const git = await getGitLibraries(); const selected = body.profileId === "global" ? await git.getGlobalIdentity() : git.getProfile(body.profileId); if (!selected || !selected.userName || !selected.userEmail) return failure(res, new Error("Profile not found"), "Git identity profile missing:"); const profile = { id: body.profileId, name: "name" in selected ? selected.name : "Global Identity", userName: selected.userName, userEmail: selected.userEmail, sshKey: "sshKey" in selected ? selected.sshKey ?? null : null }; await git.setLocalIdentity(dir, profile); return respond("POST /api/git/set-identity", res, { success: true, profile }); } catch (error) { return failure(res, error, "Failed to set git identity:"); } });

  app.get("/api/git/status", async (req, res) => { try { const query = request<any>("GET /api/git/status", req.query, res); if (!query) return; const git = await getGitLibraries(); const empty = { isGitRepository: false, branch: null, current: null, tracking: null, ahead: 0, behind: 0, files: [], isClean: true, mergeInProgress: null, rebaseInProgress: null, attentionReason: null }; return respond("GET /api/git/status", res, await git.isGitRepository(query.directory) ? await git.getStatus(query.directory, { mode: query.mode }) : empty); } catch (error) { if (/not a git repository/i.test(errorText(error))) return respond("GET /api/git/status", res, { isGitRepository: false, branch: null, current: null, tracking: null, ahead: 0, behind: 0, files: [], isClean: true, mergeInProgress: null, rebaseInProgress: null, attentionReason: null }); return failure(res, error, "Failed to get git status:"); } });
  app.get("/api/git/diff", async (req, res) => { try { const dir = directory(req, res); const body = request<any>("GET /api/git/diff", { path: req.query.path, staged: req.query.staged === "true" ? true : req.query.staged === undefined ? undefined : false, contextLines: req.query.context === undefined ? undefined : Number(req.query.context) }, res); if (!dir || !body) return; return respond("GET /api/git/diff", res, { diff: await (await getGitLibraries()).getDiff(dir, { ...body, contextLines: body.contextLines ?? 3 }) }); } catch (error) { return failure(res, error, "Failed to get git diff:"); } });
  app.get("/api/git/file-diff", async (req, res) => { try { const dir = directory(req, res); const body = request<any>("GET /api/git/file-diff", { path: req.query.path, staged: req.query.staged === "true" ? true : req.query.staged === undefined ? undefined : false }, res); if (!dir || !body) return; return respond("GET /api/git/file-diff", res, await (await getGitLibraries()).getFileDiff(dir, body)); } catch (error) { return failure(res, error, "Failed to get git file diff:"); } });
  app.post("/api/git/revert", operation("POST /api/git/revert", async (_req, dir, body, git) => { await git.revertFile(dir, body.path); return { success: true }; }));
  app.post("/api/git/pull", operation("POST /api/git/pull", async (_req, dir, body, git) => git.pull(dir, body)));
  app.post("/api/git/push", operation("POST /api/git/push", async (_req, dir, body, git) => git.push(dir, body)));
  app.post("/api/git/fetch", operation("POST /api/git/fetch", async (_req, dir, body, git) => { await git.fetch(dir, body); return { success: true }; }));
  app.get("/api/git/remotes", async (req, res) => { try { const query = request<any>("GET /api/git/remotes", req.query, res); if (!query) return; return respond("GET /api/git/remotes", res, await (await getGitLibraries()).getRemotes(query.directory)); } catch (error) { return failure(res, error, "Failed to get remotes:"); } });
  app.delete("/api/git/remotes", operation("DELETE /api/git/remotes", async (_req, dir, body, git) => { await git.removeRemote(dir, body); return { success: true }; }));

  app.post("/api/git/rebase", operation("POST /api/git/rebase", async (_req, dir, body, git) => ({ success: Boolean(await git.rebase(dir, body)) })));
  app.post("/api/git/rebase/abort", emptyOperation("POST /api/git/rebase/abort", async (_req, dir, git) => git.abortRebase(dir)));
  app.post("/api/git/merge", operation("POST /api/git/merge", async (_req, dir, body, git) => { const result = await git.merge(dir, body); return { success: result.success, ...(result.conflicts ? { conflict: true, conflictFiles: result.conflicts } : {}) }; }));
  app.post("/api/git/merge/abort", emptyOperation("POST /api/git/merge/abort", async (_req, dir, git) => git.abortMerge(dir)));
  app.post("/api/git/rebase/continue", emptyOperation("POST /api/git/rebase/continue", async (_req, dir, git) => ({ success: Boolean(await git.continueRebase(dir)) })));
  app.post("/api/git/merge/continue", emptyOperation("POST /api/git/merge/continue", async (_req, dir, git) => ({ success: Boolean(await git.continueMerge(dir)) })));
  app.get("/api/git/conflict-details", async (req, res) => { try { const query = request<any>("GET /api/git/conflict-details", req.query, res); if (!query) return; return respond("GET /api/git/conflict-details", res, await (await getGitLibraries()).getConflictDetails(query.directory)); } catch (error) { return failure(res, error, "Failed to get conflict details:"); } });
  app.post("/api/git/stash", operation("POST /api/git/stash", async (_req, dir, body, git) => { await git.stash(dir, body); return { success: true }; }));
  app.post("/api/git/stash/pop", emptyOperation("POST /api/git/stash/pop", async (_req, dir, git) => { await git.stashPop(dir); return { success: true }; }));
  app.post("/api/git/commit", operation("POST /api/git/commit", async (_req, dir, body, git) => git.commit(dir, body.message, { addAll: body.addAll, files: body.files })));

  app.get("/api/git/branches", async (req, res) => { try { const query = request<any>("GET /api/git/branches", req.query, res); if (!query) return; const git = await getGitLibraries(); return respond("GET /api/git/branches", res, await git.isGitRepository(query.directory) ? await git.getBranches(query.directory) : { all: [], current: null, branches: {} }); } catch (error) { if (/not a git repository/i.test(errorText(error))) return respond("GET /api/git/branches", res, { all: [], current: null, branches: {} }); return failure(res, error, "Failed to get branches:"); } });
  app.post("/api/git/branches", operation("POST /api/git/branches", async (_req, dir, body, git) => ({ success: Boolean(await git.createBranch(dir, body.name, { startPoint: body.startPoint })), branch: body.name })));
  app.delete("/api/git/branches", operation("DELETE /api/git/branches", async (_req, dir, body, git) => { await git.deleteBranch(dir, body.branch, { force: body.force }); return { success: true }; }));
  app.put("/api/git/branches/rename", operation("PUT /api/git/branches/rename", async (_req, dir, body, git) => ({ success: Boolean(await git.renameBranch(dir, body.oldName, body.newName)), branch: body.newName })));
  app.delete("/api/git/remote-branches", operation("DELETE /api/git/remote-branches", async (_req, dir, body, git) => { await git.deleteRemoteBranch(dir, body); return { success: true }; }));
  app.post("/api/git/checkout", operation("POST /api/git/checkout", async (_req, dir, body, git) => ({ success: Boolean(await git.checkoutBranch(dir, body.branch)), branch: body.branch })));

  app.get("/api/git/worktrees", async (req, res) => { try { const query = request<any>("GET /api/git/worktrees", req.query, res); if (!query) return; return respond("GET /api/git/worktrees", res, await (await getGitLibraries()).getWorktrees(query.directory)); } catch (error) { return failure(res, error, "Failed to get worktrees:"); } });
  app.post("/api/git/worktrees/validate", operation("POST /api/git/worktrees/validate", async (_req, dir, body, git) => git.validateWorktreeCreate(dir, body)));
  app.post("/api/git/worktrees", operation("POST /api/git/worktrees", async (_req, dir, body, git) => git.createWorktree(dir, body)));
  app.post("/api/git/worktrees/preview", operation("POST /api/git/worktrees/preview", async (_req, dir, body, git) => git.previewWorktreeCreate(dir, body)));
  app.get("/api/git/worktrees/bootstrap-status", async (req, res) => { try { const query = request<any>("GET /api/git/worktrees/bootstrap-status", req.query, res); if (!query) return; return respond("GET /api/git/worktrees/bootstrap-status", res, await (await getGitLibraries()).getWorktreeBootstrapStatus(query.directory)); } catch (error) { return failure(res, error, "Failed to get worktree bootstrap status:"); } });
  app.delete("/api/git/worktrees", operation("DELETE /api/git/worktrees", async (_req, dir, body, git) => { await git.removeWorktree(dir, body); return { success: true }; }));
  app.get("/api/git/worktree-type", async (req, res) => { try { const query = request<any>("GET /api/git/worktree-type", req.query, res); if (!query) return; return respond("GET /api/git/worktree-type", res, { linked: await (await getGitLibraries()).isLinkedWorktree(query.directory) }); } catch (error) { return failure(res, error, "Failed to determine worktree type:"); } });
  app.post("/api/git/validate-directory", async (req, res) => { try { const body = request<any>("POST /api/git/validate-directory", req.body, res); if (!body) return; return respond("POST /api/git/validate-directory", res, await (await getGitLibraries()).validateWorktreeDirectory(body.directory, body.worktreeRoot)); } catch (error) { return failure(res, error, "Failed to validate worktree directory:"); } });
  app.post("/api/git/canonicalize-worktree-state", async (req, res) => { try { const body = request<any>("POST /api/git/canonicalize-worktree-state", req.body, res); if (!body) return; return respond("POST /api/git/canonicalize-worktree-state", res, await (await getGitLibraries()).canonicalizeWorktreeState(body.directory)); } catch (error) { return failure(res, error, "Failed to canonicalize worktree state:"); } });
  app.get("/api/git/log", async (req, res) => { try { const query = request<any>("GET /api/git/log", { ...req.query, maxCount: req.query.maxCount === undefined ? undefined : Number(req.query.maxCount) }, res); if (!query) return; const { directory: dir, ...options } = query; return respond("GET /api/git/log", res, await (await getGitLibraries()).getLog(dir, options)); } catch (error) { return failure(res, error, "Failed to get log:"); } });
  app.get("/api/git/commit-files", async (req, res) => { try { const query = request<any>("GET /api/git/commit-files", req.query, res); if (!query) return; return respond("GET /api/git/commit-files", res, await (await getGitLibraries()).getCommitFiles(query.directory, query.hash)); } catch (error) { return failure(res, error, "Failed to get commit files:"); } });
}
