

import type {
  GitStatus,
  GitDiffResponse,
  GetGitDiffOptions,
  GitFileDiffResponse,
  GetGitFileDiffOptions,
  GitBranch,
  GitDeleteBranchPayload,
  GitDeleteRemoteBranchPayload,
  GitRemoveRemotePayload,
  GeneratedCommitMessage,
  GitWorktreeInfo,
  CreateGitWorktreePayload,
  GitWorktreeCreateResult,
  RemoveGitWorktreePayload,
  GitWorktreeValidationResult,
  CreateGitCommitOptions,
  GitCommitResult,
  GitPushResult,
  GitPullResult,
  GitLogOptions,
  GitLogResponse,
  GitCommitFilesResponse,
  GitIdentityProfile,
  GitIdentitySummary,
  DiscoveredGitCredential,
  MergeConflictDetails,
} from '../api/types';
import {
  parseGitBatchCheckResponse, parseGitBranchMutationResponse, parseGitBranchResponse,
  parseGitCanonicalizeWorktreeResponse, parseGitCommitFilesResponse, parseGitCommitResponse,
  parseGitConflictDetails, parseGitCredentialsResponse, parseGitDiffResponse, parseGitErrorResponse,
  parseGitFileDiffResponse, parseGitIdentityProfileResponse, parseGitIdentityProfilesResponse,
  parseGitIdentitySetResponse, parseGitIdentitySummary, parseGitLinkedWorktreeResponse,
  parseGitGeneratedCommitMessageResponse, parseGitGeneratedPullRequestDescriptionResponse,
  parseGitLocalIdentityResponse, parseGitLogResponse, parseGitOperationResponse,
  parseGitPullResponse, parseGitPushResponse, parseGitRemoteUrlResponse, parseGitRemotesResponse,
  parseGitRepositoryCheckResponse, parseGitStatusResponse, parseGitSuccessResponse,
  parseGitWorktreeBootstrapStatus, parseGitWorktreeCreateResponse, parseGitWorktreeDirectoryResult,
  parseGitWorktreeValidationResult, parseGitWorktreesResponse,
} from '@contracts/git';

const resolveBaseOrigin = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.origin;
};

const API_BASE = '/api/git';
const GIT_STATUS_CACHE_TTL_MS = 1200;
const GIT_REPO_CHECK_CACHE_TTL_MS = 5000;
const WORKTREES_CACHE_TTL_MS = 30000;
const WORKTREE_BOOTSTRAP_CACHE_TTL_MS = 10000;

const gitStatusCache = new Map<string, { value: GitStatus; expiresAt: number }>();
const gitStatusInFlight = new Map<string, Promise<GitStatus>>();
const gitRepoCache = new Map<string, { value: boolean; expiresAt: number }>();
const gitRepoInFlight = new Map<string, Promise<boolean>>();
const worktreesCache = new Map<string, { value: GitWorktreeInfo[]; expiresAt: number }>();
const worktreesInFlight = new Map<string, Promise<GitWorktreeInfo[]>>();
const worktreeBootstrapCache = new Map<string, { value: import('../api/types').GitWorktreeBootstrapStatus; expiresAt: number }>();
const worktreeBootstrapInFlight = new Map<string, Promise<import('../api/types').GitWorktreeBootstrapStatus>>();

async function gitHttpError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null);
  const parsed = parseGitErrorResponse(payload);
  return new Error(parsed.ok ? `${fallback} (${parsed.value.code})` : fallback);
}

function decoded<T>(result: { ok: true; value: T } | { ok: false; error: string }, fallback: string): T {
  if (!result.ok) throw new Error(fallback);
  return result.value;
}

async function gitSuccess<T>(response: Response, fallback: string, parser: (value: unknown) => { ok: true; value: T } | { ok: false; error: string }): Promise<T> {
  if (!response.ok) throw await gitHttpError(response, fallback);
  return decoded(parser(await response.json()), `Malformed ${fallback.slice('Failed to '.length)} response`);
}

const normalizeDirectoryKey = (directory: string): string => directory.trim();

function buildUrl(
  path: string,
  directory: string | null | undefined,
  params?: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(path, resolveBaseOrigin());
  if (directory) {
    url.searchParams.set('directory', directory);
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function checkIsGitRepository(directory: string): Promise<boolean> {
  const key = normalizeDirectoryKey(directory);
  const now = Date.now();
  const cached = gitRepoCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = gitRepoInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    let response: Response;
    try {
      response = await fetch(buildUrl(`${API_BASE}/check`, directory));
    } catch (err) {
      throw new Error(`Failed to check git repository: Network error — ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!response.ok) {
      throw await gitHttpError(response, 'Failed to check git repository');
    }
    const isGitRepository = decoded(parseGitRepositoryCheckResponse(await response.json()), 'Malformed git repository response').isGitRepository;
    gitRepoCache.set(key, {
      value: isGitRepository,
      expiresAt: Date.now() + GIT_REPO_CHECK_CACHE_TTL_MS,
    });
    return isGitRepository;
  })();

  gitRepoInFlight.set(key, task);
  try {
    return await task;
  } finally {
    if (gitRepoInFlight.get(key) === task) {
      gitRepoInFlight.delete(key);
    }
  }
}

export async function checkIsGitRepositoriesBatch(directories: string[]): Promise<Record<string, boolean>> {
  if (directories.length === 0) return {};

  const response = await fetch(`${resolveBaseOrigin()}${API_BASE}/check-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directories }),
  });
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to batch-check git repositories');
  }
  const results = decoded(parseGitBatchCheckResponse(await response.json()), 'Malformed git batch response').results;

  const now = Date.now();
  for (const [dir, isRepo] of Object.entries(results)) {
    const key = normalizeDirectoryKey(dir);
    gitRepoCache.set(key, {
      value: isRepo,
      expiresAt: now + GIT_REPO_CHECK_CACHE_TTL_MS,
    });
  }

  return results;
}

export async function getGitStatus(directory: string, options?: { mode?: 'light' }): Promise<GitStatus> {
  const mode = options?.mode;
  const key = mode === 'light' ? `${normalizeDirectoryKey(directory)}::light` : normalizeDirectoryKey(directory);
  const now = Date.now();
  const cached = gitStatusCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = gitStatusInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    let response: Response;
    try {
      response = await fetch(buildUrl(`${API_BASE}/status`, directory, mode ? { mode } : undefined));
    } catch (err) {
      throw new Error(`Failed to get git status: Network error — ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!response.ok) {
      throw await gitHttpError(response, 'Failed to get git status');
    }
    const payload = decoded(parseGitStatusResponse(await response.json()), 'Malformed git status response');
    gitStatusCache.set(key, {
      value: payload,
      expiresAt: Date.now() + GIT_STATUS_CACHE_TTL_MS,
    });
    return payload;
  })();

  gitStatusInFlight.set(key, task);
  try {
    return await task;
  } finally {
    if (gitStatusInFlight.get(key) === task) {
      gitStatusInFlight.delete(key);
    }
  }
}

export async function getGitDiff(directory: string, options: GetGitDiffOptions): Promise<GitDiffResponse> {
  const { path, staged, contextLines } = options;
  if (!path) {
    throw new Error('path is required to fetch git diff');
  }

  const response = await fetch(
    buildUrl(`${API_BASE}/diff`, directory, {
      path,
      staged: staged ? 'true' : undefined,
      context: contextLines,
    })
  );

  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get git diff');
  }

  return decoded(parseGitDiffResponse(await response.json()), 'Malformed git diff response');
}

export async function getGitFileDiff(directory: string, options: GetGitFileDiffOptions): Promise<GitFileDiffResponse> {
  const { path, staged } = options;
  if (!path) {
    throw new Error('path is required to fetch git file diff');
  }

  const response = await fetch(
    buildUrl(`${API_BASE}/file-diff`, directory, {
      path,
      staged: staged ? 'true' : undefined,
    })
  );

  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get git file diff');
  }

  return decoded(parseGitFileDiffResponse(await response.json()), 'Malformed git file diff response');
}

export async function revertGitFile(directory: string, filePath: string): Promise<void> {
  if (!filePath) {
    throw new Error('path is required to revert git changes');
  }

  const response = await fetch(buildUrl(`${API_BASE}/revert`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
  });

  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to revert git changes');
  }
}

export async function isLinkedWorktree(directory: string): Promise<boolean> {
  if (!directory) {
    return false;
  }
  const response = await fetch(buildUrl(`${API_BASE}/worktree-type`, directory));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to detect worktree type');
  }
  return decoded(parseGitLinkedWorktreeResponse(await response.json()), 'Malformed git worktree type response').linked;
}

export async function getGitBranches(directory: string): Promise<GitBranch> {
  const response = await fetch(buildUrl(`${API_BASE}/branches`, directory));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get branches');
  }
  return decoded(parseGitBranchResponse(await response.json()), 'Malformed git branches response');
}

export async function deleteGitBranch(directory: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }> {
  if (!payload?.branch) {
    throw new Error('branch is required to delete a branch');
  }

  const response = await fetch(buildUrl(`${API_BASE}/branches`, directory), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return gitSuccess(response, 'Failed to delete branch', parseGitSuccessResponse);
}

export async function deleteRemoteBranch(directory: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }> {
  if (!payload?.branch) {
    throw new Error('branch is required to delete remote branch');
  }

  const response = await fetch(buildUrl(`${API_BASE}/remote-branches`, directory), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return gitSuccess(response, 'Failed to delete remote branch', parseGitSuccessResponse);
}

export async function removeRemote(directory: string, payload: GitRemoveRemotePayload): Promise<{ success: boolean }> {
  const remote = payload?.remote?.trim();
  if (!remote) {
    throw new Error('remote is required to remove a remote');
  }

  const response = await fetch(buildUrl(`${API_BASE}/remotes`, directory), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remote }),
  });

  return gitSuccess(response, 'Failed to remove remote', parseGitSuccessResponse);
}

export async function generateCommitMessage(
  directory: string,
  files: string[],
  options?: { zenModel?: string; providerId?: string; modelId?: string }
): Promise<{ message: GeneratedCommitMessage }> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files provided to generate commit message');
  }

  const body: Record<string, unknown> = { files };
  if (options?.zenModel) {
    body.zenModel = options.zenModel;
  }
  if (options?.providerId) {
    body.providerId = options.providerId;
  }
  if (options?.modelId) {
    body.modelId = options.modelId;
  }

  const response = await fetch(buildUrl(`${API_BASE}/commit-message`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return gitSuccess(response, 'Failed to generate git commit message', parseGitGeneratedCommitMessageResponse);
}

export async function generatePullRequestDescription(
  directory: string,
  payload: { base: string; head: string; context?: string; zenModel?: string; providerId?: string; modelId?: string }
): Promise<{ title: string; body: string }> {
  const { base, head, context, zenModel, providerId, modelId } = payload;
  if (!base || !head) {
    throw new Error('base and head are required');
  }

  const requestBody: { base: string; head: string; context?: string; zenModel?: string; providerId?: string; modelId?: string } = { base, head };
  if (context?.trim()) {
    requestBody.context = context.trim();
  }
  if (zenModel) {
    requestBody.zenModel = zenModel;
  }
  if (providerId) {
    requestBody.providerId = providerId;
  }
  if (modelId) {
    requestBody.modelId = modelId;
  }

  const response = await fetch(buildUrl(`${API_BASE}/pr-description`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  return gitSuccess(response, 'Failed to generate git pull request description', parseGitGeneratedPullRequestDescriptionResponse);
}

export async function listGitWorktrees(directory: string): Promise<GitWorktreeInfo[]> {
  const key = normalizeDirectoryKey(directory);
  const now = Date.now();
  const cached = worktreesCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = worktreesInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    const response = await fetch(buildUrl(`${API_BASE}/worktrees`, directory));
    const data = await gitSuccess(response, 'Failed to list git worktrees', parseGitWorktreesResponse);
    worktreesCache.set(key, {
      value: data,
      expiresAt: Date.now() + WORKTREES_CACHE_TTL_MS,
    });
    return data;
  })();

  worktreesInFlight.set(key, task);
  try {
    return await task;
  } finally {
    if (worktreesInFlight.get(key) === task) {
      worktreesInFlight.delete(key);
    }
  }
}

export async function validateGitWorktree(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeValidationResult> {
  const response = await fetch(buildUrl(`${API_BASE}/worktrees/validate`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  return gitSuccess(response, 'Failed to validate git worktree', parseGitWorktreeValidationResult);
}

export async function getGitWorktreeBootstrapStatus(directory: string): Promise<import('../api/types').GitWorktreeBootstrapStatus> {
  const key = normalizeDirectoryKey(directory);
  const now = Date.now();
  const cached = worktreeBootstrapCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = worktreeBootstrapInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    const response = await fetch(buildUrl(`${API_BASE}/worktrees/bootstrap-status`, directory));
    const data = await gitSuccess(response, 'Failed to get git worktree bootstrap status', parseGitWorktreeBootstrapStatus);
    worktreeBootstrapCache.set(key, {
      value: data,
      expiresAt: Date.now() + WORKTREE_BOOTSTRAP_CACHE_TTL_MS,
    });
    return data;
  })();

  worktreeBootstrapInFlight.set(key, task);
  try {
    return await task;
  } finally {
    if (worktreeBootstrapInFlight.get(key) === task) {
      worktreeBootstrapInFlight.delete(key);
    }
  }
}

export async function previewGitWorktree(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult> {
  const response = await fetch(buildUrl(`${API_BASE}/worktrees/preview`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  return gitSuccess(response, 'Failed to preview git worktree', parseGitWorktreeCreateResponse);
}

export async function createGitWorktree(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult> {
  const response = await fetch(buildUrl(`${API_BASE}/worktrees`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  return gitSuccess(response, 'Failed to create git worktree', parseGitWorktreeCreateResponse);
}

export async function deleteGitWorktree(directory: string, payload: RemoveGitWorktreePayload): Promise<{ success: boolean }> {
  const response = await fetch(buildUrl(`${API_BASE}/worktrees`, directory), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  return gitSuccess(response, 'Failed to delete git worktree', parseGitSuccessResponse);
}

export async function createGitCommit(
  directory: string,
  message: string,
  options: CreateGitCommitOptions = {}
): Promise<GitCommitResult> {
  const response = await fetch(buildUrl(`${API_BASE}/commit`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      addAll: options.addAll ?? false,
      files: options.files,
    }),
  });
  return gitSuccess(response, 'Failed to create git commit', parseGitCommitResponse);
}

export async function gitPush(
  directory: string,
  options: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> } = {}
): Promise<GitPushResult> {
  const response = await fetch(buildUrl(`${API_BASE}/push`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return gitSuccess(response, 'Failed to git push', parseGitPushResponse);
}

export async function gitPull(
  directory: string,
  options: { remote?: string; branch?: string } = {}
): Promise<GitPullResult> {
  const response = await fetch(buildUrl(`${API_BASE}/pull`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return gitSuccess(response, 'Failed to git pull', parseGitPullResponse);
}

export async function gitFetch(
  directory: string,
  options: { remote?: string; branch?: string } = {}
): Promise<{ success: boolean }> {
  const response = await fetch(buildUrl(`${API_BASE}/fetch`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return gitSuccess(response, 'Failed to git fetch', parseGitSuccessResponse);
}

export async function checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }> {
  const response = await fetch(buildUrl(`${API_BASE}/checkout`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch }),
  });
  return gitSuccess(response, 'Failed to checkout branch', parseGitBranchMutationResponse);
}

export async function createBranch(
  directory: string,
  name: string,
  startPoint?: string
): Promise<{ success: boolean; branch: string }> {
  const response = await fetch(buildUrl(`${API_BASE}/branches`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, startPoint }),
  });
  return gitSuccess(response, 'Failed to create branch', parseGitBranchMutationResponse);
}

export async function renameBranch(
  directory: string,
  oldName: string,
  newName: string
): Promise<{ success: boolean; branch: string }> {
  const response = await fetch(buildUrl(`${API_BASE}/branches/rename`, directory), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldName, newName }),
  });
  return gitSuccess(response, 'Failed to rename branch', parseGitBranchMutationResponse);
}

export async function getGitLog(
  directory: string,
  options: GitLogOptions = {}
): Promise<GitLogResponse> {
  const response = await fetch(
    buildUrl(`${API_BASE}/log`, directory, {
      maxCount: options.maxCount,
      from: options.from,
      to: options.to,
      file: options.file,
    })
  );
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get git log');
  }
  return gitSuccess(response, 'Failed to get git log', parseGitLogResponse);
}

export async function getCommitFiles(
  directory: string,
  hash: string
): Promise<GitCommitFilesResponse> {
  const response = await fetch(
    buildUrl(`${API_BASE}/commit-files`, directory, { hash })
  );
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get commit files');
  }
  return gitSuccess(response, 'Failed to get commit files', parseGitCommitFilesResponse);
}

export async function getGitIdentities(): Promise<GitIdentityProfile[]> {
  const response = await fetch(buildUrl(`${API_BASE}/identities`, undefined));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get git identities');
  }
  return gitSuccess(response, 'Failed to get git identities', parseGitIdentityProfilesResponse);
}

export async function createGitIdentity(profile: GitIdentityProfile): Promise<GitIdentityProfile> {
  const response = await fetch(buildUrl(`${API_BASE}/identities`, undefined), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to create git identity');
  }
  return gitSuccess(response, 'Failed to create git identity', parseGitIdentityProfileResponse);
}

export async function updateGitIdentity(id: string, updates: GitIdentityProfile): Promise<GitIdentityProfile> {
  const response = await fetch(buildUrl(`${API_BASE}/identities/${id}`, undefined), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to update git identity');
  }
  return gitSuccess(response, 'Failed to update git identity', parseGitIdentityProfileResponse);
}

export async function deleteGitIdentity(id: string): Promise<void> {
  const response = await fetch(buildUrl(`${API_BASE}/identities/${id}`, undefined), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to delete git identity');
  }
}

export async function getCurrentGitIdentity(directory: string): Promise<GitIdentitySummary | null> {
  if (!directory) {
    return null;
  }
  const response = await fetch(buildUrl(`${API_BASE}/current-identity`, directory));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get current git identity');
  }
  const data = decoded(parseGitIdentitySummary(await response.json()), 'Malformed git identity response');
  return {
    userName: data.userName ?? null,
    userEmail: data.userEmail ?? null,
    sshCommand: data.sshCommand ?? null,
  };
}

export async function hasLocalIdentity(directory: string): Promise<boolean> {
  if (!directory) {
    return false;
  }
  const response = await fetch(buildUrl(`${API_BASE}/has-local-identity`, directory));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to check local identity');
  }
  return decoded(parseGitLocalIdentityResponse(await response.json()), 'Malformed git local identity response').hasLocalIdentity;
}

export async function getGlobalGitIdentity(): Promise<GitIdentitySummary | null> {
  const response = await fetch(buildUrl(`${API_BASE}/global-identity`, undefined));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get global git identity');
  }
  const data = decoded(parseGitIdentitySummary(await response.json()), 'Malformed git identity response');
  if (!data.userName && !data.userEmail) {
    return null;
  }
  return {
    userName: data.userName ?? null,
    userEmail: data.userEmail ?? null,
    sshCommand: data.sshCommand ?? null,
  };
}

export async function setGitIdentity(
  directory: string,
  profileId: string
): Promise<{ success: boolean; profile: GitIdentityProfile }> {
  const response = await fetch(buildUrl(`${API_BASE}/set-identity`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId }),
  });
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to set git identity');
  }
  return gitSuccess(response, 'Failed to set git identity', parseGitIdentitySetResponse);
}

export async function discoverGitCredentials(): Promise<DiscoveredGitCredential[]> {
  const response = await fetch(buildUrl(`${API_BASE}/discover-credentials`, undefined));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to discover git credentials');
  }
  return gitSuccess(response, 'Failed to discover git credentials', parseGitCredentialsResponse);
}

export async function getRemoteUrl(directory: string, remote?: string): Promise<string | null> {
  if (!directory) {
    return null;
  }
  const response = await fetch(buildUrl(`${API_BASE}/remote-url`, directory, { remote }));
  if (!response.ok) {
    return null;
  }
  return decoded(parseGitRemoteUrlResponse(await response.json()), 'Malformed git remote url response').url;
}

export async function getRemotes(directory: string): Promise<Array<{ name: string; fetchUrl: string; pushUrl: string }>> {
  const response = await fetch(buildUrl(`${API_BASE}/remotes`, directory));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get remotes');
  }
  return gitSuccess(response, 'Failed to get git remotes', parseGitRemotesResponse);
}

export async function rebase(
  directory: string,
  options: { onto: string }
): Promise<{ success: boolean; conflict?: boolean; conflictFiles?: string[] }> {
  const response = await fetch(buildUrl(`${API_BASE}/rebase`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return gitSuccess(response, 'Failed to rebase', parseGitOperationResponse);
}

export async function abortRebase(directory: string): Promise<{ success: boolean }> {
  const response = await fetch(buildUrl(`${API_BASE}/rebase/abort`, directory), {
    method: 'POST',
  });
  return gitSuccess(response, 'Failed to abort rebase', parseGitOperationResponse);
}

export async function merge(
  directory: string,
  options: { branch: string }
): Promise<{ success: boolean; conflict?: boolean; conflictFiles?: string[] }> {
  const response = await fetch(buildUrl(`${API_BASE}/merge`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return gitSuccess(response, 'Failed to merge', parseGitOperationResponse);
}

export async function abortMerge(directory: string): Promise<{ success: boolean }> {
  const response = await fetch(buildUrl(`${API_BASE}/merge/abort`, directory), {
    method: 'POST',
  });
  return gitSuccess(response, 'Failed to abort merge', parseGitOperationResponse);
}

export async function continueRebase(directory: string): Promise<{ success: boolean; conflict: boolean; conflictFiles?: string[] }> {
  const response = await fetch(buildUrl(`${API_BASE}/rebase/continue`, directory), {
    method: 'POST',
  });
  const result = await gitSuccess(response, 'Failed to continue rebase', parseGitOperationResponse);
  return { ...result, conflict: result.conflict ?? false };
}

export async function continueMerge(directory: string): Promise<{ success: boolean; conflict: boolean; conflictFiles?: string[] }> {
  const response = await fetch(buildUrl(`${API_BASE}/merge/continue`, directory), {
    method: 'POST',
  });
  const result = await gitSuccess(response, 'Failed to continue merge', parseGitOperationResponse);
  return { ...result, conflict: result.conflict ?? false };
}

export async function stash(
  directory: string,
  options?: { message?: string; includeUntracked?: boolean }
): Promise<{ success: boolean }> {
  const response = await fetch(buildUrl(`${API_BASE}/stash`, directory), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  return gitSuccess(response, 'Failed to stash', parseGitSuccessResponse);
}

export async function stashPop(directory: string): Promise<{ success: boolean }> {
  const response = await fetch(buildUrl(`${API_BASE}/stash/pop`, directory), {
    method: 'POST',
  });
  return gitSuccess(response, 'Failed to pop stash', parseGitSuccessResponse);
}

export async function getConflictDetails(directory: string): Promise<MergeConflictDetails> {
  const response = await fetch(buildUrl(`${API_BASE}/conflict-details`, directory));
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to get conflict details');
  }
  return gitSuccess(response, 'Failed to get conflict details', parseGitConflictDetails);
}

export async function validateWorktreeDirectory(
  directory: string,
  worktreeRoot: string
): Promise<{
  valid: boolean;
  insideWorktreeRoot: boolean;
  resolvedWorktreeRoot: string | null;
  resolvedCwd: string | null;
}> {
  const response = await fetch(`${API_BASE}/validate-directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory, worktreeRoot }),
  });
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to validate worktree directory');
  }
  return gitSuccess(response, 'Failed to validate worktree directory', parseGitWorktreeDirectoryResult);
}

export async function canonicalizeWorktreeState(
  directory: string
): Promise<{
  worktreeRoot: string | null;
  cwd: string | null;
  branch: string | null;
  headState: 'branch' | 'detached' | 'unborn';
  worktreeStatus: 'ready' | 'missing' | 'invalid' | 'not-a-repo';
  legacy: boolean;
  degraded: boolean;
  attentionReason?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null;
}> {
  const response = await fetch(`${API_BASE}/canonicalize-worktree-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory }),
  });
  if (!response.ok) {
    throw await gitHttpError(response, 'Failed to canonicalize worktree state');
  }
  return gitSuccess(response, 'Failed to canonicalize worktree state', parseGitCanonicalizeWorktreeResponse);
}
