import { describe, expect, it } from "vitest";
import { parseNotificationSseEvent, parsePushSubscribeRequest, parsePushResponse, parseSessionActivityResponse, parseSessionActionRequest, parseSessionSnapshotResponse, parseVapidPublicKeyResponse } from "./notifications.js";

describe("notifications contract", () => {
  it("validates push requests and safe auth responses", () => {
    expect(parsePushSubscribeRequest({ endpoint: "https://push.test", keys: { p256dh: "a", auth: "b" } }).ok).toBe(true);
    expect(parsePushSubscribeRequest({ endpoint: 1 }).ok).toBe(false);
    expect(parsePushResponse({ ok: true })).toEqual({ ok: true, value: { ok: true } });
    expect(parsePushResponse({ ok: "yes" }).ok).toBe(false);
  });

  it("accepts only OpenChamber synthetic notification stream events", () => {
    expect(parseNotificationSseEvent({ type: "openchamber:notification-stream-ready", properties: {} }).ok).toBe(true);
    expect(parseNotificationSseEvent({ type: "sdk:event", properties: {} }).ok).toBe(false);
    expect(parseNotificationSseEvent([]).ok).toBe(false);
  });

  it("rejects malformed public key and empty push request fields", () => {
    expect(parseVapidPublicKeyResponse({ publicKey: "key" }).ok).toBe(true);
    expect(parseVapidPublicKeyResponse({ publicKey: 1 }).ok).toBe(false);
    expect(parsePushSubscribeRequest({ endpoint: "", keys: { p256dh: "a", auth: "b" } }).ok).toBe(false);
  });

  it("accepts only safe session activity, snapshot, and action transport values", () => {
    expect(parseSessionActivityResponse([{ directory: "/project", sessionId: "session-1", activity: "busy" }]).ok).toBe(true);
    expect(parseSessionActivityResponse([{ directory: "/project", sessionId: "session-1", activity: "runtime-detail" }]).ok).toBe(false);
    expect(parseSessionSnapshotResponse({
      statusSessions: [{ directory: "/project", sessionId: "session-1", status: "streaming" }],
      attentionSessions: [{ directory: "/project", sessionId: "session-1", needsAttention: true }],
      serverTime: 1,
    }).ok).toBe(true);
    expect(parseSessionSnapshotResponse({ statusSessions: [], attentionSessions: [], serverTime: "now" }).ok).toBe(false);
    expect(parseSessionActionRequest({ sessionId: " session-1 ", enabled: true })).toEqual({ ok: true, value: { sessionId: "session-1", enabled: true } });
    expect(parseSessionActionRequest({ sessionId: "session-1", enabled: "true" }).ok).toBe(false);
  });
});
