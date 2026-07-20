import { describe, expect, it } from "vitest";

import { createRequestSecurityRuntime } from "./request-security.js";

describe("request security origin checks", () => {
  it("allows only the active local origin aliases and configured public origin", async () => {
    const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({ publicOrigin: "https://ui.example.test/path" }) });
    const request = (origin: string) => ({
      headers: { origin, host: "localhost:3000", "x-forwarded-proto": "http" },
      socket: {},
    }) as never;

    await expect(security.isRequestOriginAllowed(request("http://127.0.0.1:3000"))).resolves.toBe(true);
    await expect(security.isRequestOriginAllowed(request("https://ui.example.test"))).resolves.toBe(true);
    await expect(security.isRequestOriginAllowed(request("https://attacker.example.test"))).resolves.toBe(false);
    await expect(security.isRequestOriginAllowed(({ headers: { host: "localhost:3000" }, socket: {} }) as never)).resolves.toBe(false);
  });
});
