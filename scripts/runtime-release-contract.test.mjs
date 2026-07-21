import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('direct server dev commands build session-state before Bun starts', async () => {
  const webPackage = JSON.parse(await readFile(path.join(root, 'packages/web/package.json'), 'utf8'));

  assert.equal(webPackage.scripts['build:session-state'], 'bun run --cwd ../session-state build');
  for (const script of ['dev:server', 'dev:server:watch', 'dev:server:ts']) {
    assert.match(webPackage.scripts[script], /^bun run build:session-state && bun(?: --watch)? server\/src\/main\.ts/);
  }
});

test('release dry runs do not create or publicize releases', async () => {
  const workflow = YAML.parse(await readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'));
  const dryRunGate = "${{ github.event.inputs.dry_run != 'true' }}";
  const createRelease = workflow.jobs['create-release'].steps.find((step) => step.name === 'Create GitHub Release');
  const uploadTarball = workflow.jobs['publish-npm'].steps.find((step) => step.name === 'Upload npm tarball to release');

  assert.equal(createRelease.if, dryRunGate);
  assert.equal(uploadTarball.if, dryRunGate);
  assert.equal(workflow.jobs['finalize-release'].if, dryRunGate);
  assert.equal(workflow.jobs['publish-npm'].steps.find((step) => step.name === 'Publish session-state to npm').if, dryRunGate);
  assert.equal(workflow.jobs['publish-npm'].steps.find((step) => step.name === 'Publish web to npm').if, dryRunGate);
  assert.equal(workflow.jobs['publish-npm'].if, undefined);
  assert.ok(
    workflow.jobs['publish-npm'].steps.findIndex((step) => step.name === 'Publish session-state to npm')
      < workflow.jobs['publish-npm'].steps.findIndex((step) => step.name === 'Publish web to npm'),
  );
});
