import { describe, expect, it } from "vitest";
import { parsePushSubscribeRequest, parsePushResponse } from "./notifications.js";

describe("notifications contract", () => {
  it("validates push requests and safe auth responses", () => {
    expect(parsePushSubscribeRequest({ endpoint: "https://push.test", keys: { p256dh: "a", auth: "b" } }).ok).toBe(true);
    expect(parsePushSubscribeRequest({ endpoint: 1 }).ok).toBe(false);
    expect(parsePushResponse({ ok: true })).toEqual({ ok: true, value: { ok: true } });
    expect(parsePushResponse({ ok: "yes" }).ok).toBe(false);
  });
});
