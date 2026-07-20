import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTE_INVENTORY } from "./route-inventory.js";

describe("route inventory", () => {
  it("assigns every active route registrar an explicit classification", () => {
    expect(new Set(ROUTE_INVENTORY.map((entry) => entry.registrar)).size).toBe(ROUTE_INVENTORY.length);
    expect(ROUTE_INVENTORY.every((entry) => entry.owner.length > 0)).toBe(true);
  });

  it("covers every literal endpoint registered by active route modules", () => {
    const root = resolve(import.meta.dirname, "..");
    const registrars = [
      "domains/routes/core-routes.ts", "domains/routes/openchamber-routes.ts",
      "domains/notifications/routes.ts", "domains/server-utils/proxy.ts",
      "domains/quota/routes.ts", "domains/magic-prompts/routes.ts", "domains/session-folders/routes.ts",
      "domains/fs/routes.ts", "domains/git/routes.ts", "domains/github/routes.ts", "domains/terminal/routes.ts",
      "domains/opencode/routes/core-routes.ts", "domains/opencode/routes/routes.ts",
      "domains/opencode/routes/config-entity-routes.ts", "domains/opencode/routes/project-icon-routes.ts",
      "domains/opencode/routes/skill-routes.ts", "domains/routes/pwa-manifest.ts",
    ];
    const actual = new Set<string>();
    for (const registrar of registrars) {
      const source = readFileSync(resolve(root, registrar), "utf8");
      for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'](\/[^"']*)["']/g)) {
        actual.add(`${registrar}:${match[1]} ${match[2]}`);
      }
    }
    const declared = new Set(ROUTE_INVENTORY.flatMap((entry) => entry.endpoints.map((endpoint) => `${entry.registrar}:${endpoint}`)));
    expect([...actual].filter((endpoint) => !declared.has(endpoint))).toEqual([]);
  });
});
