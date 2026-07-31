import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseArguments,
  smokePackageTarballs,
} from "./smoke-package-tarballs.mjs";

const makeFixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openchamber-smoke-test-"));
  const sessionStateTarball = path.join(root, "session-state.tgz");
  const webTarball = path.join(root, "web.tgz");
  await Promise.all([
    writeFile(sessionStateTarball, "session-state fixture"),
    writeFile(webTarball, "web fixture"),
  ]);
  return { root, sessionStateTarball, webTarball };
};

test("parses two tarballs and the optional keep-temp flag", () => {
  assert.deepEqual(parseArguments(["--keep-temp", "session.tgz", "web.tgz"]), {
    sessionStateTarball: "session.tgz",
    webTarball: "web.tgz",
    keepTemporaryProject: true,
  });
  assert.throws(() => parseArguments(["only-one.tgz"]), /Usage:/);
});

test("installs both tarballs, imports session-state, runs CLI help, and cleans up", async () => {
  const fixture = await makeFixture();
  const calls = [];
  let smokeDirectory;
  const commandRunner = async (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    smokeDirectory = options.cwd;
    if (calls.length === 1) {
      const cliDirectory = path.join(options.cwd, "node_modules", ".bin");
      await mkdir(cliDirectory, { recursive: true });
      await writeFile(
        path.join(cliDirectory, process.platform === "win32" ? "openchamber.cmd" : "openchamber"),
        "",
      );
    }
    return { stdout: calls.length === 3 ? "OpenChamber help" : "", stderr: "" };
  };

  try {
    const result = await smokePackageTarballs({
      sessionStateTarball: fixture.sessionStateTarball,
      webTarball: fixture.webTarball,
      commandRunner,
    });

    assert.equal(result.cliOutput, "OpenChamber help");
    assert.equal(calls.length, 3);
    assert.equal(calls[0].args[0], "install");
    assert.deepEqual(calls[0].args.slice(-2), [
      path.resolve(fixture.sessionStateTarball),
      path.resolve(fixture.webTarball),
    ]);
    assert.match(calls[1].args.at(-1), /@openchamber\/session-state/);
    assert.match(calls[2].args.join(" "), /--help/);
    await assert.rejects(access(smokeDirectory));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("cleans the temporary project after an install failure", async () => {
  const fixture = await makeFixture();
  let smokeDirectory;
  try {
    await assert.rejects(
      smokePackageTarballs({
        sessionStateTarball: fixture.sessionStateTarball,
        webTarball: fixture.webTarball,
        commandRunner: async (_command, _args, options) => {
          smokeDirectory = options.cwd;
          throw new Error("install failed");
        },
      }),
      /install failed/,
    );
    await assert.rejects(access(smokeDirectory));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
