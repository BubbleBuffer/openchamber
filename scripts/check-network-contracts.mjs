#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const files = (directory) => existsSync(directory)
  ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)])
  : [];
const source = (file) => readFileSync(file, "utf8");
const isMaintainedContract = (file) => extname(file) === ".ts" && !/\.(test|spec)\.ts$/.test(file);
const quoted = (text) => [...text.matchAll(/["']([^"'\n]+)["']/g)].map((match) => match[1]);

export function inventoryEndpoints(inventorySource) {
  const entries = [];
  for (const match of inventorySource.matchAll(/routes\(\s*["']([^"']+)["'][\s\S]*?\[([^\]]*)\]/g)) {
    entries.push(...quoted(match[2]).map((endpoint) => `${match[1]}:${endpoint}`));
  }
  return new Set(entries);
}

export function activeRouteEndpoints(serverRoot, inventorySource, contractsRoot = resolve(serverRoot, "contracts")) {
  const registrars = new Set([...inventorySource.matchAll(/routes\(\s*["']([^"']+)/g)].map((match) => match[1]));
  // The server entrypoint is the active ownership boundary: a registrar imported
  // and called there is active even before someone adds it to the inventory.
  for (const entrypoint of [resolve(serverRoot, "index.ts"), resolve(serverRoot, "domains/bootstrap/startup-pipeline.ts")]) {
    if (!existsSync(entrypoint)) continue;
    for (const match of source(entrypoint).matchAll(/from\s+["'](?:\.\.\/)*\.\/([^"']*domains\/[^"']*(?:routes|ws-server)\.[cm]?[jt]s)["']/g)) registrars.add(`domains/${match[1].split("domains/").at(-1)}`);
  }
  for (const file of files(resolve(serverRoot, "domains")).filter((file) => /(?:routes|ws-server)\.[cm]?[jt]s$/.test(file) && !/\.(test|spec)\./.test(file))) registrars.add(relative(serverRoot, file));
  const routeConstants = new Map();
  for (const file of files(contractsRoot).filter(isMaintainedContract)) for (const match of source(file).matchAll(/export const (\w*(?:WS|SSE)_PATH)\s*=\s*["'](\/[^"']+)/g)) routeConstants.set(match[1], match[2]);
  const actual = new Set();
  for (const registrar of registrars) {
    const file = resolve(serverRoot, registrar);
    if (!existsSync(file)) continue;
    const registrarSource = statSync(file).isDirectory() ? files(file).filter((entry) => /\.[cm]?[jt]s$/.test(entry) && !/\.(test|spec)\./.test(entry)).map(source).join("\n") : source(file);
    for (const match of registrarSource.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*["'](\/[^"']*)["']/g)) {
      actual.add(`${registrar}:${match[1]} ${match[2]}`);
    }
    for (const [name, path] of routeConstants) if (new RegExp(`\\b${name}\\b`).test(registrarSource)) actual.add(`${registrar}:get ${path}`);
    for (const match of registrarSource.matchAll(/export const \w*(?:WS|SSE)_PATH\s*=\s*["'](\/[^"']+)/g)) actual.add(`${registrar}:get ${match[1]}`);
  }
  return actual;
}

export function auditNetworkContracts(root = process.cwd()) {
  const failures = [];
  const contracts = resolve(root, "packages/web/server/src/contracts");
  const browser = resolve(root, "packages/web/src");
  const bulkApi = resolve(root, "packages/web/src/ui/lib/api/types.ts");
  const contractDocs = resolve(contracts, "DOCUMENTATION.md");
  const contractFiles = files(contracts).filter(isMaintainedContract);
  const report = (message) => failures.push(message);

  for (const file of contractFiles) {
    const moduleSource = source(file);
    const name = relative(contracts, file);
    if (/(?:from|import)\s*\(?\s*["'](?:node:|express(?:\/|["'])|@opencode-ai\/sdk)|\brequire\s*\(\s*["'](?:node:|express)|\b(?:process|window|document)\b/.test(moduleSource)) report(`runtime dependency in contract: ${name}`);
    if (!existsSync(contractDocs) || !new RegExp(`(?:^|[^A-Za-z0-9_.-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_.-])`, "m").test(existsSync(contractDocs) ? source(contractDocs) : "")) report(`undocumented contract module: ${name}`);
  }

  if (existsSync(bulkApi)) {
    const bulk = source(bulkApi);
    if (/export\s+interface\s+\w*(?:Request|Response|Payload|Result|Event|Error)\b\s*\{|export\s+type\s+\w*(?:Request|Response|Payload|Result|Event|Error)\b\s*=\s*\{|(?:Promise\s*<\s*\{|\b(?:payload|options|handlers)\s*:\s*\{)/.test(bulk)) report("domain wire DTO definition in aggregate runtime API bridge");
    if (/\b(?:as\s+any|@ts-ignore|@ts-expect-error)\b/.test(bulk)) report("blanket contract cast or suppression in aggregate runtime API bridge");
  }

  const codes = [];
  for (const file of contractFiles.filter((file) => !file.endsWith("common.ts"))) {
    for (const declaration of source(file).matchAll(/export const \w+_ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/g)) codes.push(...quoted(declaration[1]));
  }
  if (new Set(codes).size !== codes.length) report("duplicate domain error code");

  for (const file of files(browser).filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file))) {
    const browserSource = source(file);
    if (/(?:from|import)\s*(?:type\s*)?["'][^"']*(?:\/server\/src\/(?:domains|services|routes|internal)|(?:^|\/)server\/(?:domains|services|routes|internal))/.test(browserSource)) report(`browser server import: ${relative(root, file)}`);
    if (/\b(?:as\s+any|@ts-ignore|@ts-expect-error)\b/.test(browserSource) && browserSource.includes("@contracts/")) report(`blanket contract cast or suppression: ${relative(root, file)}`);
    const browserPath = relative(root, file);
    const domainAdapter = /^packages\/web\/src\/api\/[A-Za-z]+\.ts$/.test(browserPath);
    if (file !== bulkApi && !domainAdapter && (browserSource.match(/@contracts\//g) ?? []).length >= 2 && (browserSource.match(/export\s+(?:interface|type)\s+\w*(?:API|Request|Response|Payload|Result)\b/g) ?? []).length >= 2) report(`aggregate browser API registry: ${browserPath}`);
  }

  const inventory = resolve(contracts, "route-inventory.ts");
  if (existsSync(inventory)) {
    const inventorySource = source(inventory);
    const declared = new Set([...inventoryEndpoints(inventorySource)].map((endpoint) => endpoint.slice(endpoint.indexOf(":") + 1)));
    for (const endpoint of activeRouteEndpoints(resolve(root, "packages/web/server/src"), inventorySource, contracts)) if (!declared.has(endpoint.slice(endpoint.indexOf(":") + 1))) report(`uncovered active route: ${endpoint}`);
  }

  const dist = resolve(root, "packages/web/dist");
  for (const file of files(dist).filter((file) => /\.[cm]?js$/.test(file))) {
    if (/(?:from\s*|import\s*(?:\(|))\s*["'](?:node:|express(?:\/|["'])|[^"']*server\/(?:src\/)?(?:domains|services|routes|internal)|[^"']*server\/src\/contracts)/.test(source(file))) report(`server dependency leaked into browser dist: ${relative(root, file)}`);
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = auditNetworkContracts();
  if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
  else console.log("network contract ownership audit passed");
}
