import type { AgentTimelineItem, JsonValue } from "./model.js";

export function normalizeTimestampMs(value: number | string): number {
  const timestamp = typeof value === "number" ? value : Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`invalid timestamp: ${String(value)}`);
  }

  return timestamp;
}

export function activityDurationMs(startedAtMs: number, endedAtMs?: number): number | null {
  if (endedAtMs === undefined) return null;
  return Math.max(0, endedAtMs - startedAtMs);
}

export function orderTimelineItems<TItem extends AgentTimelineItem>(items: readonly TItem[]): TItem[] {
  return [...items].sort(
    (left, right) => left.occurredAtMs - right.occurredAtMs || left.key.localeCompare(right.key),
  );
}

export function assertUniqueTimelineKeys<TItem extends Pick<AgentTimelineItem, "key">>(
  items: readonly TItem[],
): void {
  const keys = new Set<string>();

  for (const item of items) {
    if (keys.has(item.key)) {
      throw new Error(`duplicate timeline key: ${item.key}`);
    }
    keys.add(item.key);
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonValueInternal(value, new Set<object>());
}

function isJsonValueInternal(value: unknown, ancestors: Set<object>): value is JsonValue {
  if (isJsonPrimitive(value)) return true;
  if (typeof value !== "object") return false;

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValueInternal(entry, ancestors))
    : Object.values(value).every((entry) => isJsonValueInternal(entry, ancestors));
  ancestors.delete(value);

  return valid;
}

function isJsonPrimitive(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" || typeof value === "boolean";
}
