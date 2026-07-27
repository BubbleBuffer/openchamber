import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const entrypoint = path.join(repositoryRoot, 'scripts', 'docker-entrypoint.sh');

function executable(directory, name, source) {
  const filePath = path.join(directory, name);
  writeFileSync(filePath, source);
  chmodSync(filePath, 0o755);
  return filePath;
}

function runEntrypoint(args = [], environment = {}) {
  const home = mkdtempSync(path.join(tmpdir(), 'openchamber-entrypoint-home-'));
  const bin = path.join(home, 'bin');
  mkdirSync(bin);
  const logPath = path.join(home, 'calls.log');
  executable(bin, 'ssh-keygen', '#!/bin/sh\nexit 0\n');
  executable(bin, 'bun', '#!/bin/sh\nprintf "bun %s\\n" "$*" >> "$FAKE_LOG"\n');
  executable(bin, 'fake-command', '#!/bin/sh\nprintf "command %s\\n" "$*" >> "$FAKE_LOG"\n');

  const result = spawnSync('sh', [entrypoint, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      FAKE_LOG: logPath,
      OH_MY_OPENCODE: 'false',
      ...environment,
    },
  });

  const calls = readFileSync(logPath, 'utf8');
  rmSync(home, { recursive: true, force: true });
  return { result, calls };
}

test('passes explicit commands and arguments through unchanged', () => {
  const { result, calls } = runEntrypoint(['fake-command', 'serve', '--port', '3210']);

  assert.equal(result.status, 0);
  assert.equal(calls, 'command serve --port 3210\n');
});

test('runs the package bin for default serve, forwards UI_PASSWORD, then invokes logs', () => {
  const { result, calls } = runEntrypoint([], { UI_PASSWORD: 'secret' });

  assert.equal(result.status, 0);
  assert.equal(calls, 'bun packages/web/bin/cli.js --ui-password secret\nbun packages/web/bin/cli.js logs\n');
});
