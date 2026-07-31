import { describe, expect, it } from "vitest";
import { summarizeCheckRuns, summarizeCommitStatuses } from "./check-summary.js";

describe("GitHub check summaries", () => {
  it("treats an unfinished check run as pending and a failed conclusion as failure", () => {
    const runs = [
      { status: "in_progress", conclusion: null },
      { status: "completed", conclusion: "success" },
      { status: "completed", conclusion: "failure" },
    ] as Parameters<typeof summarizeCheckRuns>[0];

    expect(summarizeCheckRuns(runs)).toEqual({
      state: "failure",
      total: 3,
      success: 1,
      failure: 1,
      pending: 1,
    });
  });

  it("normalizes classic commit statuses with the same aggregate shape", () => {
    const statuses = [
      { state: "success" },
      { state: "pending" },
      { state: "error" },
    ] as Parameters<typeof summarizeCommitStatuses>[0];

    expect(summarizeCommitStatuses(statuses)).toEqual({
      state: "failure",
      total: 3,
      success: 1,
      failure: 1,
      pending: 1,
    });
  });

  it("reports an empty aggregate as unknown", () => {
    expect(summarizeCheckRuns([])).toEqual({
      state: "unknown",
      total: 0,
      success: 0,
      failure: 0,
      pending: 0,
    });
  });
});
