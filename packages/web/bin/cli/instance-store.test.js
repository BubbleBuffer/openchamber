import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createPaths } from './paths.js';
import { createInstanceStore } from './instance-store.js';

const fixtures = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeStore(runtime = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-instance-store-'));
  fixtures.push(directory);
  const paths = createPaths({ env: { OPENCHAMBER_DATA_DIR: directory }, homedir: directory });
  return createInstanceStore({
    paths,
    fsLike: fs,
    processRuntime: {
      isProcessRunning: runtime.isProcessRunning || (() => true),
      getProcessIdentity: runtime.getProcessIdentity || (() => ({ fingerprint: 'pid:known' })),
    },
    clock: () => 1234,
  });
}

describe('instance store', () => {
  it('persists and discovers a record with its process identity fingerprint', async () => {
    const store = makeStore({ getProcessIdentity: (pid) => ({ fingerprint: `start:${pid}` }) });

    store.writePidFile(3000, 42);
    store.writeInstanceRecord(3000, { port: 3000, pid: 42, launchMode: 'daemon' });

    await expect(store.discoverRunningInstances()).resolves.toEqual([
      expect.objectContaining({
        port: 3000,
        pid: 42,
        identityFingerprint: 'start:42',
      }),
    ]);
  });

  it('prunes only stale OpenChamber files when the PID is dead', async () => {
    const store = makeStore({ isProcessRunning: () => false });
    fs.mkdirSync(store.paths.getRunDir(), { recursive: true });
    const unrelated = path.join(store.paths.getRunDir(), 'unrelated.txt');
    fs.writeFileSync(unrelated, 'keep');
    store.writePidFile(3001, 99);
    store.writeInstanceRecord(3001, { port: 3001, pid: 99 });

    await expect(store.discoverRunningInstances()).resolves.toEqual([]);
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(fs.existsSync(store.paths.getPidFilePath(3001))).toBe(false);
    expect(fs.existsSync(store.paths.getInstanceFilePath(3001))).toBe(false);
  });

  it('prunes a reused PID without signaling or retaining the record', async () => {
    const store = makeStore({
      getProcessIdentity: (pid) => ({ fingerprint: pid === 77 ? 'new-process' : 'old-process' }),
    });
    store.writePidFile(3002, 77);
    store.writeInstanceRecord(3002, { port: 3002, pid: 77, identityFingerprint: 'old-process' });

    await expect(store.discoverRunningInstances()).resolves.toEqual([]);
    expect(fs.existsSync(store.paths.getPidFilePath(3002))).toBe(false);
    expect(fs.existsSync(store.paths.getInstanceFilePath(3002))).toBe(false);
  });

  it('keeps legacy and identity-unverified records discoverable without inventing a fingerprint', async () => {
    const store = makeStore({ getProcessIdentity: () => null });
    store.writePidFile(3003, 78);
    store.writeInstanceRecord(3003, { port: 3003, pid: 78 });

    await expect(store.discoverRunningInstances()).resolves.toEqual([
      expect.objectContaining({ identityStatus: 'identity-unverified', identityFingerprint: null }),
    ]);
  });

  it('treats a malformed instance record as legacy evidence and never removes unrelated files', async () => {
    const store = makeStore();
    fs.mkdirSync(store.paths.getRunDir(), { recursive: true });
    const unrelated = path.join(store.paths.getRunDir(), 'keep.me');
    fs.writeFileSync(unrelated, 'keep');
    store.writePidFile(3004, 79);
    fs.writeFileSync(store.paths.getInstanceFilePath(3004), '{not-json');

    await expect(store.discoverRunningInstances()).resolves.toEqual([
      expect.objectContaining({ port: 3004, identityStatus: 'identity-unverified' }),
    ]);
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it('selects the newest instance using start time, then file mtime and port', () => {
    const store = makeStore();
    expect(store.getLatestInstance([
      { port: 3000, startedAt: 10, mtime: 20 },
      { port: 3001, startedAt: 11, mtime: 1 },
    ]).port).toBe(3001);
  });
});
