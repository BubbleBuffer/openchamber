import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const verifyScript = new URL("./verify.sh", import.meta.url);

test("release verification covers every non-browser quality layer", async () => {
  const source = await readFile(verifyScript, "utf8");
  const requiredCommands = [
    "bun run type-check",
    "bun run lint",
    "bun run architecture:check",
    "bun run check:contracts",
    "bun run docs:validate",
    "bun run test:scripts",
    "bun run --cwd packages/agent-ui-core test",
    "bun run --cwd packages/agent-ui-react test",
    "bun run verify:agent-ui-packages",
    "bun run --cwd packages/session-state test",
    "bun run --cwd packages/web test",
    "bun run test:stores",
    "bun run test:react",
    "bun run test:integration",
    "bun run build",
  ];

  for (const command of requiredCommands) {
    assert.match(source, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("browser and chat performance proof share an explicit opt-in", async () => {
  const source = await readFile(verifyScript, "utf8");

  assert.match(source, /VERIFY_BROWSER/);
  assert.match(source, /bun run --cwd tests test:browser/);
  assert.match(source, /bun run test:perf:chat/);
});
