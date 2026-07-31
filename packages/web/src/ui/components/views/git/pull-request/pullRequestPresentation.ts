import type { GitHubPullRequestContextResult } from '@/lib/api/types';

export type PullRequestTimelineComment = {
  id: string;
  body: string;
  authorName: string;
  authorLogin: string | null;
  avatarUrl: string | null;
  createdAt?: string;
  context: string;
  path: string | null;
  line: number | null;
};

export const formatPullRequestTimestamp = (value?: string): string => {
  if (!value) {
    return '';
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
};

export const linkifyGitHubMentionsMarkdown = (
  content: string,
  connectedGitHubLogin: string,
): string => {
  const selfLoginLower = connectedGitHubLogin.trim().toLowerCase();
  const mentionRegex = /(^|[^\w`])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}))/g;

  return content.replace(mentionRegex, (_match, prefix: string, username: string) => {
    const usernameLower = username.toLowerCase();
    const selfTag = selfLoginLower === usernameLower ? '?oc-self-mention=1' : '';
    return `${prefix}[@${username}](https://github.com/${usernameLower}${selfTag})`;
  });
};

export const buildPullRequestTimelineComments = (
  details: GitHubPullRequestContextResult | null,
): PullRequestTimelineComment[] => {
  const issueComments = (details?.issueComments ?? []).map((comment) => ({
    id: `issue-${comment.id}`,
    body: comment.body || '',
    authorName: comment.author?.name || comment.author?.login || 'Unknown author',
    authorLogin: comment.author?.login || null,
    avatarUrl: comment.author?.avatarUrl || null,
    createdAt: comment.createdAt,
    context: 'General comment',
    path: null,
    line: null,
  }));

  const reviewComments = (details?.reviewComments ?? []).map((comment) => ({
    id: `review-${comment.id}`,
    body: comment.body || '',
    authorName: comment.author?.name || comment.author?.login || 'Unknown author',
    authorLogin: comment.author?.login || null,
    avatarUrl: comment.author?.avatarUrl || null,
    createdAt: comment.createdAt,
    context: 'Code review comment',
    path: comment.path || null,
    line: comment.line ?? null,
  }));

  return [...issueComments, ...reviewComments].sort((a, b) => {
    const aTimestamp = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTimestamp = b.createdAt ? Date.parse(b.createdAt) : 0;
    return (Number.isFinite(aTimestamp) ? aTimestamp : 0)
      - (Number.isFinite(bTimestamp) ? bTimestamp : 0);
  });
};
