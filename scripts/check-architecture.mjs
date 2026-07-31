#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  extname,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ARCHITECTURE_POLICY = Object.freeze({
  effectiveLines: 600,
  imports: 30,
  exports: 20,
  branchPoints: 100,
  stateHooks: 10,
  effectHooks: 8,
  hookCalls: 40,
});

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
  "coverage",
  "dist",
  "node_modules",
]);
const TEST_FILE_PATTERN = /\.(?:bench|spec|test)\.[cm]?[jt]sx?$/;
const DECLARATION_FILE_PATTERN = /\.d\.[cm]?ts$/;
const METRIC_NAMES = Object.keys(DEFAULT_ARCHITECTURE_POLICY);

const normalizePath = (value) => value.split(sep).join("/");

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORY_NAMES.has(entry.name) || entry.name === "__tests__") return [];
      return sourceFiles(resolve(directory, entry.name));
    }
    const file = resolve(directory, entry.name);
    if (!SOURCE_EXTENSIONS.has(extname(file))) return [];
    if (TEST_FILE_PATTERN.test(entry.name) || DECLARATION_FILE_PATTERN.test(entry.name)) return [];
    return [file];
  });
}

/**
 * Remove comments without changing newlines or non-comment source. Strings are
 * preserved so data-only source lines still count as maintained code.
 */
export function stripComments(source) {
  let output = "";
  let state = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        output += "\n";
      } else {
        output += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state !== "code") {
      output += char;
      if (char === "\n" && state !== "template") {
        state = "code";
        escaped = false;
        continue;
      }
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (
        (state === "single-quote" && char === "'")
        || (state === "double-quote" && char === "\"")
        || (state === "template" && char === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block-comment";
    } else {
      output += char;
      if (char === "'") state = "single-quote";
      else if (char === "\"") state = "double-quote";
      else if (char === "`") state = "template";
    }
  }

  return output;
}

/**
 * Blank string contents after comments have been removed. This keeps metric
 * tokens in fixture text, URLs, and prose from being counted as source logic.
 */
function blankStrings(source) {
  let output = "";
  let state = "code";
  let escaped = false;

  for (const char of source) {
    if (state === "code") {
      if (char === "'" || char === "\"" || char === "`") {
        state = char;
        output += " ";
      } else {
        output += char;
      }
      continue;
    }

    if (char === "\n") {
      output += "\n";
      if (state !== "`") {
        state = "code";
        escaped = false;
      }
    } else {
      output += " ";
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === state) {
        state = "code";
      }
    }
  }

  return output;
}

const countMatches = (source, pattern) => [...source.matchAll(pattern)].length;

export function measureSource(source) {
  const commentsRemoved = stripComments(source);
  const tokens = blankStrings(commentsRemoved);
  const keywordBranches = countMatches(tokens, /\b(?:catch|if|for|while|case)\b/g);
  const logicalBranches = countMatches(tokens, /&&|\|\||\?\?/g);
  const hookLikeCalls = countMatches(tokens, /\buse[A-Z][A-Za-z0-9_]*\s*(?:<[^;\n()]*>)?\s*\(/g);
  const hookFunctionDeclarations = countMatches(tokens, /\bfunction\s+use[A-Z][A-Za-z0-9_]*\s*(?:<[^;\n()]*>)?\s*\(/g);

  return {
    effectiveLines: commentsRemoved.split(/\r?\n/).filter((line) => line.trim()).length,
    imports: countMatches(tokens, /^\s*import\b/gm),
    exports: countMatches(tokens, /^\s*export\b/gm),
    branchPoints: keywordBranches + logicalBranches,
    stateHooks: countMatches(tokens, /\buseState\s*(?:<[^;\n()]*>)?\s*\(/g),
    effectHooks: countMatches(tokens, /\buse(?:Layout)?Effect\s*\(/g),
    hookCalls: hookLikeCalls - hookFunctionDeclarations,
  };
}

function validatePolicy(policy, failures) {
  for (const metric of METRIC_NAMES) {
    if (!Number.isInteger(policy?.[metric]) || policy[metric] < 0) {
      failures.push(`invalid policy threshold: ${metric}`);
    }
  }
  for (const metric of Object.keys(policy ?? {})) {
    if (!METRIC_NAMES.includes(metric)) failures.push(`unknown policy metric: ${metric}`);
  }
}

function validateClassifications(root, scannedPaths, classifications, failures) {
  for (const [path, classification] of Object.entries(classifications)) {
    if (!["data-only", "generated"].includes(classification?.kind)) {
      failures.push(`invalid architecture classification kind: ${path}`);
    }
    if (typeof classification?.reason !== "string" || !classification.reason.trim()) {
      failures.push(`missing architecture classification reason: ${path}`);
    }
    if (!scannedPaths.has(path)) {
      failures.push(`classified architecture source is missing or outside the scan: ${path}`);
    }
    if (classification?.kind === "generated") {
      if (typeof classification.source !== "string" || !classification.source.trim()) {
        failures.push(`generated architecture classification has no source: ${path}`);
      } else if (!existsSync(resolve(root, classification.source))) {
        failures.push(`generated architecture source is missing: ${path} -> ${classification.source}`);
      }
    }
  }
}

function validateBaseline(policy, baseline, failures) {
  for (const [path, metrics] of Object.entries(baseline)) {
    if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
      failures.push(`invalid architecture baseline entry: ${path}`);
      continue;
    }
    for (const [metric, value] of Object.entries(metrics)) {
      if (!METRIC_NAMES.includes(metric)) {
        failures.push(`unknown baseline metric: ${path} -> ${metric}`);
      } else if (!Number.isInteger(value) || value <= policy[metric]) {
        failures.push(`baseline metric is not over policy: ${path} -> ${metric}`);
      }
    }
  }
}

export function createArchitectureSnapshot({
  root = process.cwd(),
  policy = DEFAULT_ARCHITECTURE_POLICY,
  classifications = {},
} = {}) {
  const packagesRoot = resolve(root, "packages");
  const entries = {};

  for (const file of sourceFiles(packagesRoot)) {
    const path = normalizePath(relative(root, file));
    if (classifications[path]) continue;
    const measured = measureSource(readFileSync(file, "utf8"));
    const overPolicy = Object.fromEntries(
      METRIC_NAMES
        .filter((metric) => measured[metric] > policy[metric])
        .map((metric) => [metric, measured[metric]]),
    );
    if (Object.keys(overPolicy).length) entries[path] = overPolicy;
  }

  return Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)));
}

export function auditArchitecture({
  root = process.cwd(),
  ledgerPath = resolve(root, "scripts/architecture-ledger.json"),
} = {}) {
  const failures = [];
  if (!existsSync(ledgerPath)) {
    return {
      failures: [`architecture ledger is missing: ${normalizePath(relative(root, ledgerPath))}`],
      summary: { scanned: 0, classified: 0, hotspots: 0 },
    };
  }

  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  } catch (error) {
    return {
      failures: [`architecture ledger is invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
      summary: { scanned: 0, classified: 0, hotspots: 0 },
    };
  }

  if (ledger.version !== 1) failures.push("architecture ledger version must be 1");
  const policy = ledger.policy ?? {};
  const classifications = ledger.classifications ?? {};
  const baseline = ledger.baseline ?? {};
  validatePolicy(policy, failures);
  validateBaseline(policy, baseline, failures);

  const files = sourceFiles(resolve(root, "packages"));
  const scannedPaths = new Set(files.map((file) => normalizePath(relative(root, file))));
  validateClassifications(root, scannedPaths, classifications, failures);

  const measuredByPath = new Map(
    files.map((file) => [
      normalizePath(relative(root, file)),
      measureSource(readFileSync(file, "utf8")),
    ]),
  );

  for (const path of Object.keys(baseline)) {
    if (classifications[path]) failures.push(`source is both classified and baselined: ${path}`);
    if (!measuredByPath.has(path)) failures.push(`stale architecture baseline path: ${path}`);
  }

  for (const [path, measured] of measuredByPath) {
    if (classifications[path]) continue;
    const allowed = baseline[path] ?? {};
    for (const metric of METRIC_NAMES) {
      const value = measured[metric];
      const threshold = policy[metric];
      const ceiling = allowed[metric] ?? threshold;
      if (value > ceiling) {
        failures.push(
          `${path}: ${metric} ${value} exceeds ${allowed[metric] ? `baseline ${ceiling}` : `policy ${threshold}`}`,
        );
      } else if (allowed[metric] && value < ceiling) {
        failures.push(
          `${path}: ${metric} improved from ${ceiling} to ${value}; tighten the architecture ledger`,
        );
      }
    }
  }

  return {
    failures,
    summary: {
      scanned: files.length,
      classified: Object.keys(classifications).length,
      hotspots: Object.keys(baseline).length,
    },
  };
}

function readLedger(ledgerPath) {
  return JSON.parse(readFileSync(ledgerPath, "utf8"));
}

function snapshotLedger(root, ledgerPath) {
  const ledger = readLedger(ledgerPath);
  return {
    ...ledger,
    baseline: createArchitectureSnapshot({
      root,
      policy: ledger.policy,
      classifications: ledger.classifications,
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const ledgerPath = resolve(root, "scripts/architecture-ledger.json");

  if (process.argv.includes("--print-baseline")) {
    console.log(`${JSON.stringify(snapshotLedger(root, ledgerPath), null, 2)}\n`);
  } else {
    const result = auditArchitecture({ root, ledgerPath });
    if (result.failures.length) {
      console.error(result.failures.join("\n"));
      console.error(
        `architecture check failed (${result.summary.scanned} source files, ${result.summary.hotspots} baselined hotspots, ${result.summary.classified} classifications)`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `architecture check passed (${result.summary.scanned} source files, ${result.summary.hotspots} baselined hotspots, ${result.summary.classified} classifications)`,
      );
    }
  }
}
