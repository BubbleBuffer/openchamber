import { parseJsonNumber, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export interface SseEventEnvelope<T = unknown> { eventId: string | null; directory: string | null; payload: T; }
export const MESSAGE_STREAM_GLOBAL_WS_PATH = "/api/global/event/ws" as const;
export const MESSAGE_STREAM_DIRECTORY_WS_PATH = "/api/event/ws" as const;
export type MessageStreamScope = "global" | "directory";
export type MessageStreamWsFrame =
  | { type: "ready"; scope?: MessageStreamScope; lastEventId?: string }
  | { type: "event"; payload: unknown; eventId?: string; directory?: string; scope?: MessageStreamScope }
  | { type: "error"; message: string; code?: string }
  | { type: "data_stalled"; duration: number }
  | { type: "data_resumed"; lastEventId?: string };
export type OpenChamberSyntheticEvent = { type: "openchamber:notification" | "openchamber:status"; properties?: Record<string, unknown> };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const optionalString = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const optionalScope = (value: unknown): MessageStreamScope | undefined => value === "global" || value === "directory" ? value : undefined;

export function parseMessageStreamWsFrame(value: unknown): ParseResult<MessageStreamWsFrame> {
  const object = parseJsonObject(value);
  if (!object.ok) return object;
  const { type } = object.value;
  switch (type) {
    case "ready": return { ok: true, value: { type, scope: optionalScope(object.value.scope), lastEventId: optionalString(object.value.lastEventId) } };
    case "event":
      if (!("payload" in object.value)) return invalid("event frame requires payload");
      return { ok: true, value: { type, payload: object.value.payload, eventId: optionalString(object.value.eventId), directory: optionalString(object.value.directory), scope: optionalScope(object.value.scope) } };
    case "error": {
      const message = parseJsonString(object.value.message);
      return message.ok ? { ok: true, value: { type, message: message.value, code: optionalString(object.value.code) } } : invalid("error frame requires message");
    }
    case "data_stalled": {
      const duration = parseJsonNumber(object.value.duration);
      return duration.ok ? { ok: true, value: { type, duration: duration.value } } : invalid("data_stalled frame requires duration");
    }
    case "data_resumed": return { ok: true, value: { type, lastEventId: optionalString(object.value.lastEventId) } };
    default: return invalid("unknown message stream frame");
  }
}

export function parseSseEventEnvelope(value: unknown): ParseResult<SseEventEnvelope> {
  const object = parseJsonObject(value);
  if (!object.ok) return object;
  if ("payload" in object.value) {
    return { ok: true, value: { eventId: optionalString(object.value.eventId) ?? null, directory: optionalString(object.value.directory) ?? null, payload: object.value.payload } };
  }
  const properties = parseJsonObject(object.value.properties);
  return { ok: true, value: { eventId: optionalString(object.value.eventId) ?? null, directory: properties.ok ? optionalString(properties.value.directory) ?? null : null, payload: value } };
}
