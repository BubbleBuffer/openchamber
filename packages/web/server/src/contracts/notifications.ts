import { parseJsonBoolean, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const NOTIFICATION_ERROR_CODES = ["notification_invalid_request", "notification_unauthorized", "notification_unavailable"] as const;
export type PushSubscribeRequest = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushResponse = { ok: true };
export type NotificationSseEvent = { type: "openchamber:notification-stream-ready"; properties: Record<string, unknown> };
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
export function parsePushSubscribeRequest(value: unknown): ParseResult<PushSubscribeRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const endpoint = parseJsonString(object.value.endpoint); const keys = parseJsonObject(object.value.keys);
  if (!endpoint.ok || !keys.ok) return invalid("invalid push subscription");
  const p256dh = parseJsonString(keys.value.p256dh); const auth = parseJsonString(keys.value.auth);
  return p256dh.ok && auth.ok ? { ok: true, value: { endpoint: endpoint.value, keys: { p256dh: p256dh.value, auth: auth.value } } } : invalid("invalid push keys");
}
export function parsePushUnsubscribeRequest(value: unknown): ParseResult<{ endpoint: string }> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const endpoint = parseJsonString(object.value.endpoint);
  return endpoint.ok && endpoint.value.length > 0 ? { ok: true, value: { endpoint: endpoint.value } } : invalid("endpoint is required");
}
export function parseVisibilityRequest(value: unknown): ParseResult<{ visible: boolean }> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const visible = parseJsonBoolean(object.value.visible);
  return visible.ok ? { ok: true, value: { visible: visible.value } } : invalid("visible is required");
}
export function parsePushResponse(value: unknown): ParseResult<PushResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const ok = parseJsonBoolean(object.value.ok); return ok.ok && ok.value ? { ok: true, value: { ok: true } } : invalid("invalid push response");
}
export function parseNotificationSseEvent(value: unknown): ParseResult<NotificationSseEvent> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.type !== "openchamber:notification-stream-ready") return invalid("unknown notification event");
  const properties = parseJsonObject(object.value.properties);
  return properties.ok ? { ok: true, value: { type: "openchamber:notification-stream-ready", properties: properties.value } } : invalid("invalid notification event");
}
