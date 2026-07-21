import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const testFilePattern = /\.test\.[cm]?[jt]sx?$/;
const vitestImportPattern = /from\s+["']vitest["']/;

async function collectTestFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTestFiles(entryPath);
    return testFilePattern.test(entry.name) ? [entryPath] : [];
  }));
  return files.flat();
}

function isVitestOwnedPath(filePath: string): boolean {
  return (
    filePath.startsWith("src/api/") ||
    (filePath.startsWith("src/ui/") && filePath.includes(".contract.test.")) ||
    filePath.startsWith("server/src/") ||
    [
      "package-manifest.test.js",
      "bin/cli.test.js",
      "src/ui/sync/event-pipeline.test.ts",
      "src/ui/lib/terminal/terminalApi.test.ts",
      "src/ui/components/ui/UpdateDialog.test.ts",
      "src/ui/stores/config/useProviderConfigStore.test.ts",
    ].includes(filePath)
  );
}

describe("test runner ownership", () => {
  it("assigns every Vitest-importing suite to Vitest and keeps the Bun store runner disjoint", async () => {
    const [rootEntries, sourceFiles, serverFiles, binFiles, config, packageJson] = await Promise.all([
      readdir(packageRoot, { withFileTypes: true }),
      collectTestFiles(path.join(packageRoot, "src")),
      collectTestFiles(path.join(packageRoot, "server", "src")),
      collectTestFiles(path.join(packageRoot, "bin")),
      readFile(path.join(packageRoot, "vitest.config.ts"), "utf8"),
      readFile(path.join(packageRoot, "package.json"), "utf8"),
    ]);
    const rootFiles = rootEntries
      .filter((entry) => entry.isFile() && testFilePattern.test(entry.name))
      .map((entry) => path.join(packageRoot, entry.name));
    const testFiles = [...rootFiles, ...sourceFiles, ...serverFiles, ...binFiles];
    const vitestFiles = (await Promise.all(testFiles.map(async (filePath) => ({
      filePath,
      content: await readFile(filePath, "utf8"),
    })))).filter(({ content }) => vitestImportPattern.test(content));

    for (const { filePath } of vitestFiles) {
      expect(isVitestOwnedPath(path.relative(packageRoot, filePath))).toBe(true);
    }
    expect(config).toContain('"package-manifest.test.js"');
    expect(config).toContain('"bin/cli.test.js"');
    expect(config).toContain('"src/ui/stores/config/useProviderConfigStore.test.ts"');
    expect(packageJson).toContain("--path-ignore-patterns '**/*.contract.test.*'");
    expect(packageJson).toContain("--path-ignore-patterns 'src/ui/stores/config/useProviderConfigStore.test.ts'");
  });
});
