import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function resolveServerDist(scriptUrl = import.meta.url) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(scriptUrl)), "..");
  const target = path.resolve(repositoryRoot, "packages", "web", "server", "dist");
  const expectedSuffix = path.join("packages", "web", "server", "dist");

  if (!target.endsWith(expectedSuffix) || target === repositoryRoot) {
    throw new Error(`Refusing to clean unexpected server build path: ${target}`);
  }
  return target;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const target = resolveServerDist();
  await rm(target, { recursive: true, force: true, maxRetries: 3 });
}
