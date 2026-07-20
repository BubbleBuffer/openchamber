import { describe, expect, it } from "vitest";

import { parseMessageStreamWsFrame, parseSseEventEnvelope } from "./event-stream.js";

describe("message stream contracts", () => {
  it("accepts every outer websocket frame variant", () => {
    for (const frame of [
      { type: "ready", scope: "global" },
      { type: "event", payload: { type: "sdk.unknown" }, eventId: "1", directory: "/tmp" },
      { type: "error", message: "unavailable", code: "opencode_unavailable" },
      { type: "data_stalled", duration: 10 },
      { type: "data_resumed", lastEventId: "1" },
    ]) {
      expect(parseMessageStreamWsFrame(frame).ok).toBe(true);
    }
  });

  it("rejects malformed and unknown outer frames without inspecting SDK payloads", () => {
    expect(parseMessageStreamWsFrame({ type: "event" }).ok).toBe(false);
    expect(parseMessageStreamWsFrame({ type: "unknown" }).ok).toBe(false);
    expect(parseMessageStreamWsFrame({ type: "event", payload: { deeply: { opaque: true } } }).ok).toBe(true);
  });

  it("supports wrapped and unwrapped SSE payloads", () => {
    expect(parseSseEventEnvelope({ directory: "/tmp", payload: { type: "event" } }).ok).toBe(true);
    expect(parseSseEventEnvelope({ type: "event", properties: { directory: "/tmp" } }).ok).toBe(true);
  });
});
