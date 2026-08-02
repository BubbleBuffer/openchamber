export type TimelineChange = "stable" | "initial" | "append" | "prepend" | "replace";

export type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export function classifyTimelineChange(
  previousKeys: readonly string[],
  nextKeys: readonly string[],
): TimelineChange {
  if (previousKeys.length === 0 && nextKeys.length > 0) return "initial";
  if (sameKeys(previousKeys, nextKeys)) return "stable";
  if (containsKeysAt(nextKeys, previousKeys, 0)) return "append";
  if (containsKeysAt(nextKeys, previousKeys, nextKeys.length - previousKeys.length)) return "prepend";
  return "replace";
}

export function isScrollAtBottom(metrics: ScrollMetrics, thresholdPx: number): boolean {
  if (metrics.scrollHeight <= metrics.clientHeight) return true;
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= thresholdPx;
}

export function shouldLoadBefore({
  startIndex,
  thresholdIndex,
  hasMore,
  isLoading,
}: {
  startIndex: number | undefined;
  thresholdIndex: number;
  hasMore: boolean;
  isLoading: boolean;
}): boolean {
  return startIndex !== undefined && startIndex <= thresholdIndex && hasMore && !isLoading;
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function containsKeysAt(
  container: readonly string[],
  candidate: readonly string[],
  startIndex: number,
): boolean {
  if (candidate.length === 0 || startIndex < 0 || container.length <= candidate.length) return false;
  return candidate.every((key, index) => container[startIndex + index] === key);
}
