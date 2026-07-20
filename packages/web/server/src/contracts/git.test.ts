import { describe, expect, it } from "vitest";
import { parseGitBatchCheckRequest, parseGitBatchCheckResponse, parseGitDiffRequest, parseGitErrorResponse, parseGitStatusResponse, parseGitWorktreeCreateRequest, parseGitWorktreeRemoveRequest } from "./git.js";

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
    expect(parseGitDiffRequest({ path: "", staged: "yes" }).ok).toBe(false);
    expect(parseGitWorktreeCreateRequest({ mode: "invalid" }).ok).toBe(false);
    expect(parseGitWorktreeRemoveRequest({ directory: 1 }).ok).toBe(false);
    expect(parseGitErrorResponse({ error: "secret /tmp/repo", code: "git_internal_error" }).ok).toBe(true);
  });

  it("preserves valid partial batch outcomes", () => {
    expect(parseGitBatchCheckRequest({ directories: ["/one", "/two"] }).ok).toBe(true);
    expect(parseGitBatchCheckResponse({ results: { "/one": true, "/two": false } })).toEqual({ ok: true, value: { results: { "/one": true, "/two": false } } });
  });
});
