import { describe, expect, it } from "vitest";
import { normalizeOpenCodePayload } from "./event-normalizer.js";
import type { NormalizedPayloadResult, NormalizedEventError, NormalizedEventResult } from "./types.js";

function getEvent(results: Array<NormalizedPayloadResult | NormalizedEventError>) {
  for (const r of results) {
    if ("event" in r) return r.event;
  }
  return null;
}

describe("event normalizer", () => {
  it("normalizes session.status busy to STREAM_STARTED", () => {
    const results = normalizeOpenCodePayload({
      type: "session.status",
      id: "evt-1",
      properties: {
        sessionID: "abc123",
        info: { type: "busy" },
      },
    }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("STREAM_STARTED");
  });

  it("normalizes session.status idle to STREAM_COMPLETED", () => {
    const results = normalizeOpenCodePayload({
      type: "session.status",
      id: "evt-2",
      properties: {
        sessionID: "abc123",
        info: { type: "idle" },
      },
    }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("STREAM_COMPLETED");
  });

  it("normalizes message.added to MESSAGE_ADDED", () => {
    const results = normalizeOpenCodePayload({
      type: "message.added",
      id: "evt-3",
      properties: {
        sessionID: "abc123",
        message: { id: "msg1", role: "user" },
      },
    }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("MESSAGE_ADDED");
  });

  it("normalizes permission.asked to PERMISSION_REQUESTED", () => {
    const results = normalizeOpenCodePayload({
      type: "permission.asked",
      id: "evt-4",
      properties: {
        sessionID: "abc123",
        permission: { id: "perm1", permission: "bash", patterns: [], metadata: {} },
      },
    }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("PERMISSION_REQUESTED");
  });

  it("returns error for unknown payload type", () => {
    const results = normalizeOpenCodePayload({ type: "unknown.thing", id: "x", properties: { sessionID: "abc123" } }, "global");
    expect(results.length).toBe(1);
    expect("error" in results[0]).toBe(true);
  });

  it("returns empty array for null/undefined payload", () => {
    expect(normalizeOpenCodePayload(null, "global")).toEqual([]);
    expect(normalizeOpenCodePayload(undefined, "global")).toEqual([]);
  });

  it("preserves sourceEventId from payload", () => {
    const results = normalizeOpenCodePayload({
      type: "session.status",
      id: "evt-456",
      properties: {
        sessionID: "abc123",
        info: { type: "busy" },
      },
    }, "global");
    const first = results[0];
    expect("event" in first).toBe(true);
    expect((first as NormalizedEventResult).sourceEventId).toBe("evt-456");
  });
});