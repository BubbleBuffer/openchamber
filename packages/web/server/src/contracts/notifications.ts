import { parseJsonBoolean, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const NOTIFICATION_ERROR_CODES = ["notification_invalid_request", "notification_unauthorized", "notification_unavailable"] as const;
export const NOTIFICATION_SSE_CONTENT_TYPE = "text/event-stream; charset=utf-8" as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];
export type NotificationErrorResponse = { error: string; code: NotificationErrorCode };
export type PushSubscribeRequest = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushUnsubscribeRequest = { endpoint: string };
export type PushVisibilityRequest = { visible: boolean };
export type PushResponse = { ok: true };
export type VapidPublicKeyResponse = { publicKey: string };
export type NotificationSseEvent = { type: "openchamber:notification-stream-ready"; properties: Record<string, unknown> };
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
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
