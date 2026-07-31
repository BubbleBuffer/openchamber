import type { RestEndpointMethodTypes } from "@octokit/rest";

type CheckRuns =
  RestEndpointMethodTypes["checks"]["listForRef"]["response"]["data"]["check_runs"];
type CommitStatuses =
  RestEndpointMethodTypes["repos"]["getCombinedStatusForRef"]["response"]["data"]["statuses"];

export type CheckSummary = {
  state: "success" | "failure" | "pending" | "unknown";
  total: number;
  success: number;
  failure: number;
  pending: number;
};

const withState = (counts: Omit<CheckSummary, "state" | "total">): CheckSummary => {
  const total = counts.success + counts.failure + counts.pending;
  const state =
    counts.failure > 0
      ? "failure"
      : counts.pending > 0
        ? "pending"
        : total > 0
          ? "success"
          : "unknown";
  return { state, total, ...counts };
};

export const summarizeCheckRuns = (runs: CheckRuns): CheckSummary => {
  const counts = { success: 0, failure: 0, pending: 0 };
  for (const run of runs) {
    if (run.status === "queued" || run.status === "in_progress" || !run.conclusion) {
      counts.pending += 1;
    } else if (["success", "neutral", "skipped"].includes(run.conclusion)) {
      counts.success += 1;
    } else {
      counts.failure += 1;
    }
  }
  return withState(counts);
};

export const summarizeCommitStatuses = (statuses: CommitStatuses): CheckSummary => {
  const counts = { success: 0, failure: 0, pending: 0 };
  for (const status of statuses) {
    if (status.state === "success") counts.success += 1;
    else if (status.state === "failure" || status.state === "error") counts.failure += 1;
    else if (status.state === "pending") counts.pending += 1;
  }
  return withState(counts);
};
