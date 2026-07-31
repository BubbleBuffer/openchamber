import { constants } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const PACKAGE_JSON = `${JSON.stringify({
  name: "openchamber-package-smoke",
  version: "0.0.0",
  private: true,
  type: "module",
}, null, 2)}\n`;

const executable = (name) =>
  process.platform === "win32" ? `${name}.cmd` : name;

export const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
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
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const details = [
        `Command failed: ${command} ${args.join(" ")}`,
        `exit=${code ?? "null"} signal=${signal ?? "none"}`,
        stdout.trim(),
        stderr.trim(),
      ].filter(Boolean).join("\n");
      reject(new Error(details));
    });
  });

const requireFile = async (filePath, label) => {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${label} is not a readable file: ${filePath}`);
  }
};

export async function smokePackageTarballs({
  sessionStateTarball,
  webTarball,
  commandRunner = runCommand,
  keepTemporaryProject = false,
}) {
  const sessionTarball = path.resolve(sessionStateTarball);
  const webPackageTarball = path.resolve(webTarball);
  await requireFile(sessionTarball, "@openchamber/session-state tarball");
  await requireFile(webPackageTarball, "@openchamber/web tarball");

  const temporaryProject = await mkdtemp(
    path.join(tmpdir(), "openchamber-package-smoke-"),
  );
  try {
    await writeFile(path.join(temporaryProject, "package.json"), PACKAGE_JSON, "utf8");

    await commandRunner(executable("npm"), [
      "install",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      sessionTarball,
      webPackageTarball,
    ], { cwd: temporaryProject });

    await commandRunner(process.execPath, [
      "--input-type=module",
      "--eval",
      "await import('@openchamber/session-state');",
    ], { cwd: temporaryProject });

    const cliPath = path.join(
      temporaryProject,
      "node_modules",
      ".bin",
      executable("openchamber"),
    );
    await requireFile(cliPath, "installed openchamber CLI");
    const cliCommand =
      process.platform === "win32"
        ? process.env.ComSpec || "cmd.exe"
        : cliPath;
    const cliArgs =
      process.platform === "win32"
        ? ["/d", "/s", "/c", `"${cliPath}" --help`]
        : ["--help"];
    const cliResult = await commandRunner(cliCommand, cliArgs, { cwd: temporaryProject });

    return {
      temporaryProject,
      cliOutput: cliResult.stdout,
    };
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
      "Usage: node scripts/smoke-package-tarballs.mjs [--keep-temp] <session-state.tgz> <web.tgz>",
    );
  }
  return {
    sessionStateTarball: tarballs[0],
    webTarball: tarballs[1],
    keepTemporaryProject,
  };
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    const result = await smokePackageTarballs(parseArguments(process.argv.slice(2)));
    process.stdout.write("Package smoke passed: session-state import and openchamber --help succeeded.\n");
    if (result.cliOutput.trim()) {
      process.stdout.write(`${result.cliOutput.trim()}\n`);
    }
    if (process.argv.includes("--keep-temp")) {
      process.stdout.write(`Temporary project kept at ${result.temporaryProject}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Package smoke failed: ${message}\n`);
    process.exitCode = 1;
  }
}
