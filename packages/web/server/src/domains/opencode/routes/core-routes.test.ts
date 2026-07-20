/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { parseThemesListResponse, themesError } from "../../../contracts/themes.js";
import { registerSettingsUtilityRoutes } from "./core-routes.js";

describe("settings utility route contract ownership", () => {
  it("keeps custom theme listing malformed payloads and safe failures explicit", () => {
    expect(parseThemesListResponse({ themes: [] }).ok).toBe(true);
    expect(parseThemesListResponse({ themes: "invalid" }).ok).toBe(false);
    expect(themesError("themes_internal_error", "Failed to load custom themes")).toEqual({
      error: "Failed to load custom themes",
      code: "themes_internal_error",
    });
  });

  it("returns a coded safe error when custom theme discovery fails", async () => {
    let route: ((req: unknown, res: any) => Promise<void>) | undefined;
    registerSettingsUtilityRoutes({ get: (_path: string, handler: typeof route) => { route = handler; }, post() {} } as never, {
      readCustomThemesFromDisk: async () => { throw new Error("disk details"); },
      refreshOpenCodeAfterConfigChange: async () => {},
      clientReloadDelayMs: 0,
    });
    const res = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await route!({}, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(themesError("themes_internal_error", "Failed to load custom themes"));
  });
});
