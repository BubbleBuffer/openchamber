import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function validateReleaseVersion(requestedVersion, manifests) {
  if (!SEMVER_PATTERN.test(requestedVersion)) {
    throw new Error(`Release version "${requestedVersion}" is not valid SemVer.`);
  }

  const expected = {
    root: manifests.root.version,
    sessionState: manifests.sessionState.version,
    web: manifests.web.version,
    webSessionStateDependency:
      manifests.web.dependencies?.["@openchamber/session-state"],
  };

  for (const [label, version] of Object.entries(expected)) {
    if (version !== requestedVersion) {
      throw new Error(
        `Release version mismatch: ${label} is "${String(version)}", expected "${requestedVersion}".`,
      );
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function checkReleaseVersion(requestedVersion, repositoryRoot) {
  const manifests = {
    root: await readJson(path.join(repositoryRoot, "package.json")),
    sessionState: await readJson(
      path.join(repositoryRoot, "packages", "session-state", "package.json"),
    ),
    web: await readJson(path.join(repositoryRoot, "packages", "web", "package.json")),
  };

  validateReleaseVersion(requestedVersion, manifests);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const requestedVersion = process.argv[2]?.trim();
  if (!requestedVersion) {
    console.error("Usage: node scripts/check-release-version.mjs <version>");
    process.exitCode = 1;
  } else {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    try {
      await checkReleaseVersion(requestedVersion, repositoryRoot);
      console.log(`Release version ${requestedVersion} matches all publishable manifests.`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
