import type { PushResult, TaskOptions } from "simple-git";
import type { GitPushResponse } from "../../contracts/git.js";
import type { GitPushOptions } from "./types.js";

type GitTaskOptionValue = null | string | number | Array<string | number>;

const isTaskOptionValue = (value: unknown): value is GitTaskOptionValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  (Array.isArray(value) &&
    value.every((item) => typeof item === "string" || typeof item === "number"));

export const toTaskOptions = (
  options: string[] | Record<string, unknown> | undefined,
): TaskOptions => {
  if (Array.isArray(options)) {
    return options;
  }
  if (!options) {
    return {};
  }

  const taskOptions: Record<string, GitTaskOptionValue> = {};
  for (const [name, value] of Object.entries(options)) {
    if (!isTaskOptionValue(value)) {
      throw new Error(`Unsupported value for git option ${name}`);
    }
    taskOptions[name] = value;
  }
  return taskOptions;
};

const errorDetails = (error: unknown): Record<string, unknown> =>
  error && typeof error === "object" ? error as Record<string, unknown> : {};

export const describePushError = (error: unknown): string => {
  const details = errorDetails(error);
  const nestedGit =
    details.git && typeof details.git === "object"
      ? details.git as Record<string, unknown>
      : null;
  const candidates = [
    details.message,
    details.stderr,
    details.stdout,
    ...(nestedGit ? [nestedGit.message, nestedGit.stderr, nestedGit.stdout] : []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return candidates[0] || "Failed to push to remote";
};

export const buildUpstreamOptions = (
  raw: GitPushOptions["options"],
): TaskOptions => {
  if (Array.isArray(raw)) {
    return raw.includes("--set-upstream") ? raw : [...raw, "--set-upstream"];
  }
  return { ...toTaskOptions(raw), "--set-upstream": null };
};

export const looksLikeMissingUpstream = (error: unknown): boolean => {
  const details = errorDetails(error);
  const message = String(details.message || details.stderr || "").toLowerCase();
  return (
    message.includes("has no upstream") ||
    message.includes("no upstream") ||
    message.includes("set-upstream") ||
    message.includes("set upstream") ||
    (message.includes("upstream") && message.includes("push") && message.includes("-u"))
  );
};

export const normalizePushResult = (
  result: PushResult,
  directory: string,
): GitPushResponse => ({
  success: true,
  pushed: result.pushed,
  repo: result.repo || directory,
  ref: result.ref ?? null,
});
