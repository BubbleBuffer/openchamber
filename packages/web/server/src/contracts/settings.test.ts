import { describe, expect, it } from "vitest";
import { parseAppSettingsResponse, parsePersistedSettings } from "./settings.js";

describe("settings contract", () => {
  it("removes unknown persisted fields while preserving server-only fields", () => {
    expect(parsePersistedSettings({ themeId: "dark", publicOrigin: "https://app.test", vapidKeys: { publicKey: "key" }, obsolete: true })).toEqual({
      ok: true,
      value: { themeId: "dark", publicOrigin: "https://app.test", vapidKeys: { publicKey: "key" } },
    });
  });

  it("rejects malformed browser-visible successful responses", () => {
    expect(parseAppSettingsResponse({ themeId: "dark", pwaOrientation: "system" }).ok).toBe(true);
    expect(parseAppSettingsResponse([]).ok).toBe(false);
    expect(parseAppSettingsResponse({ themeId: 1 }).ok).toBe(false);
  });
});
