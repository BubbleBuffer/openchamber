#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative, extname } from "node:path";

const root = process.cwd();
const contracts = resolve(root, "packages/web/server/src/contracts");
const browser = resolve(root, "packages/web/src");
const bulkApi = resolve(root, "packages/web/src/ui/lib/api/types.ts");
const contractDocs = resolve(contracts, "DOCUMENTATION.md");
const failures = [];
const files = (dir) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)]) : [];
const text = (file) => readFileSync(file, "utf8");
const report = (message) => failures.push(message);

// Contract modules are intentionally portable declarations/parsers only.
for (const file of files(contracts).filter((file) => extname(file) === ".ts" && !file.endsWith(".test.ts"))) {
  const source = text(file);
  const name = relative(contracts, file);
  if (/from\s+["'](?:node:|express|@opencode-ai\/sdk)|\b(?:process|window|document)\b/.test(source)) report(`runtime dependency in contract: ${name}`);
  if (!existsSync(contractDocs)) report(`undocumented contract module: ${name} (missing contracts/DOCUMENTATION.md)`);
}

const bulk = text(bulkApi);
if (/export\s+(?:interface|type)\s+(?!Runtime(?:APIs|Descriptor|APISelector)\b|Subscription\b)\w+\s*(?:=|\{)|Promise\s*<\s*\{|(?:payload|options|handlers)\s*:\s*\{/.test(bulk)) report("domain wire DTO definition in aggregate runtime API bridge");
if (/\b(?:as\s+any|@ts-ignore|@ts-expect-error)\b/.test(bulk)) report("blanket contract cast or suppression in aggregate runtime API bridge");

const inventoryTest = resolve(contracts, "route-inventory.test.ts");
if (!existsSync(inventoryTest) || !text(inventoryTest).includes("covers every literal endpoint registered by active route modules")) report("uncovered route inventory check");
const codes = [];
for (const file of files(contracts).filter((file) => extname(file) === ".ts" && !file.endsWith(".test.ts") && !file.endsWith("common.ts"))) {
  const declaration = text(file).match(/export const \w+_ERROR_CODES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  codes.push(...[...declaration.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]));
}
if (new Set(codes).size !== codes.length) report("duplicate domain error code");

for (const file of files(browser).filter((file) => /\.[cm]?[jt]sx?$/.test(file))) {
  const source = text(file);
  if (/from\s+["'](?:\.\.\/)+server\/|from\s+["'][^"']*server\/src\//.test(source)) report(`browser server import: ${relative(root, file)}`);
  if (/\b(?:as\s+any|@ts-ignore|@ts-expect-error)\b/.test(source) && source.includes("@contracts/")) report(`blanket contract cast or suppression: ${relative(root, file)}`);
}
const dist = resolve(root, "packages/web/dist");
for (const file of files(dist).filter((file) => /\.js$/.test(file))) {
  if (/(?:from\s*|import\s*\()["'](?:node:|express|[^"']*server\/src\/|[^"']*server\/services\/)/.test(text(file))) report(`server dependency leaked into browser dist: ${relative(root, file)}`);
}

if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("network contract ownership audit passed");
