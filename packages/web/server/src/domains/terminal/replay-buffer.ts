import { Buffer } from "node:buffer";
import { TERMINAL_OUTPUT_REPLAY_MAX_BYTES } from "./types.js";
import type { ReplayBufferState, ReplayChunk } from "./types.js";

// Re-export constant for test consumers
export { TERMINAL_OUTPUT_REPLAY_MAX_BYTES } from "./types.js";

const trimTerminalOutputChunkToMaxBytes = (
  data: string,
  maxBytes: number,
): string => {
  if (typeof data !== "string" || data.length === 0) {
    return "";
  }

  const bytes = Buffer.byteLength(data, "utf8");
  if (bytes <= maxBytes) {
    return data;
  }

  const trimmedBuffer = Buffer.from(data, "utf8").subarray(-maxBytes);
  return trimmedBuffer.toString("utf8");
};

export const createTerminalOutputReplayBuffer = (): ReplayBufferState => ({
  chunks: [],
  totalBytes: 0,
  nextId: 1,
});

export const appendTerminalOutputReplayChunk = (
  bufferState: ReplayBufferState,
  data: string,
  maxBytes: number = TERMINAL_OUTPUT_REPLAY_MAX_BYTES,
): ReplayChunk | null => {
  const normalizedData = trimTerminalOutputChunkToMaxBytes(data, maxBytes);
  if (!normalizedData) {
    return null;
  }

  const bytes = Buffer.byteLength(normalizedData, "utf8");
  const chunk: ReplayChunk = {
    id: bufferState.nextId,
    data: normalizedData,
    bytes,
  };

  bufferState.nextId += 1;
  bufferState.chunks.push(chunk);
  bufferState.totalBytes += bytes;

  while (
    bufferState.totalBytes > maxBytes &&
    bufferState.chunks.length > 1
  ) {
    const removedChunk = bufferState.chunks.shift();
    bufferState.totalBytes -= removedChunk?.bytes ?? 0;
  }

  return chunk;
};

export const listTerminalOutputReplayChunksSince = (
  bufferState: ReplayBufferState,
  lastSeenId: number = 0,
): ReplayChunk[] =>
  bufferState.chunks.filter((chunk) => chunk.id > lastSeenId);

export const getLatestTerminalOutputReplayChunkId = (
  bufferState: ReplayBufferState,
): number => {
  if (bufferState.chunks.length === 0) {
    return 0;
  }

  return bufferState.chunks[bufferState.chunks.length - 1]?.id ?? 0;
};