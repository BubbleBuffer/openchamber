import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  auditArchitecture,
  createArchitectureSnapshot,
  measureSource,
} from "./check-architecture.mjs";

const POLICY = {
  effectiveLines: 4,
  imports: 1,
  exports: 1,
  branchPoints: 1,
  stateHooks: 1,
  effectHooks: 1,
  hookCalls: 2,
};

function fixture(files, ledger) {
  const root = mkdtempSync(join(tmpdir(), "openchamber-architecture-"));
  for (const [path, source] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, source);
  }
  const ledgerPath = join(root, "scripts/architecture-ledger.json");
  mkdirSync(join(ledgerPath, ".."), { recursive: true });
  writeFileSync(ledgerPath, `${JSON.stringify({
    version: 1,
    policy: POLICY,
    classifications: {},
    baseline: {},
    ...ledger,
  }, null, 2)}\n`);
  return { root, ledgerPath };
}

function audit(files, ledger) {
  const created = fixture(files, ledger);
  try {
    return auditArchitecture(created);
  } finally {
    rmSync(created.root, { recursive: true, force: true });
  }
}

test("measures maintained source while ignoring comments and metric-like strings", () => {
  const measured = measureSource(`
    // if (commentOnly) useEffect()
    import { value } from "if useState";
    export function Example() {
      const [ready] = useState(false);
      useEffect(() => {}, []);
      const text = "if (notSource) useEffect()";
      if (ready && value) return text;
      return null;
    }
  `);

  assert.deepEqual(measured, {
    effectiveLines: 8,
    imports: 1,
    exports: 1,
    branchPoints: 2,
    stateHooks: 1,
    effectHooks: 1,
    hookCalls: 2,
  });
});

test("accepts an unchanged legacy hotspot and rejects growth past its baseline", () => {
  const source = [
    "export function legacy(value) {",
    "  if (value) return 1;",
    "  if (!value) return 2;",
    "  return 3;",
    "}",
  ].join("\n");
  const files = { "packages/example/src/legacy.ts": source };
  const created = fixture(files, {});
  let baseline;
  try {
    baseline = createArchitectureSnapshot({ root: created.root, policy: POLICY });
  } finally {
    rmSync(created.root, { recursive: true, force: true });
  }
  const accepted = audit(files, { baseline });
  assert.deepEqual(accepted.failures, []);

  const regression = audit({
    ...files,
    "packages/example/src/new-hotspot.ts": `${source}\nif (true) {}\n`,
  }, { baseline });
  assert.match(regression.failures.join("\n"), /new-hotspot\.ts: effectiveLines/);
});

test("requires the ledger to tighten when a baselined metric improves", () => {
  const result = audit({
    "packages/example/src/legacy.ts": "export function legacy() {\n  return 1;\n}\n",
  }, {
    baseline: {
      "packages/example/src/legacy.ts": { effectiveLines: 5 },
    },
  });

  assert.match(result.failures.join("\n"), /improved from 5 to 3/);
});

test("validates explicit generated and data-only classifications", () => {
  const files = {
    "packages/example/src/generated.ts": "export const generated = [\n  1,\n  2,\n  3,\n  4,\n];\n",
    "packages/example/src/data.ts": "export const data = [\n  1,\n  2,\n  3,\n  4,\n];\n",
    "scripts/generate-example.mjs": "export {};\n",
  };
  const classifications = {
    "packages/example/src/generated.ts": {
      kind: "generated",
      reason: "Produced by the fixture generator.",
      source: "scripts/generate-example.mjs",
    },
    "packages/example/src/data.ts": {
      kind: "data-only",
      reason: "Declarative lookup data with no control flow.",
    },
  };

  assert.deepEqual(audit(files, { classifications }).failures, []);
  assert.match(
    audit(files, {
      classifications: {
        "packages/example/src/generated.ts": {
          kind: "generated",
          reason: "",
          source: "scripts/missing.mjs",
        },
      },
    }).failures.join("\n"),
    /missing architecture classification reason[\s\S]*generated architecture source is missing/,
  );
});

test("rejects stale, malformed, and overlapping ledger entries", () => {
  const result = audit({
    "packages/example/src/data.ts": "export const data = [];\n",
  }, {
    classifications: {
      "packages/example/src/data.ts": {
        kind: "data-only",
        reason: "Static data.",
      },
    },
    baseline: {
      "packages/example/src/data.ts": { effectiveLines: 5 },
      "packages/example/src/missing.ts": { effectiveLines: 5 },
    },
  });
  const failures = result.failures.join("\n");
  assert.match(failures, /both classified and baselined/);
  assert.match(failures, /stale architecture baseline path/);
});

test("enforces runtime-neutral framework package imports", () => {
  const rejected = audit({
    "packages/agent-ui-core/src/core.ts": 'import React from "react";\nexport const core = React;\n',
    "packages/agent-ui-react/src/view.tsx": [
      'import { create } from "zustand";',
      'import { product } from "../../web/src/ui/product";',
      'import "./view.css";',
      'export const view = [create, product];',
    ].join("\n"),
    "packages/web/src/ui/product.ts": "export const product = true;\n",
  }, {});

  assert.match(
    rejected.failures.join("\n"),
    /agent-ui-core.*react[\s\S]*agent-ui-react.*zustand[\s\S]*agent-ui-react.*packages\/web[\s\S]*agent-ui-react.*\.css/,
  );

  const acceptedFiles = {
    "packages/agent-ui-core/src/model.ts": "export type Entry = { id: string };\n",
    "packages/agent-ui-core/src/index.ts": 'export type { Entry } from "./model";\n',
    "packages/agent-ui-react/src/index.tsx": [
      'import * as React from "react";',
      'import { useVirtualizer } from "@tanstack/react-virtual";',
      'import type { Entry } from "@openchamber/agent-ui-core";',
      'export const value: Entry | null = React.useMemo(() => null, []);',
      'void useVirtualizer;',
    ].join("\n"),
  };
  const accepted = audit(acceptedFiles, {
    baseline: {
      "packages/agent-ui-react/src/index.tsx": { effectiveLines: 5, imports: 3 },
    },
  });

  assert.deepEqual(accepted.failures, []);
});
