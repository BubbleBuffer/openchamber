import { describe, expect, it } from "vitest";
import { parseThemesListResponse } from "./themes.js";

const theme = {
  metadata: { id: "custom", name: "Custom", description: "", version: "1.0.0", variant: "dark", tags: [] },
  colors: {
    primary: { base: "#000", foreground: "#fff" },
    surface: { background: "#000", foreground: "#fff", muted: "#000", mutedForeground: "#fff", elevated: "#000", elevatedForeground: "#fff", subtle: "#000" },
    interactive: { border: "#000", selection: "#000", selectionForeground: "#fff", focusRing: "#fff", hover: "#000" },
    status: { error: "#000", errorForeground: "#fff", errorBackground: "#000", errorBorder: "#000", warning: "#000", warningForeground: "#fff", warningBackground: "#000", warningBorder: "#000", success: "#000", successForeground: "#fff", successBackground: "#000", successBorder: "#000", info: "#000", infoForeground: "#fff", infoBackground: "#000", infoBorder: "#000" },
    syntax: { base: { background: "#000", foreground: "#fff", keyword: "#fff", string: "#fff", number: "#fff", function: "#fff", variable: "#fff", type: "#fff", comment: "#fff", operator: "#fff" }, highlights: { diffAdded: "#000", diffRemoved: "#000", lineNumber: "#fff" } },
  },
};

describe("themes contracts", () => {
  it("accepts valid custom theme lists", () => {
    expect(parseThemesListResponse({ themes: [theme] }).ok).toBe(true);
  });

  it("rejects null and malformed theme payloads", () => {
    expect(parseThemesListResponse(null).ok).toBe(false);
    expect(parseThemesListResponse({ themes: [{ ...theme, metadata: { ...theme.metadata, variant: "system" } }] }).ok).toBe(false);
  });
});
