import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditNetworkContracts } from "./check-network-contracts.mjs";

const fixture = (files) => {
  const root = mkdtempSync(join(tmpdir(), "network-contracts-"));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
};

const base = {
  "packages/web/server/src/contracts/DOCUMENTATION.md": "# Contract module index\n\n- `common.ts`\n- `route-inventory.ts`\n",
  "packages/web/server/src/contracts/common.ts": "export const COMMON_ERROR_CODES = [] as const;\n",
  "packages/web/src/ui/lib/api/types.ts": "export interface RuntimeAPIs {}\n",
  "packages/web/server/src/contracts/route-inventory.ts": "const routes = (...args) => args; export const ROUTE_INVENTORY = [routes('domains/example/routes.ts', 'example', ['get /api/example'])];\n",
  "packages/web/server/src/domains/example/routes.ts": "app.get('/api/example', () => {});\n",
};

const audit = (files) => {
  const root = fixture({ ...base, ...files });
  try { return auditNetworkContracts(root); } finally { rmSync(root, { recursive: true, force: true }); }
};

test("rejects every network ownership violation category", () => {
  assert.match(audit({ "packages/web/src/ui/lib/api/types.ts": "export interface RuntimeAPIs {}\nexport interface WidgetResponse {}\n" }).join("\n"), /wire DTO/);
  assert.match(audit({ "packages/web/src/ui/lib/api/types.ts": "export interface RuntimeAPIs {}\nconst value = {} as any;\n" }).join("\n"), /blanket contract cast/);
  assert.match(audit({ "packages/web/server/src/contracts/common.ts": "import { readFileSync } from 'node:fs';\nexport const COMMON_ERROR_CODES = [] as const;\n" }).join("\n"), /runtime dependency/);
  assert.match(audit({ "packages/web/src/ui/feature.ts": "import type { X } from '../../../server/src/domains/example/types';\n" }).join("\n"), /browser server import/);
  assert.match(audit({ "packages/web/server/src/contracts/missing.ts": "export const MISSING_ERROR_CODES = [] as const;\n" }).join("\n"), /undocumented contract module/);
  assert.match(audit({ "packages/web/server/src/contracts/other.ts": "export const OTHER_ERROR_CODES = ['duplicate'] as const;\n", "packages/web/server/src/contracts/again.ts": "export const AGAIN_ERROR_CODES = ['duplicate'] as const;\n", "packages/web/server/src/contracts/DOCUMENTATION.md": "`common.ts` `other.ts` `again.ts`\n" }).join("\n"), /duplicate domain error code/);
  assert.match(audit({ "packages/web/server/src/domains/example/routes.ts": "app.get('/api/uninventoried', () => {});\n" }).join("\n"), /uncovered active route/);
  assert.match(audit({ "packages/web/dist/assets/app.js": "import 'node:fs';\n" }).join("\n"), /server dependency leaked/);
  assert.match(audit({ "packages/web/dist/assets/app.js": "import '../../../server/src/contracts/common.js';\n" }).join("\n"), /server dependency leaked/);
});

test("allows Node imports in packaged server artifacts and local browser feature models", () => {
  const failures = audit({
    "packages/web/server/dist/index.js": "import 'node:fs';\n",
    "packages/web/src/ui/feature-model.ts": "export interface LocalFeatureModel { ready: boolean }\n",
  });
  assert.deepEqual(failures, []);
});

test("rejects an active registrar omitted from inventory and a second aggregate browser API registry", () => {
  assert.match(audit({
    "packages/web/server/src/index.ts": "import { registerExtraRoutes } from './domains/extra/routes.js'; registerExtraRoutes(app);\n",
    "packages/web/server/src/domains/extra/routes.ts": "export const registerExtraRoutes = (app) => app.get('/api/extra', () => {});\n",
  }).join("\n"), /uncovered active route/);
  assert.match(audit({
    "packages/web/src/api/domain-apis.ts": "import type { GitStatusResponse } from '@contracts/git'; import type { AppSettings } from '@contracts/settings'; export interface GitAPI { status(): Promise<GitStatusResponse> } export interface SettingsAPI { get(): Promise<AppSettings> }\n",
  }).join("\n"), /aggregate browser API registry/);
});
