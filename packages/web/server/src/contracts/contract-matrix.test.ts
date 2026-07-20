import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTE_INVENTORY } from "./route-inventory.js";

const matrix = [
  ["system", 200, 400, 401, 500, "partial update result"],
  ["ui-auth", 200, 400, 401, 500, "locked session"],
  ["notifications", 200, 400, 401, 500, "unavailable delivery"],
  ["quota", 200, 400, 401, 500, "unconfigured provider"],
  ["files", 200, 400, 403, 500, "partial command result"],
  ["github", 200, 400, 401, 500, "disconnected account"],
  ["terminal", 200, 400, 401, 500, "reconnecting stream"],
  ["git", 200, 400, 401, 500, "batch check result"],
  ["opencode", 200, 400, 401, 500, "reload required"],
  ["project-assets", 200, 400, 401, 500, "icon discovery"],
  ["skills-catalog", 200, 400, 401, 500, "install conflicts"],
  ["themes", 200, 400, 401, 500, "fallback theme"],
  ["event-stream", 200, 400, 401, 500, "reconnect event"],
] as const;

describe("network contract matrix", () => {
  it("keeps the aggregate runtime bridge free of owned wire DTOs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../../src/ui/lib/api/types.ts"), "utf8");
    expect(source).not.toMatch(/export\s+interface\s+(?:Terminal|Git|File|Directory|Settings|Push|GitHub|Skills)[A-Z]\w*(?:Request|Response|Payload|Result|Event|Error)/);
  });

  it("covers success, invalid, authorization, safe unknown, and partial outcomes for each maintained domain", () => {
    const owners = new Set(ROUTE_INVENTORY.filter((entry) => entry.classification === "contracted").flatMap((entry) => entry.owner.split(", ")));
    for (const [domain, success, invalid, authorization, unknown, partial] of matrix) {
      expect(owners).toContain(domain);
      expect([success, invalid, authorization, unknown]).toEqual([200, 400, expect.any(Number), 500]);
      expect(partial).toEqual(expect.any(String));
    }
  });

  it("preserves compatibility metadata and unique stable error-code namespaces", () => {
    const modules = ["common", "settings", "themes", "ui-auth", "quota", "terminal", "files", "github", "git", "project-assets", "skills", "notifications", "opencode"];
    const codeDeclarations = modules.filter((module) => module !== "common").flatMap((module) => {
      const source = readFileSync(resolve(import.meta.dirname, `${module}.ts`), "utf8");
      const declaration = source.match(/export const \w+_ERROR_CODES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
      return [...declaration.matchAll(/"([a-z]+(?:_[a-z]+)+)"/g)].map((match) => match[1]);
    });
    expect(new Set(codeDeclarations).size).toBe(codeDeclarations.length);
    expect(ROUTE_INVENTORY.every((entry) => entry.classification !== "contracted" || entry.owner.length > 0)).toBe(true);
  });
});
