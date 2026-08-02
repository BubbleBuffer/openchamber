import { constants } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const PACKAGE_JSON = `${JSON.stringify({
  name: "agent-ui-empty-consumer",
  version: "0.0.0",
  private: true,
  type: "module",
}, null, 2)}\n`;

const executable = (name) => process.platform === "win32" ? `${name}.cmd` : name;

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code, signal) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error([
      `Command failed: ${command} ${args.join(" ")}`,
      `exit=${code ?? "null"} signal=${signal ?? "none"}`,
      stdout.trim(),
      stderr.trim(),
    ].filter(Boolean).join("\n")));
  });
});

const requireFile = async (filePath, label) => {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${label} is not a readable file: ${filePath}`);
  }
};

export async function smokeAgentUiTarballs({
  coreTarball,
  reactTarball,
  commandRunner = runCommand,
  keepTemporaryProject = false,
}) {
  const corePackageTarball = path.resolve(coreTarball);
  const reactPackageTarball = path.resolve(reactTarball);
  await requireFile(corePackageTarball, "@openchamber/agent-ui-core tarball");
  await requireFile(reactPackageTarball, "@openchamber/agent-ui-react tarball");

  const temporaryProject = await mkdtemp(path.join(tmpdir(), "agent-ui-package-smoke-"));
  try {
    await writeFile(path.join(temporaryProject, "package.json"), PACKAGE_JSON, "utf8");
    await commandRunner(executable("npm"), [
      "install",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "react@19.2.6",
      "react-dom@19.2.6",
      corePackageTarball,
      reactPackageTarball,
    ], { cwd: temporaryProject });
    await commandRunner(process.execPath, [
      "--input-type=module",
      "--eval",
      "const core = await import('@openchamber/agent-ui-core'); const ui = await import('@openchamber/agent-ui-react'); core.assertUniqueTimelineKeys([{ key: 'ok', occurredAtMs: 0 }]); if (typeof ui.AgentTimeline !== 'object' && typeof ui.AgentTimeline !== 'function') throw new Error('AgentTimeline export missing');",
    ], { cwd: temporaryProject });

    return { temporaryProject };
  } finally {
    if (!keepTemporaryProject) {
      await rm(temporaryProject, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

export function parseArguments(argv) {
  const keepTemporaryProject = argv.includes("--keep-temp");
  const tarballs = argv.filter((argument) => argument !== "--keep-temp");
  if (tarballs.length !== 2) {
    throw new Error(
      "Usage: node scripts/smoke-agent-ui-tarballs.mjs [--keep-temp] <agent-ui-core.tgz> <agent-ui-react.tgz>",
    );
  }
  return {
    coreTarball: tarballs[0],
    reactTarball: tarballs[1],
    keepTemporaryProject,
  };
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    await smokeAgentUiTarballs(parseArguments(process.argv.slice(2)));
    process.stdout.write("Agent UI package smoke passed: core and React imports succeeded.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Agent UI package smoke failed: ${message}\n`);
    process.exitCode = 1;
  }
}
