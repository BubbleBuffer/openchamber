import { Buffer } from "node:buffer";
import {
  TERMINAL_WS_CONTROL_TAG_JSON,
  TERMINAL_WS_PATH,
  parseTerminalWsControlFrame,
  type TerminalWsControlFrame,
} from "../../contracts/terminal.js";

// Re-export constants for external consumers
export { TERMINAL_WS_PATH, TERMINAL_WS_CONTROL_TAG_JSON } from "../../contracts/terminal.js";

export const parseRequestPathname = (requestUrl: unknown): string => {
  if (typeof requestUrl !== "string" || requestUrl.length === 0) {
    return "";
  }

  try {
    return new URL(requestUrl, "http://localhost").pathname;
  } catch {
    return "";
  }
};

export const isTerminalWsPathname = (pathname: string): boolean =>
  pathname === TERMINAL_WS_PATH;

export const normalizeTerminalWsMessageToBuffer = (rawData: unknown): Buffer => {
  if (Buffer.isBuffer(rawData)) {
    return rawData;
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(
      rawData.map((chunk: unknown) =>
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer),
      ),
    );
  }

  return Buffer.from(rawData as ArrayBuffer);
};

export const normalizeTerminalWsMessageToText = (rawData: unknown): string => {
  if (typeof rawData === "string") {
    return rawData;
  }

  return normalizeTerminalWsMessageToBuffer(rawData).toString("utf8");
};

export const readTerminalWsControlFrame = (
  rawData: unknown,
): TerminalWsControlFrame | null => {
  if (!rawData) {
    return null;
  }

  const buffer = normalizeTerminalWsMessageToBuffer(rawData);
  if (buffer.length < 2 || buffer[0] !== TERMINAL_WS_CONTROL_TAG_JSON) {
    return null;
  }

  try {
    const parsed = JSON.parse(buffer.subarray(1).toString("utf8")) as unknown;
    const controlFrame = parseTerminalWsControlFrame(parsed);
    return controlFrame.ok ? controlFrame.value : null;
  } catch {
    return null;
  }
};

export const createTerminalWsControlFrame = (
  payload: TerminalWsControlFrame,
): Buffer => {
  const jsonBytes = Buffer.from(JSON.stringify(payload), "utf8");
  return Buffer.concat([Buffer.from([TERMINAL_WS_CONTROL_TAG_JSON]), jsonBytes]);
};

export const pruneRebindTimestamps = (
  timestamps: number[],
  now: number,
  windowMs: number,
): number[] => timestamps.filter((timestamp) => now - timestamp < windowMs);

export const isRebindRateLimited = (
  timestamps: number[],
  maxPerWindow: number,
): boolean => timestamps.length >= maxPerWindow;
