import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runCommand } from "./smoke-package-tarballs.mjs";
import { smokeAgentUiTarballs } from "./smoke-agent-ui-tarballs.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageDirectory = await mkdtemp(path.join(tmpdir(), "openchamber-agent-ui-pack-"));

try {
  for (const workspace of ["packages/agent-ui-core", "packages/agent-ui-react"]) {
    await runCommand("bun", ["run", "--cwd", workspace, "build"], { cwd: repositoryRoot });
    await runCommand("npm", [
      "pack",
      "--workspace",
      workspace,
      "--pack-destination",
      packageDirectory,
    ], { cwd: repositoryRoot });
  }

  await smokeAgentUiTarballs({
    coreTarball: path.join(packageDirectory, "openchamber-agent-ui-core-0.0.0.tgz"),
    reactTarball: path.join(packageDirectory, "openchamber-agent-ui-react-0.0.0.tgz"),
  });
  process.stdout.write("Agent UI artifacts packed and passed clean-consumer installation.\n");
} finally {
  await rm(packageDirectory, { recursive: true, force: true, maxRetries: 3 });
}
