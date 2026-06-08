import type { Octokit } from "@octokit/rest";
import { getRemotes, getStatus } from "../git/service.js";
import { resolveGitHubRepoFromDirectory } from "./repo.js";
import type { ParsedGitHubRemote, ResolveGitHubPrStatusOptions, ResolvedPrStatus } from "./types.js";

const REPO_DEFAULT_BRANCH_TTL_MS = 5 * 60_000;
const defaultBranchCache = new Map<string, { defaultBranch: string | null; fetchedAt: number }>();
const repoMetadataCache = new Map<string, { data: Record<string, unknown> | null; fetchedAt: number }>();

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const normalizeLower = (value: unknown): string => normalizeText(value).toLowerCase();
const normalizeRepoKey = (owner: unknown, repo: unknown): string => {
  const normalizedOwner = normalizeLower(owner);
  const normalizedRepo = normalizeLower(repo);
  if (!normalizedOwner || !normalizedRepo) {
    return "";
  }
  return `${normalizedOwner}/${normalizedRepo}`;
};

const parseTrackingRemoteName = (trackingBranch: unknown): string => {
  const normalized = normalizeText(trackingBranch);
  if (!normalized) {
    return "";
  }
  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) {
    return "";
  }
  return normalized.slice(0, slashIndex).trim();
};

const pushUnique = (
  collection: string[],
  value: unknown,
  keyFn: (v: string) => string = normalizeLower,
): void => {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return;
  }
  const nextKey = keyFn(normalizedValue);
  if (!nextKey) {
    return;
  }
  if (collection.some((item) => keyFn(item) === nextKey)) {
    return;
  }
  collection.push(normalizedValue);
};

const rankRemoteNames = (
  remoteNames: string[],
  explicitRemoteName: string,
  trackingRemoteName: string,
): string[] => {
  const ranked: string[] = [];
  pushUnique(ranked, explicitRemoteName);

  if (trackingRemoteName) {
    pushUnique(ranked, trackingRemoteName);
  }

  pushUnique(ranked, "origin");
  pushUnique(ranked, "upstream");
  remoteNames.forEach((name) => pushUnique(ranked, name));
  return ranked;
};

const getHeadOwner = (pr: Record<string, unknown> | null): string => {
  const repoOwner = normalizeText(pr?.head?.repo?.owner?.login);
  if (repoOwner) {
    return repoOwner;
  }
  const userOwner = normalizeText(pr?.head?.user?.login);
  if (userOwner) {
    return userOwner;
  }
  const headLabel = normalizeText(pr?.head?.label);
  const separatorIndex = headLabel.indexOf(":");
  if (separatorIndex > 0) {
    return headLabel.slice(0, separatorIndex).trim();
  }
  return "";
};

const getHeadRepoKey = (pr: Record<string, unknown> | null, fallbackRepoName: string): string => {
  const repoOwner = normalizeText(pr?.head?.repo?.owner?.login);
  const repoName = normalizeText(pr?.head?.repo?.name);
  if (repoOwner && repoName) {
    return normalizeRepoKey(repoOwner, repoName);
  }
  const headLabel = normalizeText(pr?.head?.label);
  const separatorIndex = headLabel.indexOf(":");
  if (separatorIndex > 0) {
    const labelOwner = headLabel.slice(0, separatorIndex).trim();
    if (labelOwner && fallbackRepoName) {
      return normalizeRepoKey(labelOwner, fallbackRepoName);
    }
  }
  return "";
};

const buildSourceMatcher = (sourceCandidates: { repo?: ParsedGitHubRemote | null }[]) => {
  const repoRank = new Map<string, number>();
  const ownerRank = new Map<string, number>();

  sourceCandidates.forEach((candidate, index) => {
    const repoKey = normalizeRepoKey(candidate.repo?.owner, candidate.repo?.repo);
    if (repoKey && !repoRank.has(repoKey)) {
      repoRank.set(repoKey, index);
    }
    const owner = normalizeLower(candidate.repo?.owner);
    if (owner && !ownerRank.has(owner)) {
      ownerRank.set(owner, index);
    }
  });

  const matches = (pr: Record<string, unknown> | null, fallbackRepoName: string): boolean => {
    const repoKey = getHeadRepoKey(pr, fallbackRepoName);
    if (repoKey && repoRank.has(repoKey)) {
      return true;
    }
    const owner = normalizeLower(getHeadOwner(pr));
    return Boolean(owner) && ownerRank.has(owner);
  };

  const compare = (left: Record<string, unknown> | null, right: Record<string, unknown> | null, fallbackRepoName: string): number => {
    const leftRepoRank = repoRank.get(getHeadRepoKey(left, fallbackRepoName));
    const rightRepoRank = repoRank.get(getHeadRepoKey(right, fallbackRepoName));
    const leftRepoScore = typeof leftRepoRank === "number" ? leftRepoRank : Number.POSITIVE_INFINITY;
    const rightRepoScore = typeof rightRepoRank === "number" ? rightRepoRank : Number.POSITIVE_INFINITY;
    if (leftRepoScore !== rightRepoScore) {
      return leftRepoScore - rightRepoScore;
    }

    const leftOwnerRank = ownerRank.get(normalizeLower(getHeadOwner(left)));
    const rightOwnerRank = ownerRank.get(normalizeLower(getHeadOwner(right)));
    const leftOwnerScore = typeof leftOwnerRank === "number" ? leftOwnerRank : Number.POSITIVE_INFINITY;
    const rightOwnerScore = typeof rightOwnerRank === "number" ? rightOwnerRank : Number.POSITIVE_INFINITY;
    if (leftOwnerScore !== rightOwnerScore) {
      return leftOwnerScore - rightOwnerScore;
    }

    return 0;
  };

  return { matches, compare };
};

const getRepoDefaultBranch = async (octokit: Octokit, repo: ParsedGitHubRemote | null): Promise<string | null> => {
  const repoKey = normalizeRepoKey(repo?.owner, repo?.repo);
  if (!repoKey) {
    return null;
  }

  const cached = defaultBranchCache.get(repoKey);
  if (cached && Date.now() - cached.fetchedAt < REPO_DEFAULT_BRANCH_TTL_MS) {
    return cached.defaultBranch;
  }

  try {
    const response = await octokit.rest.repos.get({
      owner: repo!.owner,
      repo: repo!.repo,
    });
    const defaultBranch = normalizeText(response?.data?.default_branch) || null;
    defaultBranchCache.set(repoKey, {
      defaultBranch,
      fetchedAt: Date.now(),
    });
    return defaultBranch;
  } catch {
    return null;
  }
};

const getRepoMetadata = async (octokit: Octokit, repo: ParsedGitHubRemote | null): Promise<Record<string, unknown> | null> => {
  const repoKey = normalizeRepoKey(repo?.owner, repo?.repo);
  if (!repoKey) {
    return null;
  }

  const cached = repoMetadataCache.get(repoKey);
  if (cached && Date.now() - cached.fetchedAt < REPO_DEFAULT_BRANCH_TTL_MS) {
    return cached.data;
  }

  try {
    const response = await octokit.rest.repos.get({
      owner: repo!.owner,
      repo: repo!.repo,
    });
    const data = response?.data ?? null;
    repoMetadataCache.set(repoKey, {
      data,
      fetchedAt: Date.now(),
    });
    return data;
  } catch (error: any) {
    if (error?.status === 403 || error?.status === 404) {
      repoMetadataCache.set(repoKey, {
        data: null,
        fetchedAt: Date.now(),
      });
      return null;
    }
    throw error;
  }
};

const resolveRemoteCandidates = async (
  directory: string,
  rankedRemoteNames: string[],
): Promise<{ remoteName: string; repo: ParsedGitHubRemote }[]> => {
  const results: { remoteName: string; repo: ParsedGitHubRemote }[] = [];
  const seenRepoKeys = new Set<string>();

  for (const remoteName of rankedRemoteNames) {
    const resolved = await resolveGitHubRepoFromDirectory(directory, remoteName).catch(() => ({ repo: null }));
    const repo = resolved?.repo || null;
    const repoKey = normalizeRepoKey(repo?.owner, repo?.repo);
    if (!repo || !repoKey || seenRepoKeys.has(repoKey)) {
      continue;
    }
    seenRepoKeys.add(repoKey);
    results.push({
      remoteName,
      repo,
    });
  }

  return results;
};

const expandRepoNetwork = async (
  octokit: Octokit,
  candidates: { remoteName: string; repo: ParsedGitHubRemote; priority: number }[],
): Promise<{ repo: ParsedGitHubRemote; remoteName: string; priority: number }[]> => {
  const expanded: { repo: ParsedGitHubRemote; remoteName: string; priority: number }[] = [];
  const seenRepoKeys = new Set<string>();

  const pushCandidate = (
    repo: ParsedGitHubRemote,
    remoteName: string,
    priority: number,
  ): void => {
    const repoKey = normalizeRepoKey(repo?.owner, repo?.repo);
    if (!repoKey || seenRepoKeys.has(repoKey)) {
      return;
    }
    seenRepoKeys.add(repoKey);
    expanded.push({ repo, remoteName, priority });
  };

  for (const candidate of candidates) {
    const metadata = await getRepoMetadata(octokit, candidate.repo);
    if (!metadata) {
      continue;
    }

    pushCandidate(candidate.repo, candidate.remoteName, candidate.priority);

    const parent = metadata?.parent;
    if (parent?.owner?.login && parent?.name) {
      pushCandidate(
        {
          owner: parent.owner.login,
          repo: parent.name,
          url: parent.html_url || `https://github.com/${parent.owner.login}/${parent.name}`,
        },
        candidate.remoteName,
        candidate.priority + 0.1,
      );
    }

    const source = metadata?.source;
    if (source?.owner?.login && source?.name) {
      pushCandidate(
        {
          owner: source.owner.login,
          repo: source.name,
          url: source.html_url || `https://github.com/${source.owner.login}/${source.name}`,
        },
        candidate.remoteName,
        candidate.priority + 0.2,
      );
    }
  }

  return expanded.sort((left, right) => left.priority - right.priority);
};

const safeListPulls = async (octokit: Octokit, options: Record<string, unknown>): Promise<Record<string, unknown>[]> => {
  try {
    const response = await octokit.rest.pulls.list(options);
    return Array.isArray(response?.data) ? response.data : [];
  } catch (error: any) {
    if (error?.status === 404 || error?.status === 403) {
      return [];
    }
    throw error;
  }
};

const parseRepoFromApiUrl = (value: unknown): { owner: string; repo: string } | null => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  try {
    const url = new URL(normalized);
    const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length < 2 || parts[0] !== "repos") {
      return null;
    }
    const owner = parts[1];
    const repo = parts[2];
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
};

const _searchApiDisabledRepos = new Map<string, number>();
const SEARCH_API_RETRY_MS = 5 * 60 * 1000;

const searchFallbackPr = async ({
  octokit,
  branch,
  repoNames,
}: {
  octokit: Octokit;
  branch: string;
  repoNames: string[];
}): Promise<{ repo: ParsedGitHubRemote; pr: Record<string, unknown> } | null> => {
  const repoKey = [...repoNames].sort().join(",").toLowerCase();

  const disabledAt = _searchApiDisabledRepos.get(repoKey);
  if (disabledAt && Date.now() - disabledAt < SEARCH_API_RETRY_MS) {
    return null;
  }

  const normalizedRepoNames = new Set(
    repoNames.map((name) => normalizeLower(name)).filter(Boolean),
  );

  for (const state of ["open", "closed"]) {
    let response: Record<string, unknown>;
    try {
      response = await octokit.rest.search.issuesAndPullRequests({
        q: `is:pr state:${state} head:${branch}`,
        per_page: 20,
      });
      _searchApiDisabledRepos.delete(repoKey);
    } catch (error: any) {
      if (error?.status === 403) {
        _searchApiDisabledRepos.set(repoKey, Date.now());
        return null;
      }
      if (error?.status === 404) {
        continue;
      }
      throw error;
    }

    const items: Record<string, unknown>[] = Array.isArray(response?.data?.items) ? response.data.items : [];
    for (const item of items) {
      const repo = parseRepoFromApiUrl(item?.repository_url);
      if (!repo) {
        continue;
      }
      if (normalizedRepoNames.size > 0 && !normalizedRepoNames.has(normalizeLower(repo.repo))) {
        continue;
      }
      try {
        const prResponse = await octokit.rest.pulls.get({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: item.number,
        });
        const pr = prResponse?.data;
        if (!pr || normalizeText(pr.head?.ref) !== branch) {
          continue;
        }
        return {
          repo: {
            owner: repo.owner,
            repo: repo.repo,
            url: `https://github.com/${repo.owner}/${repo.repo}`,
          },
          pr,
        };
      } catch (error: any) {
        if (error?.status === 403 || error?.status === 404) {
          continue;
        }
        throw error;
      }
    }
  }

  return null;
};

const findFirstMatchingPr = async ({
  octokit,
  target,
  branch,
  sourceCandidates,
}: {
  octokit: Octokit;
  target: { repo: ParsedGitHubRemote; remoteName: string };
  branch: string;
  sourceCandidates: { repo: ParsedGitHubRemote; remoteName: string }[];
}): Promise<Record<string, unknown> | null> => {
  const matcher = buildSourceMatcher(sourceCandidates);
  const sourceOwners: string[] = [];
  sourceCandidates.forEach((candidate) => pushUnique(sourceOwners, candidate.repo?.owner));

  const pickPreferred = (prs: Record<string, unknown>[]): Record<string, unknown> | null =>
    prs
      .filter((pr) => normalizeText(pr?.head?.ref) === branch)
      .filter((pr) => matcher.matches(pr, target.repo.repo))
      .sort((left, right) => matcher.compare(left, right, target.repo.repo))[0] ?? null;

  for (const state of ["open", "closed"]) {
    for (const owner of sourceOwners) {
      const directCandidates = await safeListPulls(octokit, {
        owner: target.repo.owner,
        repo: target.repo.repo,
        state,
        head: `${owner}:${branch}`,
        per_page: 100,
      });
      const direct = pickPreferred(directCandidates);
      if (direct) {
        return direct;
      }
    }

    const fallbackCandidates = await safeListPulls(octokit, {
      owner: target.repo.owner,
      repo: target.repo.repo,
      state,
      per_page: 100,
    });
    const fallback = pickPreferred(fallbackCandidates);
    if (fallback) {
      return fallback;
    }
  }

  return null;
};

export async function resolveGitHubPrStatus({
  octokit,
  directory,
  branch,
  remoteName,
}: ResolveGitHubPrStatusOptions): Promise<ResolvedPrStatus> {
  const normalizedBranch = normalizeText(branch);
  const normalizedRemoteName = normalizeText(remoteName) || "origin";

  const [status, remotes] = await Promise.all([
    getStatus(directory).catch(() => null),
    getRemotes(directory).catch(() => []),
  ]);

  const trackingRemoteName = parseTrackingRemoteName((status as any)?.tracking);
  const rankedRemoteNames = rankRemoteNames(
    Array.isArray(remotes) ? remotes.map((remote) => (remote as any)?.name).filter(Boolean) : [],
    normalizedRemoteName,
    trackingRemoteName,
  );

  const resolvedRemoteTargets = await resolveRemoteCandidates(directory, rankedRemoteNames.slice(0, 3));
  const resolvedTargets = await expandRepoNetwork(
    octokit,
    resolvedRemoteTargets.map((target, index) => ({ ...target, priority: index })),
  );
  if (resolvedTargets.length === 0) {
    return {
      repo: null,
      pr: null,
      defaultBranch: null,
      resolvedRemoteName: null,
    };
  }

  const sourceCandidates = resolvedTargets.slice();

  let fallbackRepo: ParsedGitHubRemote | null = resolvedTargets[0].repo;
  let fallbackRemoteName: string | null = resolvedTargets[0].remoteName;
  let fallbackDefaultBranch: string | null = await getRepoDefaultBranch(octokit, fallbackRepo);

  for (const target of resolvedTargets) {
    const defaultBranch = await getRepoDefaultBranch(octokit, target.repo);
    if (!fallbackRepo) {
      fallbackRepo = target.repo;
      fallbackRemoteName = target.remoteName;
      fallbackDefaultBranch = defaultBranch;
    }
    if (defaultBranch && defaultBranch === normalizedBranch) {
      continue;
    }

    const pr = await findFirstMatchingPr({
      octokit,
      target: { repo: target.repo, remoteName: target.remoteName },
      branch: normalizedBranch,
      sourceCandidates: sourceCandidates.map((t) => ({ repo: t.repo, remoteName: t.remoteName })),
    });
    if (pr) {
      return {
        repo: target.repo,
        pr,
        defaultBranch,
        resolvedRemoteName: target.remoteName,
      };
    }
  }

  const fallbackSearch = await searchFallbackPr({
    octokit,
    branch: normalizedBranch,
    repoNames: resolvedTargets.map((target) => target.repo.repo),
  });
  if (fallbackSearch) {
    return {
      repo: fallbackSearch.repo,
      pr: fallbackSearch.pr,
      defaultBranch: await getRepoDefaultBranch(octokit, fallbackSearch.repo),
      resolvedRemoteName: null,
    };
  }

  return {
    repo: fallbackRepo,
    pr: null,
    defaultBranch: fallbackDefaultBranch,
    resolvedRemoteName: fallbackRemoteName,
  };
}
