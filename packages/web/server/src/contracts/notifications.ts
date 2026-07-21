import { parseJsonArray, parseJsonBoolean, parseJsonNumber, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const NOTIFICATION_ERROR_CODES = ["notification_invalid_request", "notification_unauthorized", "notification_unavailable", "session_not_found"] as const;
export const NOTIFICATION_SSE_CONTENT_TYPE = "text/event-stream; charset=utf-8" as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];
export type NotificationErrorResponse = { error: string; code: NotificationErrorCode };
export type PushSubscribeRequest = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushUnsubscribeRequest = { endpoint: string };
export type PushVisibilityRequest = { visible: boolean };
export type PushResponse = { ok: true };
export type VapidPublicKeyResponse = { publicKey: string };
export type NotificationSseEvent = { type: "openchamber:notification-stream-ready"; properties: Record<string, unknown> };
export const SESSION_ACTIVITY_VALUES = ["idle", "busy", "streaming", "aborting"] as const;
export const SESSION_LIFECYCLE_VALUES = ["opening", "ready", "streaming", "completed", "aborted", "not_found", "error", "fatal"] as const;
export type SessionActivity = (typeof SESSION_ACTIVITY_VALUES)[number];
export type SessionLifecycle = (typeof SESSION_LIFECYCLE_VALUES)[number];
export type SessionActivityEntry = { directory: string; sessionId: string; activity: SessionActivity };
export type SessionStatusEntry = { directory: string; sessionId: string; status: SessionLifecycle };
export type SessionAttentionEntry = { directory: string; sessionId: string; needsAttention: boolean };
export type SessionSnapshotResponse = { statusSessions: SessionStatusEntry[]; attentionSessions: SessionAttentionEntry[]; serverTime: number };
export type SessionStatusSnapshotResponse = { sessions: SessionStatusEntry[]; serverTime: number };
export type SessionAttentionSnapshotResponse = { sessions: SessionAttentionEntry[]; serverTime: number };
export type SessionActionRequest = { sessionId: string; enabled: boolean };
export type SessionActionResponse = { success: true; sessionId: string; viewed?: boolean; messageSent?: boolean; enabled?: boolean };
export type SessionPathRequest = { sessionId: string };
export type SessionAttentionStateResponse = { sessionId: string; needsAttention: boolean };
export type SessionStateResponse = { sessionId: string; version: 1; key: { directory: string; sessionId: string }; regions: { lifecycle: SessionLifecycle; activity: SessionActivity; interruptions: string; history: string; retry: string; error: string }; meta: { revision: number; updatedAt: number; sourceEventId: string | null; hydratedAt: number | null } } & Record<string, unknown>;
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const nonEmptyString = (value: unknown): ParseResult<string> => {
  const parsed = parseJsonString(value);
  const trimmed = parsed.ok ? parsed.value.trim() : "";
  return trimmed ? { ok: true, value: trimmed } : invalid("required string");
};
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): ParseResult<T> =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? { ok: true, value: value as T } : invalid("invalid value");
const parseActivityEntry = (value: unknown): ParseResult<SessionActivityEntry> => {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const directory = nonEmptyString(object.value.directory); const sessionId = nonEmptyString(object.value.sessionId); const activity = oneOf(object.value.activity, SESSION_ACTIVITY_VALUES);
  return directory.ok && sessionId.ok && activity.ok ? { ok: true, value: { directory: directory.value, sessionId: sessionId.value, activity: activity.value } } : invalid("invalid session activity");
};
const parseStatusEntry = (value: unknown): ParseResult<SessionStatusEntry> => {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const directory = nonEmptyString(object.value.directory); const sessionId = nonEmptyString(object.value.sessionId); const status = oneOf(object.value.status, SESSION_LIFECYCLE_VALUES);
  return directory.ok && sessionId.ok && status.ok ? { ok: true, value: { directory: directory.value, sessionId: sessionId.value, status: status.value } } : invalid("invalid session status");
};
const parseAttentionEntry = (value: unknown): ParseResult<SessionAttentionEntry> => {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const directory = nonEmptyString(object.value.directory); const sessionId = nonEmptyString(object.value.sessionId); const needsAttention = parseJsonBoolean(object.value.needsAttention);
  return directory.ok && sessionId.ok && needsAttention.ok ? { ok: true, value: { directory: directory.value, sessionId: sessionId.value, needsAttention: needsAttention.value } } : invalid("invalid session attention");
};
const parseEntries = <T>(value: unknown, parse: (entry: unknown) => ParseResult<T>): ParseResult<T[]> => {
  const array = parseJsonArray(value); if (!array.ok) return array;
  const entries: T[] = [];
  for (const item of array.value) { const parsed = parse(item); if (!parsed.ok) return invalid("invalid session entries"); entries.push(parsed.value); }
  return { ok: true, value: entries };
};
export function parsePushSubscribeRequest(value: unknown): ParseResult<PushSubscribeRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const endpoint = parseJsonString(object.value.endpoint); const keys = parseJsonObject(object.value.keys);
  if (!endpoint.ok || !keys.ok) return invalid("invalid push subscription");
  const p256dh = parseJsonString(keys.value.p256dh); const auth = parseJsonString(keys.value.auth);
  return endpoint.value.length > 0 && p256dh.ok && p256dh.value.length > 0 && auth.ok && auth.value.length > 0
    ? { ok: true, value: { endpoint: endpoint.value, keys: { p256dh: p256dh.value, auth: auth.value } } }
    : invalid("invalid push keys");
}
export function parsePushUnsubscribeRequest(value: unknown): ParseResult<PushUnsubscribeRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const endpoint = parseJsonString(object.value.endpoint);
  return endpoint.ok && endpoint.value.length > 0 ? { ok: true, value: { endpoint: endpoint.value } } : invalid("endpoint is required");
}
export function parseVisibilityRequest(value: unknown): ParseResult<PushVisibilityRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const visible = parseJsonBoolean(object.value.visible);
  return visible.ok ? { ok: true, value: { visible: visible.value } } : invalid("visible is required");
}
export function parsePushResponse(value: unknown): ParseResult<PushResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const ok = parseJsonBoolean(object.value.ok); return ok.ok && ok.value ? { ok: true, value: { ok: true } } : invalid("invalid push response");
}
export function parseVapidPublicKeyResponse(value: unknown): ParseResult<VapidPublicKeyResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const publicKey = parseJsonString(object.value.publicKey);
  return publicKey.ok && publicKey.value.length > 0 ? { ok: true, value: { publicKey: publicKey.value } } : invalid("invalid VAPID public key response");
}
export function parseNotificationSseEvent(value: unknown): ParseResult<NotificationSseEvent> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.type !== "openchamber:notification-stream-ready") return invalid("unknown notification event");
  const properties = parseJsonObject(object.value.properties);
  return properties.ok ? { ok: true, value: { type: "openchamber:notification-stream-ready", properties: properties.value } } : invalid("invalid notification event");
}
export function parseNotificationErrorResponse(value: unknown): ParseResult<NotificationErrorResponse> {
  const object = parseJsonObject(value);
  return object.ok && typeof object.value.error === "string" && object.value.error.length > 0 && typeof object.value.code === "string" && (NOTIFICATION_ERROR_CODES as readonly string[]).includes(object.value.code)
    ? { ok: true, value: object.value as NotificationErrorResponse }
    : invalid("invalid notification error response");
}
export const parseSessionActivityResponse = (value: unknown): ParseResult<SessionActivityEntry[]> => parseEntries(value, parseActivityEntry);
export function parseSessionSnapshotResponse(value: unknown): ParseResult<SessionSnapshotResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const statusSessions = parseEntries(object.value.statusSessions, parseStatusEntry); const attentionSessions = parseEntries(object.value.attentionSessions, parseAttentionEntry); const serverTime = parseJsonNumber(object.value.serverTime);
  return statusSessions.ok && attentionSessions.ok && serverTime.ok ? { ok: true, value: { statusSessions: statusSessions.value, attentionSessions: attentionSessions.value, serverTime: serverTime.value } } : invalid("invalid session snapshot");
}
export function parseSessionStatusSnapshotResponse(value: unknown): ParseResult<SessionStatusSnapshotResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object; const sessions = parseEntries(object.value.sessions, parseStatusEntry); const serverTime = parseJsonNumber(object.value.serverTime);
  return sessions.ok && serverTime.ok ? { ok: true, value: { sessions: sessions.value, serverTime: serverTime.value } } : invalid("invalid session status snapshot");
}
export function parseSessionAttentionSnapshotResponse(value: unknown): ParseResult<SessionAttentionSnapshotResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object; const sessions = parseEntries(object.value.sessions, parseAttentionEntry); const serverTime = parseJsonNumber(object.value.serverTime);
  return sessions.ok && serverTime.ok ? { ok: true, value: { sessions: sessions.value, serverTime: serverTime.value } } : invalid("invalid session attention snapshot");
}
export function parseSessionPathRequest(value: unknown): ParseResult<SessionPathRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object; const sessionId = nonEmptyString(object.value.id);
  return sessionId.ok ? { ok: true, value: { sessionId: sessionId.value } } : invalid("session id required");
}
export function parseSessionActionRequest(value: unknown): ParseResult<SessionActionRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object; const sessionId = nonEmptyString(object.value.sessionId); const enabled = parseJsonBoolean(object.value.enabled);
  return sessionId.ok && enabled.ok ? { ok: true, value: { sessionId: sessionId.value, enabled: enabled.value } } : invalid("invalid session action");
}
export function parseSessionActionResponse(value: unknown): ParseResult<SessionActionResponse> {
  const object = parseJsonObject(value); if (!object.ok || object.value.success !== true) return invalid("invalid session action response");
  const sessionId = nonEmptyString(object.value.sessionId); if (!sessionId.ok) return invalid("invalid session action response");
  const flags = ["viewed", "messageSent", "enabled"] as const;
  for (const flag of flags) if (object.value[flag] !== undefined && typeof object.value[flag] !== "boolean") return invalid("invalid session action response");
  return { ok: true, value: { success: true, sessionId: sessionId.value, ...(typeof object.value.viewed === "boolean" ? { viewed: object.value.viewed } : {}), ...(typeof object.value.messageSent === "boolean" ? { messageSent: object.value.messageSent } : {}), ...(typeof object.value.enabled === "boolean" ? { enabled: object.value.enabled } : {}) } };
}
export function parseSessionAttentionStateResponse(value: unknown): ParseResult<SessionAttentionStateResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const sessionId = nonEmptyString(object.value.sessionId); const needsAttention = parseJsonBoolean(object.value.needsAttention);
  return sessionId.ok && needsAttention.ok ? { ok: true, value: { sessionId: sessionId.value, needsAttention: needsAttention.value } } : invalid("invalid session attention state");
}
const hasSessionSnapshotRegions = (regions: Record<string, unknown>): boolean => {
  if (!oneOf(regions.lifecycle, SESSION_LIFECYCLE_VALUES).ok || !oneOf(regions.activity, SESSION_ACTIVITY_VALUES).ok) return false;
  return ["interruptions", "history", "retry", "error"].every((name) => typeof regions[name] === "string");
};
const hasSessionSnapshotMeta = (meta: Record<string, unknown>): boolean =>
  parseJsonNumber(meta.revision).ok && parseJsonNumber(meta.updatedAt).ok && (meta.sourceEventId === null || typeof meta.sourceEventId === "string") && (meta.hydratedAt === null || parseJsonNumber(meta.hydratedAt).ok);
// eslint-disable-next-line complexity -- each independent transport discriminator must be checked before returning the opaque snapshot body.
export function parseSessionStateResponse(value: unknown): ParseResult<SessionStateResponse> {
  const object = parseJsonObject(value); if (!object.ok) return invalid("invalid session state");
  if (object.value.version !== 1) return invalid("invalid session state");
  const sessionId = nonEmptyString(object.value.sessionId); const key = parseJsonObject(object.value.key); const regions = parseJsonObject(object.value.regions); const meta = parseJsonObject(object.value.meta);
  if (!sessionId.ok) return invalid("invalid session state");
  if (!key.ok) return invalid("invalid session state");
  if (!regions.ok) return invalid("invalid session state");
  if (!meta.ok) return invalid("invalid session state");
  if (key.value.sessionId !== sessionId.value) return invalid("invalid session state");
  if (!nonEmptyString(key.value.directory).ok) return invalid("invalid session state");
  if (!hasSessionSnapshotRegions(regions.value)) return invalid("invalid session state");
  if (!hasSessionSnapshotMeta(meta.value)) return invalid("invalid session state");
  return { ok: true, value: object.value as SessionStateResponse };
}
