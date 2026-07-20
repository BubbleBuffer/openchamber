import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GIT_ROUTE_CONTRACTS,
  parseGitBatchCheckRequest,
  parseGitBatchCheckResponse,
  parseGitBranchMutationRequest,
  parseGitCommitRequest,
  parseGitErrorResponse,
  parseGitLogResponse,
  parseGitOperationResponse,
  parseGitPushRequest,
  parseGitStatusResponse,
  parseGitWorktreePreviewResponse,
  parseGitWorktreeValidationResult,
} from "./git.js";

describe("git contracts", () => {
  it("parses nullable branch state without dropping attention fields", () => {
    expect(parseGitStatusResponse({
      current: null,
      tracking: null,
      ahead: 0,
      behind: 0,
      files: [],
      isClean: true,
      mergeInProgress: null,
      rebaseInProgress: null,
      attentionReason: "cherry-pick",
    })).toMatchObject({ ok: true });
  });

  it("rejects malformed responses and invalid request discriminants", () => {
    expect(parseGitStatusResponse({ current: "main" }).ok).toBe(false);
    expect(parseGitBranchMutationRequest({ branch: "", force: "yes" }).ok).toBe(false);
    expect(parseGitCommitRequest({ message: "", files: [1] }).ok).toBe(false);
    expect(parseGitErrorResponse({ error: "secret /tmp/repo", code: "git_internal_error" }).ok).toBe(true);
  });

  it("preserves valid partial batch outcomes", () => {
    expect(parseGitBatchCheckRequest({ directories: ["/one", "/two"] }).ok).toBe(true);
    expect(parseGitBatchCheckResponse({ results: { "/one": true, "/two": false } })).toEqual({ ok: true, value: { results: { "/one": true, "/two": false } } });
  });

  it("keeps preview, push options, and finite integer query values within their contracts", () => {
    expect(parseGitWorktreePreviewResponse({ name: "topic", branch: "topic", path: "/worktrees/topic" }).ok).toBe(true);
    expect(parseGitPushRequest({ options: ["--force-with-lease"] }).ok).toBe(true);
    expect(GIT_ROUTE_CONTRACTS["GET /api/git/log"].request({ directory: "/repo", maxCount: Number.NaN }).ok).toBe(false);
    expect(GIT_ROUTE_CONTRACTS["GET /api/git/log"].request({ directory: "/repo", maxCount: 1.5 }).ok).toBe(false);
    expect(GIT_ROUTE_CONTRACTS["GET /api/git/diff"].request({ path: "a.ts", contextLines: Infinity }).ok).toBe(false);
    expect(GIT_ROUTE_CONTRACTS["GET /api/git/diff"].request({ path: "a.ts", contextLines: 2.5 }).ok).toBe(false);
  });

  it("owns named request and response parsers for every active git route", () => {
    const routes = readFileSync(resolve(import.meta.dirname, "../domains/git/routes.ts"), "utf8");
    const active = [...routes.matchAll(/app\.(get|post|put|delete)\(\s*["'](\/api\/git\/[^"']*)["']/g)]
      .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
      .sort();
    expect(Object.keys(GIT_ROUTE_CONTRACTS).sort()).toEqual(active);
    expect(Object.values(GIT_ROUTE_CONTRACTS).every(({ request, response }) => typeof request === "function" && typeof response === "function")).toBe(true);
  });

  it("parses representative nullable, partial, and malformed route payloads", () => {
    expect(parseGitLogResponse({ all: [], latest: null, total: 0 }).ok).toBe(true);
    expect(parseGitWorktreeValidationResult({ ok: false, errors: [{ code: "branch_exists", message: "exists" }], resolved: { mode: "existing", localBranch: null } }).ok).toBe(true);
    expect(parseGitOperationResponse({ success: true, conflict: true, conflictFiles: ["a.ts"] }).ok).toBe(true);
    expect(parseGitOperationResponse({ success: true, conflictFiles: [1] }).ok).toBe(false);
  });

  it("keeps Git wire DTOs out of the aggregate runtime API module", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../../src/ui/lib/api/types.ts"), "utf8");
    expect(source).not.toMatch(/(?:export\s+)?interface\s+(?:GitStatus|GitDiff|GetGit|GitFileDiff|GitBranch(?!API)|GitCommit|GitPush|GitPull|GitRemote|GitMerge|GitRebase|MergeConflict|GitIdentity|DiscoveredGit|GitLog|CommitFile|GitWorktree(?!API)|CreateGit|RemoveGit)/);
  });
});
