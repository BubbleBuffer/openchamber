import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTE_INVENTORY } from "./route-inventory.js";

describe("route inventory", () => {
  it("assigns every active route registrar an explicit classification", () => {
    expect(new Set(ROUTE_INVENTORY.map((entry) => entry.registrar)).size).toBe(ROUTE_INVENTORY.length);
    expect(ROUTE_INVENTORY.every((entry) => entry.owner.length > 0)).toBe(true);
  });

  it("assigns each active endpoint to one registrar", () => {
    const endpoints = ROUTE_INVENTORY.flatMap((entry) => entry.endpoints);
    expect(new Set(endpoints).size).toBe(endpoints.length);
  });

  it("covers every literal endpoint registered by active route modules", () => {
    const root = resolve(import.meta.dirname, "..");
    const registrars = [
      { path: "domains/routes/core-routes.ts", functions: ["registerServerStatusRoutes", "registerAuthAndAccessRoutes"] },
      { path: "domains/routes/openchamber-routes.ts" },
      { path: "domains/notifications/routes.ts" }, { path: "domains/server-utils/proxy.ts" },
      { path: "domains/quota/routes.ts" }, { path: "domains/magic-prompts/routes.ts" }, { path: "domains/session-folders/routes.ts" },
      { path: "domains/fs/routes.ts" }, { path: "domains/git/routes.ts" }, { path: "domains/github/routes.ts" }, { path: "domains/terminal/routes.ts" },
      { path: "domains/opencode/routes/core-routes.ts", functions: ["registerSettingsUtilityRoutes"] }, { path: "domains/opencode/routes/routes.ts" },
      { path: "domains/opencode/routes/config-entity-routes.ts" }, { path: "domains/opencode/routes/project-icon-routes.ts" },
      { path: "domains/opencode/routes/skill-routes.ts" }, { path: "domains/routes/pwa-manifest.ts" },
      { path: "domains/terminal/ws-server.ts" },
    ];
    const actual = new Set<string>();
    for (const registrar of registrars) {
      const fullSource = readFileSync(resolve(root, registrar.path), "utf8");
      const source = registrar.functions
        ? registrar.functions.map((name) => {
          const start = fullSource.indexOf(`export function ${name}`);
          const end = fullSource.indexOf("\nexport function ", start + 1);
          return fullSource.slice(start, end === -1 ? undefined : end);
        }).join("\n")
        : fullSource;
      for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'](\/[^"']*)["']/g)) {
        actual.add(`${registrar.path}:${match[1]} ${match[2]}`);
      }
    }
    const terminalWsSource = readFileSync(resolve(root, "domains/terminal/ws-server.ts"), "utf8");
    const terminalWsPath = readFileSync(resolve(root, "domains/terminal/types.ts"), "utf8").match(/TERMINAL_WS_PATH\s*=\s*["']([^"']+)["']/)?.[1];
    if (terminalWsSource.includes("TERMINAL_WS_PATH as WS_PATH") && terminalWsPath) {
      actual.add(`domains/terminal/ws-server.ts:get ${terminalWsPath}`);
    }
    for (const path of ["/api/event/ws", "/api/global/event/ws"]) {
      actual.add(`domains/event-stream:get ${path}`);
    }
    const declared = new Set(ROUTE_INVENTORY.flatMap((entry) => entry.endpoints.map((endpoint) => `${entry.registrar}:${endpoint}`)));
    expect([...actual].filter((endpoint) => !declared.has(endpoint))).toEqual([]);
  });
});
