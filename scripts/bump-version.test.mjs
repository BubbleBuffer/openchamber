import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { bumpVersion } from './bump-version.mjs';

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test('bumps workspace manifests and regenerates a frozen-installable lockfile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openchamber-bump-version-'));
  const version = '9.8.7';

  try {
    await writeJson(path.join(root, 'package.json'), { name: 'root', version: '1.0.0' });
    await writeJson(path.join(root, 'packages/session-state/package.json'), {
      name: '@openchamber/session-state', version: '1.0.0', dependencies: { xstate: '^5.19.2' },
    });
    await writeJson(path.join(root, 'packages/web/package.json'), {
      name: '@openchamber/web', version: '1.0.0', dependencies: { '@openchamber/session-state': '1.0.0' },
    });
    await writeFile(path.join(root, 'bun.lock'), 'stale lockfile\n');

    const runBun = (args, { cwd }) => {
      assert.equal(cwd, root);
      if (args.join(' ') === 'install --lockfile-only') {
        return fs.writeFileSync(path.join(root, 'bun.lock'), JSON.stringify({
          workspaces: {
            root: JSON.parse(readFileSync(path.join(root, 'package.json'))).version,
            sessionState: JSON.parse(readFileSync(path.join(root, 'packages/session-state/package.json'))).version,
            web: JSON.parse(readFileSync(path.join(root, 'packages/web/package.json'))).version,
            webSessionState: JSON.parse(readFileSync(path.join(root, 'packages/web/package.json'))).dependencies['@openchamber/session-state'],
          },
        }));
      }
      if (args.join(' ') === 'install --frozen-lockfile') {
        const lock = JSON.parse(readFileSync(path.join(root, 'bun.lock')));
        assert.deepEqual(lock.workspaces, {
          root: version, sessionState: version, web: version, webSessionState: version,
        });
        return;
      }
      throw new Error(`Unexpected Bun invocation: ${args.join(' ')}`);
    };

    await bumpVersion({ root, version, runBun });
    await runBun(['install', '--frozen-lockfile'], { cwd: root });

    for (const packagePath of ['package.json', 'packages/session-state/package.json', 'packages/web/package.json']) {
      const manifest = JSON.parse(await readFile(path.join(root, packagePath), 'utf8'));
      assert.equal(manifest.version, version);
    }
    const web = JSON.parse(await readFile(path.join(root, 'packages/web/package.json'), 'utf8'));
    assert.equal(web.dependencies['@openchamber/session-state'], version);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restores manifests and lockfile when lockfile regeneration fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openchamber-bump-version-'));

  try {
    await writeJson(path.join(root, 'package.json'), { name: 'root', version: '1.0.0' });
    await writeJson(path.join(root, 'packages/session-state/package.json'), { name: '@openchamber/session-state', version: '1.0.0' });
    await writeJson(path.join(root, 'packages/web/package.json'), {
      name: '@openchamber/web', version: '1.0.0', dependencies: { '@openchamber/session-state': '1.0.0' },
    });
    await writeFile(path.join(root, 'bun.lock'), 'original lockfile\n');

    assert.throws(
      () => bumpVersion({ root, version: '9.8.7', runBun: () => { throw new Error('Bun unavailable'); } }),
      /restored manifests and lockfile/,
    );

    assert.equal(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version, '1.0.0');
    assert.equal(
      JSON.parse(await readFile(path.join(root, 'packages/web/package.json'), 'utf8')).dependencies['@openchamber/session-state'],
      '1.0.0',
    );
    assert.equal(await readFile(path.join(root, 'bun.lock'), 'utf8'), 'original lockfile\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function readFileSync(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('real Bun regeneration produces a frozen-installable workspace lockfile', {
  skip: spawnSync('bun', ['--version']).status !== 0,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'openchamber-bump-version-bun-'));
  const version = '9.8.7';

  try {
    await writeJson(path.join(root, 'package.json'), {
      name: 'root', version: '1.0.0', private: true, workspaces: ['packages/*'],
    });
    await writeJson(path.join(root, 'packages/session-state/package.json'), {
      name: '@openchamber/session-state', version: '1.0.0', dependencies: { xstate: '^5.19.2' },
    });
    await writeJson(path.join(root, 'packages/web/package.json'), {
      name: '@openchamber/web', version: '1.0.0', dependencies: { '@openchamber/session-state': '1.0.0' },
    });
    await writeFile(path.join(root, 'bun.lock'), 'stale lockfile\n');

    bumpVersion({ root, version });
    execFileSync('bun', ['install', '--frozen-lockfile'], { cwd: root, stdio: 'pipe' });

    const lockfile = await readFile(path.join(root, 'bun.lock'), 'utf8');
    for (const expected of [
      '"packages/session-state"', `"version": "${version}"`,
      '"packages/web"', `"@openchamber/session-state": "${version}"`,
    ]) {
      assert.match(lockfile, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
