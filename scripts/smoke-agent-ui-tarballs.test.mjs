import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseArguments,
  smokeAgentUiTarballs,
} from "./smoke-agent-ui-tarballs.mjs";

const makeFixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agent-ui-smoke-test-"));
  const coreTarball = path.join(root, "core.tgz");
  const reactTarball = path.join(root, "react.tgz");
  await Promise.all([writeFile(coreTarball, "core"), writeFile(reactTarball, "react")]);
  return { root, coreTarball, reactTarball };
};

test("parses the two framework tarballs and keep-temp flag", () => {
  assert.deepEqual(parseArguments(["--keep-temp", "core.tgz", "react.tgz"]), {
    coreTarball: "core.tgz",
    reactTarball: "react.tgz",
    keepTemporaryProject: true,
  });
  assert.throws(() => parseArguments(["core.tgz"]), /Usage:/);
});

test("installs and imports both framework artifacts in an empty consumer", async () => {
  const fixture = await makeFixture();
  const calls = [];
  let smokeDirectory;
  try {
    await smokeAgentUiTarballs({
      coreTarball: fixture.coreTarball,
      reactTarball: fixture.reactTarball,
      commandRunner: async (command, args, options) => {
        calls.push({ command, args });
        smokeDirectory = options.cwd;
        return { stdout: "", stderr: "" };
      },
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].args[0], "install");
    assert.deepEqual(calls[0].args.slice(-2), [
      path.resolve(fixture.coreTarball),
      path.resolve(fixture.reactTarball),
    ]);
    assert.match(calls[1].args.at(-1), /AgentTimeline/);
    await assert.rejects(access(smokeDirectory));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
