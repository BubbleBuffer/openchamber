import {
  parseJsonBoolean,
  parseJsonObject,
  parseJsonString,
  type ParseResult,
} from "./common.js";

export const TERMINAL_WS_PATH = "/api/terminal/ws" as const;
export const TERMINAL_SSE_CONTENT_TYPE = "text/event-stream" as const;
export const TERMINAL_WS_CONTROL_TAG_JSON = 0x01;

export const TERMINAL_ERROR_CODES = [
  "terminal_invalid_request",
  "terminal_unauthorized",
  "terminal_session_not_found",
  "terminal_rate_limited",
  "terminal_not_bound",
  "terminal_bad_frame",
  "terminal_process_failed",
  "terminal_unavailable",
] as const;
export type TerminalErrorCode = (typeof TERMINAL_ERROR_CODES)[number];
export type TerminalErrorResponse = { error: string; code: TerminalErrorCode };

export type TerminalWsTransport = { path: string; v: number; enc: string };
export type TerminalTransportCapability = {
  preferred: "ws" | "http" | "sse";
  transports: Array<"ws" | "http" | "sse">;
  ws?: TerminalWsTransport;
};
export type TerminalCapabilities = {
  input: TerminalTransportCapability;
  stream: TerminalTransportCapability;
};
export type TerminalSessionResponse = {
  sessionId: string;
  cols: number;
  rows: number;
  capabilities: TerminalCapabilities;
};
export type TerminalCreateRequest = { cwd: string; cols?: number; rows?: number };
export type TerminalRestartRequest = TerminalCreateRequest;
export type TerminalInputRequest = string;
export type TerminalResizeRequest = { cols: number; rows: number };
export type TerminalSuccessResponse = { success: true };
export type TerminalResizeResponse = TerminalSuccessResponse & TerminalResizeRequest;
export type TerminalKillRequest = { sessionId?: string; cwd?: string };
export type TerminalKillResponse = TerminalSuccessResponse & { killedCount: number };

export type TerminalWsControlFrame =
  | { t: "p"; v: number }
  | { t: "po"; v: number }
  | { t: "ok"; v: number }
  | { t: "b"; s: string; r?: number; v: number }
  | { t: "bok"; s: string; v: number; runtime: "node" | "bun"; ptyBackend: string }
  | { t: "x"; s: string; v: number; exitCode: number; signal: number }
  | { t: "e"; c: TerminalErrorCode; f: boolean };
export type TerminalWsDataFrame = string;

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const isDimension = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const optionalDimension = (value: unknown): ParseResult<number | undefined> =>
  value === undefined ? { ok: true, value: undefined } : isDimension(value) ? { ok: true, value } : invalid("invalid terminal dimensions");
const isErrorCode = (value: unknown): value is TerminalErrorCode =>
  typeof value === "string" && (TERMINAL_ERROR_CODES as readonly string[]).includes(value);

export const terminalError = (code: TerminalErrorCode): TerminalErrorResponse => ({
  error: code === "terminal_process_failed" || code === "terminal_unavailable" ? "Terminal operation failed" : "Terminal request failed",
  code,
});

export function parseTerminalCreateRequest(value: unknown): ParseResult<TerminalCreateRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const cwd = parseJsonString(object.value.cwd);
  const cols = optionalDimension(object.value.cols); const rows = optionalDimension(object.value.rows);
  return cwd.ok && cwd.value.length > 0 && cols.ok && rows.ok
    ? { ok: true, value: { cwd: cwd.value, ...(cols.value === undefined ? {} : { cols: cols.value }), ...(rows.value === undefined ? {} : { rows: rows.value }) } }
    : invalid("invalid terminal create request");
}
export const parseTerminalRestartRequest = parseTerminalCreateRequest;
export const parseTerminalInputRequest = (value: unknown): ParseResult<TerminalInputRequest> =>
  typeof value === "string" ? { ok: true, value } : invalid("invalid terminal input");
export function parseTerminalResizeRequest(value: unknown): ParseResult<TerminalResizeRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  return isDimension(object.value.cols) && isDimension(object.value.rows)
    ? { ok: true, value: { cols: object.value.cols, rows: object.value.rows } }
    : invalid("invalid terminal dimensions");
}
export function parseTerminalKillRequest(value: unknown): ParseResult<TerminalKillRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const { sessionId, cwd } = object.value;
  return (sessionId === undefined || typeof sessionId === "string") && (cwd === undefined || typeof cwd === "string")
    ? { ok: true, value: { ...(typeof sessionId === "string" ? { sessionId } : {}), ...(typeof cwd === "string" ? { cwd } : {}) } }
    : invalid("invalid terminal kill request");
}

// eslint-disable-next-line complexity -- a single shallow wire-shape check keeps capability ownership centralized.
const parseCapability = (value: unknown): ParseResult<TerminalTransportCapability> => {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const preferred = object.value.preferred;
  const transports = object.value.transports;
  if ((preferred !== "ws" && preferred !== "http" && preferred !== "sse") || !Array.isArray(transports) || !transports.every((item) => item === "ws" || item === "http" || item === "sse")) return invalid("invalid terminal capability");
  if (object.value.ws === undefined) return { ok: true, value: { preferred, transports } };
  const ws = parseJsonObject(object.value.ws);
  return ws.ok && typeof ws.value.path === "string" && ws.value.path.length > 0 && isDimension(ws.value.v) && typeof ws.value.enc === "string"
    ? { ok: true, value: { preferred, transports, ws: { path: ws.value.path, v: ws.value.v, enc: ws.value.enc } } }
    : invalid("invalid terminal websocket capability");
};
export function parseTerminalSessionResponse(value: unknown): ParseResult<TerminalSessionResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const capabilities = parseJsonObject(object.value.capabilities);
  const input = capabilities.ok ? parseCapability(capabilities.value.input) : invalid("invalid terminal capabilities");
  const stream = capabilities.ok ? parseCapability(capabilities.value.stream) : invalid("invalid terminal capabilities");
  return typeof object.value.sessionId === "string" && object.value.sessionId.length > 0 && isDimension(object.value.cols) && isDimension(object.value.rows) && input.ok && stream.ok
    ? { ok: true, value: { sessionId: object.value.sessionId, cols: object.value.cols, rows: object.value.rows, capabilities: { input: input.value, stream: stream.value } } }
    : invalid("invalid terminal session response");
}
export function parseTerminalSuccessResponse(value: unknown): ParseResult<TerminalSuccessResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const success = parseJsonBoolean(object.value.success);
  return success.ok && success.value ? { ok: true, value: { success: true } } : invalid("invalid terminal success response");
}
export function parseTerminalErrorResponse(value: unknown): ParseResult<TerminalErrorResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  return typeof object.value.error === "string" && isErrorCode(object.value.code)
    ? { ok: true, value: { error: object.value.error, code: object.value.code } }
    : invalid("invalid terminal error response");
}

// eslint-disable-next-line complexity -- tagged-frame validation intentionally branches once on the discriminator.
export function parseTerminalWsControlFrame(value: unknown): ParseResult<TerminalWsControlFrame> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const { t } = object.value;
  if ((t === "p" || t === "po" || t === "ok") && isDimension(object.value.v)) return { ok: true, value: { t, v: object.value.v } };
  if (t === "b" && typeof object.value.s === "string" && object.value.s.trim().length > 0 && isDimension(object.value.v) && (object.value.r === undefined || (typeof object.value.r === "number" && Number.isSafeInteger(object.value.r) && object.value.r >= 0))) return { ok: true, value: { t, s: object.value.s, ...(object.value.r === undefined ? {} : { r: object.value.r }), v: object.value.v } };
  if (t === "bok" && typeof object.value.s === "string" && isDimension(object.value.v) && (object.value.runtime === "node" || object.value.runtime === "bun") && typeof object.value.ptyBackend === "string") return { ok: true, value: { t, s: object.value.s, v: object.value.v, runtime: object.value.runtime, ptyBackend: object.value.ptyBackend } };
  if (t === "x" && typeof object.value.s === "string" && isDimension(object.value.v) && typeof object.value.exitCode === "number" && Number.isFinite(object.value.exitCode) && typeof object.value.signal === "number" && Number.isFinite(object.value.signal)) return { ok: true, value: { t, s: object.value.s, v: object.value.v, exitCode: object.value.exitCode, signal: object.value.signal } };
  if (t === "e" && isErrorCode(object.value.c) && typeof object.value.f === "boolean") return { ok: true, value: { t, c: object.value.c, f: object.value.f } };
  return invalid("invalid terminal websocket control frame");
}
export const parseTerminalWsDataFrame = (value: unknown): ParseResult<TerminalWsDataFrame> =>
  typeof value === "string" ? { ok: true, value } : invalid("invalid terminal websocket data frame");
