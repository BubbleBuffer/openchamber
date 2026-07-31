import React from 'react';
import {
  RiAiGenerate2,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiExternalLinkLine,
  RiGitPullRequestLine,
  RiLoader4Line,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import type {
  GitHubCheckRun,
  GitHubPullRequestContextResult,
} from '@/lib/api/types';
import {
  buildPullRequestTimelineComments,
  formatPullRequestTimestamp,
  linkifyGitHubMentionsMarkdown,
  type PullRequestTimelineComment,
} from './pullRequestPresentation';

const SELF_MENTION_HIGHLIGHT_CLASS =
  "[&_a[href*='oc-self-mention=1']]:!text-[var(--primary-base)] [&_a[href*='oc-self-mention=1']]:font-semibold [&_a[href*='oc-self-mention=1']]:!no-underline [&_a[href*='oc-self-mention=1']:hover]:!text-[var(--primary-hover)]";

const CheckRunSummary: React.FC<{
  run: GitHubCheckRun;
  expandedStepKeys: Set<string>;
  onToggleStep: (stepKey: string) => void;
}> = ({ run, expandedStepKeys, onToggleStep }) => {
  const status = run.status || 'unknown';
  const conclusion = run.conclusion ?? undefined;
  const statusText = conclusion ? `${status} / ${conclusion}` : status;
  const appName = run.app?.name || run.app?.slug;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="typography-ui-label text-foreground truncate">{run.name}</div>
          <div className="typography-micro text-muted-foreground truncate">
            {appName ? `${appName} · ${statusText}` : statusText}
          </div>
        </div>

        {run.detailsUrl ? (
          <Button variant="outline" size="sm" asChild className="flex-shrink-0">
            <a href={run.detailsUrl} target="_blank" rel="noopener noreferrer">
              <RiExternalLinkLine className="size-4" />
              Open
            </a>
          </Button>
        ) : null}
      </div>

      {run.output?.title ? (
        <div className="typography-micro text-foreground">{run.output.title}</div>
      ) : null}
      {run.output?.summary ? (
        <div className="typography-micro text-muted-foreground whitespace-pre-wrap">
          {run.output.summary}
        </div>
      ) : null}
      {run.output?.text ? (
        <div className="rounded border border-border/40 bg-transparent px-2 py-2 typography-micro text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
          {run.output.text}
        </div>
      ) : null}

      {Array.isArray(run.annotations) && run.annotations.length > 0 ? (
        <div className="space-y-1">
          <div className="typography-micro text-muted-foreground">
            Failed annotations{run.annotations.length > 20 ? ` (showing 20/${run.annotations.length})` : ''}
          </div>
          <div className="space-y-1">
            {run.annotations.slice(0, 20).map((annotation, index) => (
              <div
                key={`${annotation.path || 'file'}:${annotation.startLine || index}:${index}`}
                className="rounded border border-[var(--status-error-border)] bg-[var(--status-error-background)]/40 px-2 py-2"
              >
                <div className="typography-micro text-[var(--status-error)]">
                  {annotation.title || annotation.level || 'Issue'}
                  {annotation.path ? ` · ${annotation.path}` : ''}
                  {typeof annotation.startLine === 'number' ? `:${annotation.startLine}` : ''}
                  {typeof annotation.endLine === 'number' && annotation.endLine !== annotation.startLine
                    ? `-${annotation.endLine}`
                    : ''}
                </div>
                <div className="typography-micro text-foreground whitespace-pre-wrap mt-1">
                  {annotation.message}
                </div>
                {annotation.rawDetails ? (
                  <div className="typography-micro text-muted-foreground whitespace-pre-wrap mt-1">
                    {annotation.rawDetails}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {run.job?.steps && run.job.steps.length > 0 ? (
        <div className="space-y-1">
          <div className="typography-micro text-muted-foreground">Steps</div>
          <div className="space-y-1">
            {run.job.steps.map((step, index) => {
              const conclusionValue = (step.conclusion || '').toLowerCase();
              const isFailure = Boolean(
                conclusionValue && !['success', 'neutral', 'skipped'].includes(conclusionValue),
              );
              const stepKey =
                `${run.id ?? 'run'}:${run.job?.jobId ?? 'job'}:${step.number ?? index}:${step.name}`;
              const isExpanded = expandedStepKeys.has(stepKey);

              if (!isFailure) {
                return (
                  <div
                    key={stepKey}
                    className="typography-micro flex w-full items-center gap-2 rounded px-2 py-1 text-muted-foreground"
                  >
                    <span className="truncate">{step.name}</span>
                    {step.conclusion
                      ? <span className="ml-auto flex-shrink-0">{step.conclusion}</span>
                      : null}
                  </div>
                );
              }

              return (
                <Collapsible key={stepKey} open={isExpanded}>
                  <button
                    type="button"
                    onClick={() => onToggleStep(stepKey)}
                    className="typography-micro flex w-full items-center gap-2 rounded bg-destructive/10 px-2 py-1 text-left text-destructive"
                  >
                    {isExpanded
                      ? <RiArrowDownSLine className="size-4" />
                      : <RiArrowRightSLine className="size-4" />}
                    <span className="truncate">{step.name}</span>
                    {step.conclusion
                      ? <span className="ml-auto flex-shrink-0">{step.conclusion}</span>
                      : null}
                  </button>
                  <CollapsibleContent>
                    <div className="ml-6 mt-1 rounded border border-border/40 bg-transparent px-2 py-2 typography-micro text-muted-foreground space-y-1">
                      {typeof step.number === 'number' ? <div>Step: {step.number}</div> : null}
                      {step.status ? <div>Status: {step.status}</div> : null}
                      {step.conclusion ? <div>Conclusion: {step.conclusion}</div> : null}
                      {step.startedAt
                        ? <div>Started: {formatPullRequestTimestamp(step.startedAt)}</div>
                        : null}
                      {step.completedAt
                        ? <div>Completed: {formatPullRequestTimestamp(step.completedAt)}</div>
                        : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const PullRequestChecksDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prNumber?: number;
  details: GitHubPullRequestContextResult | null;
  isLoading: boolean;
}> = ({ open, onOpenChange, prNumber, details, isLoading }) => {
  const [expandedStepKeys, setExpandedStepKeys] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (open) {
      setExpandedStepKeys(new Set());
    }
  }, [open]);

  const toggleStep = React.useCallback((stepKey: string) => {
    setExpandedStepKeys((previous) => {
      const next = new Set(previous);
      if (next.has(stepKey)) {
        next.delete(stepKey);
      } else {
        next.add(stepKey);
      }
      return next;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col min-h-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RiGitPullRequestLine className="h-5 w-5" />
            Check Details
          </DialogTitle>
          <DialogDescription>{prNumber ? `PR #${prNumber}` : 'Pull request'}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto mt-2">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8 flex items-center justify-center gap-2">
              <RiLoader4Line className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : null}

          {!isLoading ? (
            <div className="space-y-3">
              {Array.isArray(details?.checkRuns) && details.checkRuns.length > 0 ? (
                details.checkRuns.map((run, index) => (
                  <div
                    key={`${run.id ?? 'run'}:${run.job?.jobId ?? 'job'}:${run.name}:${index}`}
                    className="p-1"
                  >
                    <CheckRunSummary
                      run={run}
                      expandedStepKeys={expandedStepKeys}
                      onToggleStep={toggleStep}
                    />
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No check details available.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const PullRequestCommentsDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prNumber?: number;
  details: GitHubPullRequestContextResult | null;
  isLoading: boolean;
  connectedGitHubLogin: string;
  onSendComment: (comment: PullRequestTimelineComment) => void;
}> = ({
  open,
  onOpenChange,
  prNumber,
  details,
  isLoading,
  connectedGitHubLogin,
  onSendComment,
}) => {
  const timelineComments = React.useMemo(
    () => buildPullRequestTimelineComments(details),
    [details],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[82vh] min-h-[38rem] flex flex-col gap-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RiGitPullRequestLine className="h-5 w-5" />
            PR Comments
            {prNumber ? (
              <span className="typography-meta text-muted-foreground">PR #{prNumber}</span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <ScrollShadow className="mt-2 max-h-[66vh] overflow-y-auto overlay-scrollbar-target overlay-scrollbar-container">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8 flex items-center justify-center gap-2">
              <RiLoader4Line className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : null}

          {!isLoading ? (
            <div className="space-y-4">
              {timelineComments.length > 0 ? (
                <div className="relative pl-3">
                  <div>
                    {timelineComments.map((comment, index) => {
                      const initial = (comment.authorName || '?').charAt(0).toUpperCase();
                      const isLast = index === timelineComments.length - 1;
                      return (
                        <div key={comment.id} className="relative pl-10 pb-5 last:pb-0">
                          {!isLast ? (
                            <div className="absolute left-4 top-[2.375rem] bottom-[0.375rem] w-px bg-border/60" />
                          ) : null}
                          <div className="absolute left-0 top-0 z-10 flex size-8 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-surface-elevated text-xs text-muted-foreground">
                            {comment.avatarUrl ? (
                              <img
                                src={comment.avatarUrl}
                                alt={comment.authorName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span>{initial}</span>
                            )}
                          </div>
                          <div className="rounded-lg bg-surface-elevated px-3 pt-0 pb-3 space-y-2">
                            <div className="flex flex-col items-start gap-1 typography-micro text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-1">
                              <span className="text-foreground whitespace-nowrap">
                                {comment.authorName}
                                {comment.authorLogin && comment.authorLogin !== comment.authorName
                                  ? ` · @${comment.authorLogin}`
                                  : ''}
                              </span>
                              {comment.createdAt ? (
                                <span className="whitespace-nowrap">
                                  {formatPullRequestTimestamp(comment.createdAt)}
                                </span>
                              ) : null}
                              <Tooltip delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-0 has-[>svg]:px-0 sm:px-2 sm:has-[>svg]:px-2.5 text-[var(--status-success)] hover:bg-[var(--status-success-background)] hover:text-[var(--status-success)] justify-start"
                                    onClick={() => onSendComment(comment)}
                                    aria-label="Send this comment to agent"
                                  >
                                    <RiAiGenerate2 className="size-3.5" />
                                    Send to agent
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Send this comment to agent</p></TooltipContent>
                              </Tooltip>
                            </div>
                            <div className="typography-micro text-muted-foreground">
                              {comment.context}
                              {comment.path ? ` · ${comment.path}` : ''}
                              {comment.line ? `:${comment.line}` : ''}
                            </div>
                            <SimpleMarkdownRenderer
                              content={linkifyGitHubMentionsMarkdown(
                                comment.body,
                                connectedGitHubLogin,
                              )}
                              className={[
                                'typography-markdown-body text-foreground break-words [&_a]:no-underline [&_a:hover]:no-underline',
                                SELF_MENTION_HIGHLIGHT_CLASS,
                              ].join(' ')}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">No comments found.</div>
              )}
            </div>
          ) : null}
        </ScrollShadow>
      </DialogContent>
    </Dialog>
  );
};
