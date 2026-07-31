import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseWorkflow = new URL("../.github/workflows/release.yml", import.meta.url);
const reviewWorkflow = new URL("../.github/workflows/oc-review.yml", import.meta.url);

test("release validation precedes release creation and validates the requested version", async () => {
  const source = await readFile(releaseWorkflow, "utf8");

  assert.match(source, /^  verify:\n/m);
  assert.match(source, /^    needs: verify\n/m);
  assert.match(source, /node scripts\/check-release-version\.mjs "\$version"/);
  assert.doesNotMatch(source, /\$\{\{ github\.event\.inputs\.version \}\}.*(?:echo|\[\[)/);
});

test("publishes the same smoke-tested tarballs and records their hashes", async () => {
  const source = await readFile(releaseWorkflow, "utf8");

  assert.match(source, /bun run smoke:packages -- packages\/session-state\/\*\.tgz packages\/web\/\*\.tgz/);
  assert.match(source, /sha256sum packages\/session-state\/\*\.tgz packages\/web\/\*\.tgz/);
  assert.match(source, /npm publish packages\/session-state\/\*\.tgz --access public/);
  assert.match(source, /npm publish packages\/web\/\*\.tgz --access public/);
  assert.doesNotMatch(source, /SENTRY_/);
});

test("pull-request checks use read-only permissions and include browser/package proof", async () => {
  const source = await readFile(reviewWorkflow, "utf8");

  assert.match(source, /permissions:\n  contents: read/);
  assert.match(source, /bash scripts\/verify\.sh/);
  assert.match(source, /bun run --cwd tests test:browser/);
  assert.match(source, /bun run smoke:packages/);
});
