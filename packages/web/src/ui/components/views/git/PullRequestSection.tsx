import React from 'react';
import {
  RiChat4Line,
  RiCheckLine,
  RiCheckboxCircleLine,
  RiAiGenerate2,
  RiArrowDownSLine,
  RiCloseLine,
  RiEditLine,
  RiErrorWarningLine,
  RiExternalLinkLine,
  RiGitClosePullRequestLine,
  RiGitMergeLine,
  RiGitPrDraftLine,
  RiGitPullRequestLine,
  RiInformationLine,
  RiLoader4Line,
} from '@remixicon/react';
import { toast } from '@/components/ui';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { generatePullRequestDescription } from '@/lib/git/gitApi';
import { renderPromptTemplate } from '@/lib/tools/promptTemplates';
import { openExternalUrl } from '@/lib/url';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useDeviceInfo } from '@/lib/device';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { useNavigationStore } from '@/stores/useNavigationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDialogStore } from '@/stores/useDialogStore';
import { useProviderConfigStore } from '@/stores/config/useProviderConfigStore';
import { useAgentConfigStore } from '@/stores/agents/useAgentConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useGitHubAuthStore } from '@/stores/github/useGitHubAuthStore';
import { getGitHubPrStatusKey, useGitHubPrStatusStore } from '@/stores/github/useGitHubPrStatusStore';
import type {
  GitHubPullRequest,
  GitHubPullRequestContextResult,
  GitHubPullRequestStatus,
  GitRemote,
} from '@/lib/api/types';
import {
  PullRequestChecksDialog,
  PullRequestCommentsDialog,
} from './pull-request/PullRequestDialogs';
import type { PullRequestTimelineComment } from './pull-request/pullRequestPresentation';

type MergeMethod = 'merge' | 'squash' | 'rebase';

const statusColor = (state: string | undefined | null): string => {
  switch (state) {
    case 'success':
      return 'bg-[color:var(--status-success)]';
    case 'failure':
      return 'bg-[color:var(--status-error)]';
    case 'pending':
      return 'bg-[color:var(--status-warning)]';
    default:
      return 'bg-muted-foreground/40';
  }
};

const getPrVisualState = (status: GitHubPullRequestStatus | null): 'draft' | 'open' | 'blocked' | 'merged' | 'closed' | null => {
  const pr = status?.pr;
  if (!pr) {
    return null;
  }
  if (pr.state === 'merged') {
    return 'merged';
  }
  if (pr.state === 'closed') {
    return 'closed';
  }
  if (pr.draft) {
    return 'draft';
  }
  const checksFailed = status?.checks?.state === 'failure';
  const mergeableState = typeof pr.mergeableState === 'string' ? pr.mergeableState : '';
  const notMergeable = pr.mergeable === false || mergeableState === 'blocked' || mergeableState === 'dirty';
  if (checksFailed || notMergeable) {
    return 'blocked';
  }
  return 'open';
};

const PR_ACTION_REFRESH_DELAYS_MS = [2_000, 5_000] as const;

const branchToTitle = (branch: string): string => {
  return branch
    .replace(/^refs\/heads\//, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const normalizeBranchRef = (value: string): string => {
  let normalized = value.trim();
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('refs/heads/')) {
    normalized = normalized.slice('refs/heads/'.length);
  }
  if (normalized.startsWith('heads/')) {
    normalized = normalized.slice('heads/'.length);
  }
  if (normalized.startsWith('remotes/')) {
    normalized = normalized.slice('remotes/'.length);
  }
  return normalized;
};

const remoteBranchToName = (value: string, remoteName: string | null): string => {
  const normalized = normalizeBranchRef(value);
  if (!normalized || normalized.includes('->')) {
    return '';
  }

  if (remoteName) {
    const prefix = `${remoteName}/`;
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length).trim();
    }
    return '';
  }

  const slashIndex = normalized.indexOf('/');
  if (slashIndex > 0) {
    return normalized.slice(slashIndex + 1).trim();
  }
  return normalized;
};

const getPullRequestSnapshotKey = (directory: string, branch: string): string => `${directory}::${branch}`;

type PullRequestDraftSnapshot = {
  title: string;
  body: string;
  draft: boolean;
  additionalContext: string;
  targetBaseBranch?: string;
  selectedRemoteName?: string;
};

const getTrackingRemoteName = (trackingBranch: string | null | undefined): string => {
  const normalized = String(trackingBranch || '').trim();
  if (!normalized) {
    return '';
  }

  const slashIndex = normalized.indexOf('/');
  if (slashIndex <= 0) {
    return '';
  }

  return normalized.slice(0, slashIndex).trim();
};

const pickInitialPrRemote = (
  remotes: GitRemote[],
  options: { selectedRemoteName?: string; trackingBranch?: string }
): GitRemote | null => {
  if (remotes.length === 0) {
    return null;
  }

  const selectedRemoteName = String(options.selectedRemoteName || '').trim();
  if (selectedRemoteName) {
    const fromSnapshot = remotes.find((remote) => remote.name === selectedRemoteName);
    if (fromSnapshot) {
      return fromSnapshot;
    }
  }

  const trackingRemoteName = getTrackingRemoteName(options.trackingBranch);
  if (trackingRemoteName) {
    const maybeUpstream =
      trackingRemoteName === 'origin'
        ? remotes.find((remote) => remote.name === 'upstream')
        : null;
    if (maybeUpstream) {
      return maybeUpstream;
    }

    const fromTracking = remotes.find((remote) => remote.name === trackingRemoteName);
    if (fromTracking) {
      return fromTracking;
    }
  }

  const originRemote = remotes.find((remote) => remote.name === 'origin');
  if (originRemote) {
    return originRemote;
  }

  return remotes[0] ?? null;
};

const isEphemeralPrRemote = (name: string): boolean => name.startsWith('pr-');

const rankRemotesForAutoSelect = (
  remotes: GitRemote[],
  trackingBranch?: string,
): GitRemote[] => {
  const trackingRemote = getTrackingRemoteName(trackingBranch);
  const byName = new Map(remotes.map((remote) => [remote.name, remote]));
  const ordered: GitRemote[] = [];
  const pushUnique = (remote: GitRemote | null | undefined) => {
    if (!remote) return;
    if (ordered.some((item) => item.name === remote.name)) return;
    ordered.push(remote);
  };

  if (trackingRemote) {
    pushUnique(byName.get(trackingRemote));
  }
  pushUnique(byName.get('upstream'));
  pushUnique(byName.get('origin'));

  remotes
    .filter((remote) => !isEphemeralPrRemote(remote.name))
    .forEach((remote) => pushUnique(remote));
  remotes.forEach((remote) => pushUnique(remote));

  return ordered;
};

type ChatDispatchTarget = {
  sessionId: string;
  providerID: string;
  modelID: string;
  currentAgentName: string | null;
  currentVariant: string | null;
};

const pullRequestDraftSnapshots = new Map<string, PullRequestDraftSnapshot>();

const openExternal = openExternalUrl;

export const PullRequestSection: React.FC<{
  directory: string;
  branch: string;
  baseBranch: string;
  trackingBranch?: string;
  remotes?: GitRemote[];
  remoteBranches?: string[];
  onGeneratedDescription?: () => void;
}> = ({ directory, branch, baseBranch, trackingBranch, remotes = [], remoteBranches = [], onGeneratedDescription }) => {
  const { github } = useRuntimeAPIs();
  const githubAuthStatus = useGitHubAuthStore((state) => state.status);
  const githubAuthChecked = useGitHubAuthStore((state) => state.hasChecked);
  const setSettingsDialogOpen = useDialogStore((state) => state.setSettingsDialogOpen);
  const setSettingsPage = useUIStore((state) => state.setSettingsPage);
  const setActiveMainTab = useNavigationStore((state) => state.setActiveMainTab);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const { isMobile, hasTouchInput } = useDeviceInfo();

  const openGitHubSettings = React.useCallback(() => {
    setSettingsPage('github');
    setSettingsDialogOpen(true);
  }, [setSettingsDialogOpen, setSettingsPage]);

  const snapshotKey = React.useMemo(() => getPullRequestSnapshotKey(directory, branch), [directory, branch]);
  const initialSnapshot = React.useMemo(
    () => pullRequestDraftSnapshots.get(snapshotKey) ?? null,
    [snapshotKey]
  );
  const ensurePrStatusEntry = useGitHubPrStatusStore((state) => state.ensureEntry);
  const setPrStatusParams = useGitHubPrStatusStore((state) => state.setParams);
  const startPrStatusWatching = useGitHubPrStatusStore((state) => state.startWatching);
  const stopPrStatusWatching = useGitHubPrStatusStore((state) => state.stopWatching);
  const refreshPrStatus = useGitHubPrStatusStore((state) => state.refresh);
  const updatePrStatus = useGitHubPrStatusStore((state) => state.updateStatus);

  const [title, setTitle] = React.useState(() => initialSnapshot?.title ?? branchToTitle(branch));
  const [body, setBody] = React.useState(() => initialSnapshot?.body ?? '');
  const [draft, setDraft] = React.useState(() => initialSnapshot?.draft ?? false);
  const [additionalContext, setAdditionalContext] = React.useState(() => initialSnapshot?.additionalContext ?? '');
  const [targetBaseBranch, setTargetBaseBranch] = React.useState(() => {
    const fromSnapshot = typeof initialSnapshot?.targetBaseBranch === 'string'
      ? normalizeBranchRef(initialSnapshot.targetBaseBranch)
      : '';
    if (fromSnapshot) {
      return fromSnapshot;
    }
    return normalizeBranchRef(baseBranch);
  });
  const [mergeMethod, setMergeMethod] = React.useState<MergeMethod>('squash');

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isMerging, setIsMerging] = React.useState(false);
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);
  const [isEditingPr, setIsEditingPr] = React.useState(false);
  const [hydratingPrBodyKey, setHydratingPrBodyKey] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editBody, setEditBody] = React.useState('');

  const [isContextOpen, setIsContextOpen] = React.useState(false);
  const [isContextSheetOpen, setIsContextSheetOpen] = React.useState(false);
  const [selectedRemote, setSelectedRemote] = React.useState<GitRemote | null>(() =>
    pickInitialPrRemote(remotes, {
      selectedRemoteName: initialSnapshot?.selectedRemoteName,
      trackingBranch,
    })
  );

  const prStatusKey = React.useMemo(
    () => getGitHubPrStatusKey(directory, branch),
    [directory, branch],
  );
  const statusEntry = useGitHubPrStatusStore((state) => state.entries[prStatusKey]);

  const isLoading = statusEntry?.isLoading ?? false;
  const status = statusEntry?.status ?? null;
  const error = statusEntry?.error ?? null;
  const isInitialStatusResolved = statusEntry?.isInitialStatusResolved ?? false;

  const availableBaseBranches = React.useMemo(() => {
    const selectedRemoteName = selectedRemote?.name?.trim() || null;
    const unique = new Set<string>();

    for (const remoteBranch of remoteBranches) {
      const branchName = remoteBranchToName(remoteBranch, selectedRemoteName);
      if (!branchName || branchName === 'HEAD') {
        continue;
      }
      unique.add(branchName);
    }

    const defaultBase = normalizeBranchRef(baseBranch);
    if (defaultBase && defaultBase !== 'HEAD') {
      unique.add(defaultBase);
    }

    const currentTarget = normalizeBranchRef(targetBaseBranch);
    if (currentTarget && currentTarget !== 'HEAD') {
      unique.add(currentTarget);
    }

    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [baseBranch, remoteBranches, selectedRemote?.name, targetBaseBranch]);

  const hasMultipleRemotes = remotes.length > 1;

  // Update selected remote when remotes change
  React.useEffect(() => {
    if (remotes.length === 0) {
      if (selectedRemote) {
        setSelectedRemote(null);
      }
      return;
    }

    if (!selectedRemote || !remotes.some((remote) => remote.name === selectedRemote.name)) {
      setSelectedRemote(
        pickInitialPrRemote(remotes, {
          selectedRemoteName: initialSnapshot?.selectedRemoteName,
          trackingBranch,
        })
      );
    }
  }, [initialSnapshot?.selectedRemoteName, remotes, selectedRemote, trackingBranch]);

  React.useEffect(() => {
    const normalizedBase = normalizeBranchRef(baseBranch);
    if (!targetBaseBranch && normalizedBase) {
      setTargetBaseBranch(normalizedBase);
      return;
    }

    if (availableBaseBranches.length === 0) {
      return;
    }

    if (!availableBaseBranches.includes(targetBaseBranch)) {
      const fallback = availableBaseBranches.includes(normalizedBase)
        ? normalizedBase
        : availableBaseBranches[0];
      if (fallback) {
        setTargetBaseBranch(fallback);
      }
    }
  }, [availableBaseBranches, baseBranch, targetBaseBranch]);

  const [checksDialogOpen, setChecksDialogOpen] = React.useState(false);
  const [checkDetails, setCheckDetails] = React.useState<GitHubPullRequestContextResult | null>(null);
  const [isLoadingCheckDetails, setIsLoadingCheckDetails] = React.useState(false);
  const [commentsDialogOpen, setCommentsDialogOpen] = React.useState(false);
  const [commentsDetails, setCommentsDetails] = React.useState<GitHubPullRequestContextResult | null>(null);
  const [isLoadingCommentsDetails, setIsLoadingCommentsDetails] = React.useState(false);

  const attemptedBodyHydrationRef = React.useRef<Set<string>>(new Set());
  const lastSyncedPrNumberRef = React.useRef<number | null>(null);
  const didUserOverrideRemoteRef = React.useRef(false);
  const autoRemoteProbeDoneRef = React.useRef<Set<string>>(new Set());
  const pendingActionRefreshTimersRef = React.useRef<number[]>([]);

  const canShow = Boolean(directory && branch && baseBranch && branch !== baseBranch);

  const pr = status?.pr ?? null;
  const currentPrBodyHydrationKey = pr ? `${directory}#${pr.number}` : null;
  const isHydratingCurrentPrBody = Boolean(
    currentPrBodyHydrationKey && hydratingPrBodyKey === currentPrBodyHydrationKey,
  );

  React.useEffect(() => {
    if (!github?.prContext || !pr) {
      return;
    }

    if (typeof pr.body === 'string' && pr.body.length > 0) {
      return;
    }

    const hydrationKey = `${directory}#${pr.number}`;
    if (attemptedBodyHydrationRef.current.has(hydrationKey)) {
      return;
    }
    attemptedBodyHydrationRef.current.add(hydrationKey);
    setHydratingPrBodyKey(hydrationKey);

    let cancelled = false;
    void github.prContext(directory, pr.number, { includeDiff: false, includeCheckDetails: false })
      .then((ctx) => {
        if (cancelled) {
          return;
        }
        const ctxPr = ctx?.pr;
        if (!ctxPr) {
          return;
        }
        updatePrStatus(prStatusKey, (prev) => {
          if (!prev?.pr || prev.pr.number !== pr.number) {
            return prev;
          }
          return {
            ...prev,
            pr: {
              ...prev.pr,
              body: ctxPr.body || '',
            },
          };
        });
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) {
          return;
        }
        setHydratingPrBodyKey((prev) => (prev === hydrationKey ? null : prev));
      });

    return () => {
      cancelled = true;
    };
  }, [directory, github, pr, prStatusKey, updatePrStatus]);

  React.useEffect(() => {
    if (!pr) {
      setIsEditingPr(false);
      setEditTitle('');
      setEditBody('');
      lastSyncedPrNumberRef.current = null;
      return;
    }

    const numberChanged =
      lastSyncedPrNumberRef.current !== null && lastSyncedPrNumberRef.current !== pr.number;

    if (numberChanged) {
      setIsEditingPr(false);
    }

    if (!isEditingPr || numberChanged) {
      setEditTitle(pr.title || '');
      setEditBody(pr.body || '');
    }

    lastSyncedPrNumberRef.current = pr.number;
  }, [isEditingPr, pr]);

  const openChecksDialog = React.useCallback(async () => {
    if (!github?.prContext) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    if (!pr) return;

    setChecksDialogOpen(true);
    setIsLoadingCheckDetails(true);
    try {
      const ctx = await github.prContext(directory, pr.number, {
        includeDiff: false,
        includeCheckDetails: true,
      });
      setCheckDetails(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to load check details', { description: message });
    } finally {
      setIsLoadingCheckDetails(false);
    }
  }, [directory, github, pr]);

  const openCommentsDialog = React.useCallback(async () => {
    if (!github?.prContext) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    if (!pr) return;

    setCommentsDialogOpen(true);
    setIsLoadingCommentsDetails(true);
    try {
      const ctx = await github.prContext(directory, pr.number, {
        includeDiff: false,
        includeCheckDetails: false,
      });
      setCommentsDetails(ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to load comments', { description: message });
    } finally {
      setIsLoadingCommentsDetails(false);
    }
  }, [directory, github, pr]);

  const connectedGitHubLogin = React.useMemo(() => {
    const login = githubAuthStatus?.user?.login;
    return typeof login === 'string' ? login.trim() : '';
  }, [githubAuthStatus]);

  const resolveChatDispatchTarget = React.useCallback((): ChatDispatchTarget | null => {
    if (!currentSessionId) {
      toast.error('No active session', { description: 'Open a chat session first.' });
      return null;
    }

    const { currentProviderId, currentModelId } = useProviderConfigStore.getState();
    const { currentAgentName } = useAgentConfigStore.getState();
    const { currentVariant } = useProviderConfigStore.getState();
    const lastUsedProvider = useSelectionStore.getState().lastUsedProvider;
    const providerID = currentProviderId || lastUsedProvider?.providerID;
    const modelID = currentModelId || lastUsedProvider?.modelID;
    if (!providerID || !modelID) {
      toast.error('No model selected');
      return null;
    }

    return {
      sessionId: currentSessionId,
      providerID,
      modelID,
      currentAgentName: currentAgentName ?? null,
      currentVariant: currentVariant ?? null,
    };
  }, [currentSessionId]);

  const dispatchSyntheticPrompt = React.useCallback((
    target: ChatDispatchTarget,
    visibleText: string,
    instructionsText: string,
    payloadText: string,
  ) => {
    void useSessionUIStore.getState().sendMessage(
      visibleText,
      target.providerID,
      target.modelID,
      target.currentAgentName ?? undefined,
      undefined,
      undefined,
      [
        { text: instructionsText, synthetic: true },
        { text: payloadText, synthetic: true },
      ],
      target.currentVariant ?? undefined,
    ).catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to send message', { description: message });
    });
  }, []);

  const sendFailedChecksToChat = React.useCallback(async () => {
    setActiveMainTab('chat');

    if (!github?.prContext) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    if (!directory || !pr) return;
    const target = resolveChatDispatchTarget();
    if (!target) {
      return;
    }

    try {
      const context = await github.prContext(directory, pr.number, { includeDiff: false, includeCheckDetails: true });
      const runs = context.checkRuns ?? [];
      const failed = runs.filter((r) => {
        const conclusion = typeof r.conclusion === 'string' ? r.conclusion.toLowerCase() : '';
        if (!conclusion) return false;
        return !['success', 'neutral', 'skipped'].includes(conclusion);
      });

      if (failed.length === 0) {
        toast.message('No failed checks');
        return;
      }

      const visibleText = renderPromptTemplate('github.pr.checks.review.visible');
      const instructionsText = renderPromptTemplate('github.pr.checks.review.instructions');
      const failedAnnotations = failed.flatMap((run) => {
        const annotations = Array.isArray(run.annotations) ? run.annotations : [];
        return annotations.map((annotation) => ({
          run: run.name,
          level: annotation.level,
          title: annotation.title,
          path: annotation.path,
          startLine: annotation.startLine,
          endLine: annotation.endLine,
          message: annotation.message,
          rawDetails: annotation.rawDetails,
        }));
      });
      const payloadText = `GitHub PR failed checks (JSON)\n${JSON.stringify({
        repo: context.repo ?? null,
        pr: context.pr ?? null,
        failedChecks: failed,
        failedAnnotations,
      }, null, 2)}`;

      dispatchSyntheticPrompt(target, visibleText, instructionsText, payloadText);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to load checks', { description: message });
    }
  }, [directory, dispatchSyntheticPrompt, github, pr, resolveChatDispatchTarget, setActiveMainTab]);

  const sendCommentsToChat = React.useCallback(async () => {
    setActiveMainTab('chat');

    if (!github?.prContext) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    if (!directory || !pr) return;
    const target = resolveChatDispatchTarget();
    if (!target) {
      return;
    }

    try {
      const context = await github.prContext(directory, pr.number, { includeDiff: false, includeCheckDetails: false });
      const issueComments = context.issueComments ?? [];
      const reviewComments = context.reviewComments ?? [];
      const total = issueComments.length + reviewComments.length;
      if (total === 0) {
        toast.message('No PR comments');
        return;
      }

      const visibleText = renderPromptTemplate('github.pr.comments.review.visible');
      const instructionsText = renderPromptTemplate('github.pr.comments.review.instructions');
      const payloadText = `GitHub PR comments (JSON)\n${JSON.stringify({
        repo: context.repo ?? null,
        pr: context.pr ?? null,
        issueComments,
        reviewComments,
      }, null, 2)}`;

      dispatchSyntheticPrompt(target, visibleText, instructionsText, payloadText);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to load PR comments', { description: message });
    }
  }, [directory, dispatchSyntheticPrompt, github, pr, resolveChatDispatchTarget, setActiveMainTab]);

  const sendSingleCommentToChat = React.useCallback(async (comment: PullRequestTimelineComment) => {
    setCommentsDialogOpen(false);
    setActiveMainTab('chat');

    const target = resolveChatDispatchTarget();
    if (!target) {
      return;
    }

    const visibleText = renderPromptTemplate('github.pr.comment.single.visible');
    const instructionsText = renderPromptTemplate('github.pr.comment.single.instructions');
    const payloadText = `GitHub PR comment (JSON)\n${JSON.stringify({
      repo: commentsDetails?.repo ?? null,
      pr: commentsDetails?.pr ?? pr ?? null,
      comment,
    }, null, 2)}`;

    dispatchSyntheticPrompt(target, visibleText, instructionsText, payloadText);
  }, [commentsDetails, dispatchSyntheticPrompt, pr, resolveChatDispatchTarget, setActiveMainTab]);

  const refresh = React.useCallback(async (options?: { force?: boolean; onlyExistingPr?: boolean; silent?: boolean; markInitialResolved?: boolean }) => {
    await refreshPrStatus(prStatusKey, options);
  }, [prStatusKey, refreshPrStatus]);

  const scheduleActionRefresh = React.useCallback(() => {
    pendingActionRefreshTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    pendingActionRefreshTimersRef.current = PR_ACTION_REFRESH_DELAYS_MS.map((delayMs) => window.setTimeout(() => {
      void refresh({ force: true, silent: true, markInitialResolved: true });
    }, delayMs));
  }, [refresh]);

  // Refetch PR status when selected remote changes
  const handleRemoteChange = React.useCallback((remote: GitRemote) => {
    didUserOverrideRemoteRef.current = true;
    setSelectedRemote((prev) => (prev?.name === remote.name ? prev : remote));
  }, []);

  React.useEffect(() => {
    if (!github?.prStatus || !canShow || remotes.length <= 1) {
      return;
    }
    if (didUserOverrideRemoteRef.current) {
      return;
    }
    if (status?.pr) {
      return;
    }

    const probeKey = `${snapshotKey}::${selectedRemote?.name ?? ''}`;
    if (autoRemoteProbeDoneRef.current.has(probeKey)) {
      return;
    }
    autoRemoteProbeDoneRef.current.add(probeKey);

    const candidates = rankRemotesForAutoSelect(remotes, trackingBranch)
      .filter((remote) => remote.name !== selectedRemote?.name);
    if (candidates.length === 0) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      for (const candidate of candidates) {
        if (cancelled) {
          return;
        }
        try {
          const next = await github.prStatus(directory, branch, candidate.name);
          if (!next?.pr) {
            continue;
          }
          if (cancelled) {
            return;
          }
          setSelectedRemote((prev) => (prev?.name === candidate.name ? prev : candidate));
          return;
        } catch {
          // ignore
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [branch, canShow, directory, github, remotes, selectedRemote?.name, snapshotKey, status?.pr, trackingBranch]);

  React.useEffect(() => {
    ensurePrStatusEntry(prStatusKey);
    setPrStatusParams(prStatusKey, {
      directory,
      branch,
      remoteName: selectedRemote?.name ?? null,
      canShow,
      github,
      githubAuthChecked,
      githubConnected: githubAuthStatus?.connected ?? null,
    });
  }, [
    branch,
    canShow,
    directory,
    ensurePrStatusEntry,
    github,
    githubAuthChecked,
    githubAuthStatus?.connected,
    prStatusKey,
    selectedRemote?.name,
    setPrStatusParams,
  ]);

  React.useEffect(() => {
    startPrStatusWatching(prStatusKey);
    return () => {
      stopPrStatusWatching(prStatusKey);
    };
  }, [prStatusKey, startPrStatusWatching, stopPrStatusWatching]);

  React.useEffect(() => {
    const snapshot = pullRequestDraftSnapshots.get(snapshotKey) ?? null;
    setTitle(snapshot?.title ?? branchToTitle(branch));
    setBody(snapshot?.body ?? '');
    setDraft(snapshot?.draft ?? false);
    setTargetBaseBranch(snapshot?.targetBaseBranch ? normalizeBranchRef(snapshot.targetBaseBranch) : normalizeBranchRef(baseBranch));
    const nextRemote = pickInitialPrRemote(remotes, {
      selectedRemoteName: snapshot?.selectedRemoteName,
      trackingBranch,
    });
    setSelectedRemote((prev) => (prev?.name === nextRemote?.name ? prev : nextRemote));
  }, [baseBranch, branch, remotes, snapshotKey, trackingBranch]);

  React.useEffect(() => {
    void refresh({ markInitialResolved: true });
  }, [prStatusKey, refresh]);

  React.useEffect(() => {
    if (!canShow || !selectedRemote?.name) {
      return;
    }
    void refresh({ force: true, silent: true, markInitialResolved: true });
  }, [canShow, refresh, selectedRemote?.name]);

  React.useEffect(() => {
    const resolvedRemoteName = status?.resolvedRemoteName?.trim();
    if (!resolvedRemoteName || didUserOverrideRemoteRef.current) {
      return;
    }
    const resolvedRemote = remotes.find((candidate) => candidate.name === resolvedRemoteName);
    if (!resolvedRemote) {
      return;
    }
    setSelectedRemote((prev) => (prev?.name === resolvedRemote.name ? prev : resolvedRemote));
  }, [remotes, status?.resolvedRemoteName]);

  React.useEffect(() => {
    const isTerminal = status?.pr?.state === 'closed' || status?.pr?.state === 'merged';
    const lastRefreshAt = statusEntry?.lastRefreshAt ?? 0;
    const isStale = Date.now() - lastRefreshAt > 60_000;
    const shouldRefresh = !isTerminal && isStale;

    const onFocus = () => {
      if (shouldRefresh) {
        void refresh({ force: true, silent: true });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (shouldRefresh) {
          void refresh({ force: true, silent: true });
        }
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, status?.pr?.state, statusEntry?.lastRefreshAt]);

  React.useEffect(() => {
    if (githubAuthChecked && githubAuthStatus?.connected === false) {
      void refresh({ force: true, silent: true, markInitialResolved: true });
    }
  }, [githubAuthChecked, githubAuthStatus, refresh]);

  React.useEffect(() => {
    if (!directory || !branch) {
      return;
    }
    pullRequestDraftSnapshots.set(snapshotKey, {
      title,
      body,
      draft,
      additionalContext,
      targetBaseBranch,
      selectedRemoteName: selectedRemote?.name,
    });
  }, [snapshotKey, title, body, draft, additionalContext, targetBaseBranch, selectedRemote?.name, directory, branch]);

  React.useEffect(() => {
    const pendingActionRefreshTimers = pendingActionRefreshTimersRef.current;
    return () => {
      pendingActionRefreshTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      pendingActionRefreshTimersRef.current = [];
    };
  }, []);

  const generateDescription = React.useCallback(async () => {
    if (isGenerating) return;
    if (!directory) return;
    setIsGenerating(true);
    try {
      const payload: { base: string; head: string; context?: string; files?: string[] } = {
        base: targetBaseBranch,
        head: branch,
      };
      if (additionalContext) {
        payload.context = additionalContext;
      }
      const generated = await generatePullRequestDescription(directory, payload);

      if (generated.title?.trim()) {
        setTitle(generated.title.trim());
      }
      if (generated.body?.trim()) {
        setBody(generated.body.trim());
      }
      onGeneratedDescription?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to generate description', { description: message });
    } finally {
      setIsGenerating(false);
    }
  }, [additionalContext, branch, directory, isGenerating, onGeneratedDescription, targetBaseBranch]);

  const createPr = React.useCallback(async () => {
    if (!github?.prCreate) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Title is required');
      return;
    }

    const trimmedBase = targetBaseBranch.trim();
    if (!trimmedBase) {
      toast.error('Base branch is required');
      return;
    }
    if (trimmedBase === branch) {
      toast.error('Base branch must differ from head branch');
      return;
    }

    setIsCreating(true);
    try {
      // Let the server determine the head source from tracking info
      // The server will check the branch's tracking remote and use that
      const pr = await github.prCreate({
        directory,
        title: trimmedTitle,
        head: branch,
        base: trimmedBase,
        ...(body.trim() ? { body } : {}),
        draft,
        ...(selectedRemote ? { remote: selectedRemote.name } : {}),
      });
      toast.success('PR created');
      updatePrStatus(prStatusKey, (prev) => (prev ? { ...prev, pr } : prev));
      await refresh({ force: true });
      scheduleActionRefresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to create PR', { description: message });
    } finally {
      setIsCreating(false);
    }
  }, [body, branch, directory, draft, github, prStatusKey, refresh, scheduleActionRefresh, selectedRemote, targetBaseBranch, title, updatePrStatus]);

  const mergePr = React.useCallback(async (pr: GitHubPullRequest) => {
    if (!github?.prMerge) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    setIsMerging(true);
    try {
      const result = await github.prMerge({ directory, number: pr.number, method: mergeMethod });
      if (result.merged) {
        toast.success('PR merged');
      } else {
        toast.message('PR not merged', { description: result.message || 'Not mergeable' });
      }
      await refresh({ force: true });
      scheduleActionRefresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Merge failed', { description: message });
      if (pr.url) {
        void openExternal(pr.url);
      }
    } finally {
      setIsMerging(false);
    }
  }, [directory, github, mergeMethod, refresh, scheduleActionRefresh]);

  const markReady = React.useCallback(async (pr: GitHubPullRequest) => {
    if (!github?.prReady) {
      toast.error('GitHub runtime API unavailable');
      return;
    }
    setIsMarkingReady(true);
    try {
      await github.prReady({ directory, number: pr.number });
      toast.success('Marked ready for review');
      await refresh({ force: true });
      scheduleActionRefresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to mark ready', { description: message });
      if (pr.url) {
        void openExternal(pr.url);
      }
    } finally {
      setIsMarkingReady(false);
    }
  }, [directory, github, refresh, scheduleActionRefresh]);

  const updatePr = React.useCallback(async (pr: GitHubPullRequest) => {
    if (!github?.prUpdate) {
      toast.error('GitHub runtime API unavailable');
      return;
    }

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      toast.error('Title is required');
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await github.prUpdate({
        directory,
        number: pr.number,
        title: trimmedTitle,
        body: editBody,
      });
      updatePrStatus(prStatusKey, (prev) => (prev
        ? {
            ...prev,
            pr: {
              ...(prev.pr ?? pr),
              ...updated,
            },
          }
        : prev));
      setIsEditingPr(false);
      toast.success('PR updated');
      await refresh({ force: true });
      scheduleActionRefresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error('Failed to update PR', { description: message });
    } finally {
      setIsUpdating(false);
    }
  }, [directory, editBody, editTitle, github, prStatusKey, refresh, scheduleActionRefresh, updatePrStatus]);

  if (!canShow) {
    return null;
  }

  const repoUrl = status?.repo?.url || null;
  const checks = status?.checks ?? null;
  const canMerge = Boolean(status?.canMerge);
  const isConnected = Boolean(status?.connected);
  const shouldShowConnectionNotice = githubAuthChecked && status?.connected === false;
  const prVisualState = getPrVisualState(status);
  const prColorVar = prVisualState ? `var(--pr-${prVisualState})` : 'var(--status-info)';
  const PrStateIcon = prVisualState === 'draft'
    ? RiGitPrDraftLine
    : prVisualState === 'merged'
      ? RiGitMergeLine
      : prVisualState === 'closed'
        ? RiGitClosePullRequestLine
        : RiGitPullRequestLine;

  const containerClassName = 'border-0 bg-transparent rounded-none';
  const headerClassName = 'px-0 py-3 border-b border-border/40 flex flex-col gap-1';
  const bodyClassName = 'flex flex-col gap-3 py-3';

  return (
    <section className={containerClassName}>
      <div className={headerClassName}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {pr ? (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 hover:bg-interactive-hover/60"
                    onClick={() => void openExternal(pr.url)}
                    aria-label="Open PR on GitHub"
                  >
                    <PrStateIcon className="size-4 shrink-0" style={{ color: prColorVar }} />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>Open PR on GitHub</p></TooltipContent>
              </Tooltip>
            ) : (
              <PrStateIcon className="size-4 shrink-0" style={{ color: 'var(--surface-muted-foreground)' }} />
            )}
            <h3 className="typography-ui-header font-semibold text-foreground truncate">Pull Request</h3>
            {pr ? (
              <span className="typography-meta text-muted-foreground truncate">#{pr.number}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? <RiLoader4Line className="size-4 animate-spin text-muted-foreground" /> : null}
            {checks ? (
              <span className="inline-flex items-center gap-2 typography-micro text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${statusColor(checks.state)}`} />
                {checks.total > 0 ? `${checks.success}/${checks.total} checks` : `${checks.state} checks`}
              </span>
            ) : null}
            {hasMultipleRemotes ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" className="gap-1">
                    <span className="typography-micro">{selectedRemote?.name}</span>
                    <RiArrowDownSLine className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  {remotes.map((remote) => (
                    <DropdownMenuItem
                      key={remote.name}
                      onSelect={() => handleRemoteChange(remote)}
                    >
                      <div className="flex flex-col">
                        <span className="typography-ui-label text-foreground">
                          {remote.name}
                          {remote.name === selectedRemote?.name && (
                            <span className="ml-2 text-primary">✓</span>
                          )}
                        </span>
                        <span className="typography-meta text-muted-foreground truncate">
                          {remote.pushUrl}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        {pr ? (
          <div className="typography-micro text-muted-foreground">
            <span style={{ color: prColorVar }}>
              {pr.state}{pr.draft ? ' (draft)' : ''}
            </span>
            {pr.mergeable === false ? ' · not mergeable' : ''}
            {pr.state === 'open' && typeof pr.mergeableState === 'string' && pr.mergeableState && pr.mergeableState !== 'unknown'
              ? ` · ${pr.mergeableState}`
              : ''}
          </div>
        ) : null}
      </div>

      <div className={bodyClassName}>
        {shouldShowConnectionNotice ? (
          <div className="space-y-2">
            <div className="typography-meta text-muted-foreground">
              GitHub not connected. Connect your GitHub account in settings.
            </div>
                <Button variant="outline" size="sm" onClick={openGitHubSettings} className="w-fit">
                  Open settings
                </Button>
              </div>
            ) : null}

            {error ? (
              <div className="space-y-2">
                <div className="typography-ui-label text-foreground">PR status unavailable</div>
                <div className="typography-meta text-muted-foreground break-words">{error}</div>
                {repoUrl ? (
                  <Button variant="outline" size="sm" asChild className="w-fit">
                    <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                      <RiExternalLinkLine className="size-4" />
                      Open Repo
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}

            {!pr && !isInitialStatusResolved && !error && !shouldShowConnectionNotice ? (
              <div className="flex items-center gap-2 typography-micro text-muted-foreground">
                <RiLoader4Line className="size-4 animate-spin" />
                Checking PR status...
              </div>
            ) : pr ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    {isEditingPr ? (
                      <div className="space-y-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="PR title"
                          autoCorrect={hasTouchInput ? "on" : "off"}
                          autoCapitalize={hasTouchInput ? "sentences" : "off"}
                          spellCheck={hasTouchInput}
                        />
                        <Textarea
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          className="min-h-[120px] bg-background/80"
                          placeholder="Describe this PR"
                          autoCorrect={hasTouchInput ? "on" : "off"}
                          autoCapitalize={hasTouchInput ? "sentences" : "off"}
                          spellCheck={hasTouchInput}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="typography-markdown text-xl font-semibold text-foreground break-words leading-snug">{pr.title}</div>
                        {pr.body?.trim() ? (
                          <SimpleMarkdownRenderer
                            content={pr.body}
                            className="typography-markdown-body text-muted-foreground break-words mt-1"
                          />
                        ) : (
                          <div className="typography-micro text-muted-foreground whitespace-pre-wrap break-words mt-1">
                            {isHydratingCurrentPrBody ? 'Loading description...' : 'No description provided.'}
                          </div>
                        )}
                      </>
                    )}
                    {canMerge && pr.draft ? (
                      <div className="typography-micro text-muted-foreground">
                        Draft PRs must be marked ready before merge.
                      </div>
                    ) : null}
                    {!canMerge ? (
                      <div className="typography-micro text-muted-foreground">No merge permission; use Open in GitHub.</div>
                    ) : null}
                  </div>

                  <div className="order-first w-full flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {pr.state === 'open' ? (
                        isEditingPr ? (
                          <>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 px-0"
                                  onClick={() => {
                                    setIsEditingPr(false);
                                    setEditTitle(pr.title || '');
                                    setEditBody(pr.body || '');
                                  }}
                                  disabled={isUpdating}
                                  aria-label="Cancel editing"
                                >
                                  <RiCloseLine className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Cancel editing</p></TooltipContent>
                            </Tooltip>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  className="h-7 w-7 px-0"
                                  onClick={() => updatePr(pr)}
                                  disabled={isUpdating || !editTitle.trim()}
                                  aria-label="Save PR title and description"
                                >
                                  {isUpdating ? <RiLoader4Line className="size-4 animate-spin" /> : <RiCheckLine className="size-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Save PR title and description</p></TooltipContent>
                            </Tooltip>
                          </>
                        ) : (
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 px-0"
                                onClick={() => setIsEditingPr(true)}
                                aria-label="Edit PR title and description"
                              >
                                <RiEditLine className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Edit PR title and description</p></TooltipContent>
                          </Tooltip>
                        )
                      ) : null}

                      {checks ? (
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 px-0"
                              onClick={openChecksDialog}
                              disabled={isLoadingCheckDetails}
                              aria-label="Open checks details"
                            >
                              {isLoadingCheckDetails ? <RiLoader4Line className="size-4 animate-spin" /> : <RiInformationLine className="size-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Open checks details</p></TooltipContent>
                        </Tooltip>
                      ) : null}

                      {checks?.failure ? (
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 px-0 border-[var(--status-success-border)] bg-[var(--status-success-background)] text-[var(--status-success)]"
                              onClick={sendFailedChecksToChat}
                              aria-label="Resolve failed checks with agent"
                            >
                              <RiErrorWarningLine className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Resolve failed checks with agent</p></TooltipContent>
                        </Tooltip>
                      ) : null}

                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 px-0"
                            onClick={openCommentsDialog}
                            aria-label="Open PR comments"
                          >
                            <RiChat4Line className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Open PR comments</p></TooltipContent>
                      </Tooltip>

                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 px-0 border-[var(--status-success-border)] bg-[var(--status-success-background)] text-[var(--status-success)]"
                            onClick={sendCommentsToChat}
                            aria-label="Share comments with agent"
                          >
                            <RiAiGenerate2 className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Share comments with agent</p></TooltipContent>
                      </Tooltip>

                      {canMerge && pr.draft && pr.state === 'open' ? (
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 px-0"
                              onClick={() => markReady(pr)}
                              disabled={isMarkingReady || isMerging || isUpdating || isEditingPr}
                              aria-label="Mark PR ready for review"
                            >
                              {isMarkingReady ? <RiLoader4Line className="size-4 animate-spin" /> : <RiCheckboxCircleLine className="size-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Mark PR ready for review</p></TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      {canMerge ? (
                        <>
                          <Select
                            value={mergeMethod}
                            onValueChange={(value) => setMergeMethod(value as MergeMethod)}
                            disabled={isMerging || pr.state !== 'open'}
                          >
                            <SelectTrigger size="lg" className="h-7 w-auto min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="squash">Squash</SelectItem>
                              <SelectItem value="merge">Merge</SelectItem>
                              <SelectItem value="rebase">Rebase</SelectItem>
                            </SelectContent>
                          </Select>
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                className="h-7 w-7 px-0"
                                onClick={() => mergePr(pr)}
                                disabled={isMerging || isMarkingReady || pr.state !== 'open' || pr.draft || isUpdating || isEditingPr}
                                aria-label="Merge pull request"
                              >
                                {isMerging ? <RiLoader4Line className="size-4 animate-spin" /> : <RiGitMergeLine className="size-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Merge pull request</p></TooltipContent>
                          </Tooltip>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="typography-ui-label text-foreground">Create PR</div>
                    <div className="typography-micro text-muted-foreground truncate">
                      {branch} → {targetBaseBranch}
                    </div>
                  </div>
                  {repoUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                        <RiExternalLinkLine className="size-4" />
                        Repo
                      </a>
                    </Button>
                  ) : null}
                </div>

                <label className="space-y-1">
                  <div className="typography-micro text-muted-foreground">Title</div>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="PR title"
                    autoCorrect={hasTouchInput ? "on" : "off"}
                    autoCapitalize={hasTouchInput ? "sentences" : "off"}
                    spellCheck={hasTouchInput}
                  />
                </label>

                <label className="space-y-1">
                  <div className="typography-micro text-muted-foreground">Base branch</div>
                  {availableBaseBranches.length > 0 ? (
                    <Select value={targetBaseBranch} onValueChange={setTargetBaseBranch}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select base branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBaseBranches.map((candidate) => (
                          <SelectItem key={candidate} value={candidate}>{candidate}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={targetBaseBranch}
                      onChange={(e) => setTargetBaseBranch(e.target.value)}
                      placeholder="main"
                    />
                  )}
                </label>

                <label className="space-y-1">
                  <div className="typography-micro text-muted-foreground">Description</div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-[110px]"
                    placeholder="What changed and why"
                    autoCorrect={hasTouchInput ? "on" : "off"}
                    autoCapitalize={hasTouchInput ? "sentences" : "off"}
                    spellCheck={hasTouchInput}
                  />
                </label>

                <div
                  className="flex items-center gap-2 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-pressed={draft}
                  onClick={() => setDraft((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setDraft((v) => !v);
                    }
                  }}
                >
                  <Checkbox
                    size="sm"
                    checked={draft}
                    onChange={(next) => setDraft(next)}
                    ariaLabel="Toggle draft PR"
                  />
                  <span className="typography-ui-label text-foreground select-none">Draft</span>
                </div>

                {/* Additional Context Section */}
                {isMobile ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="typography-micro text-muted-foreground">
                        Additional context (optional)
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsContextSheetOpen(true)}
                      >
                        {additionalContext.trim() ? 'Edit' : 'Add'}
                      </Button>
                    </div>
                    {additionalContext.trim() && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-[var(--interactive-selection)] px-2 py-0.5 text-xs text-[var(--interactive-selection-foreground)]">
                          Context added
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <Collapsible open={isContextOpen} onOpenChange={setIsContextOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-3 py-2 hover:bg-[var(--interactive-hover)]">
                      <span className="typography-micro text-muted-foreground">
                        Additional context (optional)
                      </span>
                      <span className="typography-micro text-[var(--primary-base)]">
                        {isContextOpen ? 'Hide' : additionalContext.trim() ? 'Edit' : 'Add'}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 space-y-2 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3">
                        <Textarea
                          value={additionalContext}
                          onChange={(e) => setAdditionalContext(e.target.value)}
                          className="min-h-[100px] bg-transparent"
                          placeholder="Explain why this change is needed...&#10;Mention how to test (commands / steps)...&#10;Call out risks / rollout plan..."
                        />
                        <p className="typography-micro text-muted-foreground">
                          This text is only used to guide PR generation.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Mobile Sheet for Context */}
                <MobileOverlayPanel
                  open={isContextSheetOpen}
                  onClose={() => setIsContextSheetOpen(false)}
                  title="Additional context"
                  footer={
                    <Button
                      size="sm"
                      onClick={() => setIsContextSheetOpen(false)}
                      className="w-full"
                    >
                      Done
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    <Textarea
                      value={additionalContext}
                      onChange={(e) => setAdditionalContext(e.target.value)}
                      className="min-h-[200px] bg-transparent"
                      placeholder="Explain why this change is needed...&#10;Mention how to test (commands / steps)...&#10;Call out risks / rollout plan..."
                      autoFocus
                    />
                    <p className="typography-micro text-muted-foreground">
                      This text is only used to guide PR generation.
                    </p>
                  </div>
                </MobileOverlayPanel>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateDescription}
                    disabled={isGenerating || isCreating}
                  >
                    {isGenerating ? <RiLoader4Line className="size-4 animate-spin" /> : <RiAiGenerate2 className="size-4 text-primary" />}
                    Generate
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    className="min-w-[7.5rem] justify-center gap-2"
                    onClick={createPr}
                    disabled={isCreating || !isConnected || !targetBaseBranch.trim() || targetBaseBranch.trim() === branch}
                  >
                    <span className="inline-flex size-4 items-center justify-center">
                      {isCreating ? <RiLoader4Line className="size-4 animate-spin" /> : <RiGitPullRequestLine className="size-4" />}
                    </span>
                    <span>Create PR</span>
                  </Button>
                </div>
              </div>
            )}
      </div>

      <PullRequestChecksDialog
        open={checksDialogOpen}
        onOpenChange={setChecksDialogOpen}
        prNumber={pr?.number}
        details={checkDetails}
        isLoading={isLoadingCheckDetails}
      />
      <PullRequestCommentsDialog
        open={commentsDialogOpen}
        onOpenChange={setCommentsDialogOpen}
        prNumber={pr?.number}
        details={commentsDetails}
        isLoading={isLoadingCommentsDetails}
        connectedGitHubLogin={connectedGitHubLogin}
        onSendComment={(comment) => {
          void sendSingleCommentToChat(comment);
        }}
      />
    </section>
  );
};
