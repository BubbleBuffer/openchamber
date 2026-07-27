import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { createServeCommand } from './serve.js';
import { createOpenCodeCli } from '../opencode-cli.js';

describe('serve command', () => {
  it('keeps foreground startup in the CLI process', async () => {
    const calls = [];
    const serve = createServeCommand({
      serverEntries: { foreground: '/server/index.js', daemon: '/server/main.js' },
      startForeground: async (options) => {
        calls.push(options);
        return { getPort: () => 3210 };
      },
      output: { stdout: { write: () => {} }, stderr: { write: () => {} }, shouldRenderHumanOutput: () => false, isJsonMode: () => false, isQuietMode: () => true },
      processLike: { pid: 99, env: {} },
      discoverOpenCode: async () => '/bin/opencode',
      keepForegroundAlive: async () => {},
      paths: {
        getPidFilePath: () => 'pid',
        getInstanceFilePath: () => 'instance',
        getLogFilePath: () => 'log',
      },
      instanceStore: {
        writePidFile: () => {},
        writeInstanceRecord: () => {},
        removePidFile: () => {},
        removeInstanceFile: () => {},
        readPidFile: () => null,
      },
      processRuntime: {
        resolveAvailablePort: async () => 3210,
        isPortAvailable: async () => true,
        isProcessRunning: () => true,
        buildLocalUrl: () => 'http://127.0.0.1:3210/',
      },
      logFiles: { ensureLogDir: () => {}, rotateLogFile: () => {}, getLogFilePath: () => 'log' },
      fsLike: { openSync: () => 1, closeSync: () => {}, existsSync: () => false, unlinkSync: () => {} },
    });

    await serve({ port: 3210, explicitPort: true, foreground: true, quiet: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.objectContaining({ port: 3210, attachSignals: false, exitOnShutdown: false }));
  });

  it('prunes a stale or identity-mismatched OpenChamber record before recovery', async () => {
    const removed = [];
    const serve = createServeCommand({
      paths: {
        getPidFilePath: (port) => `pid-${port}`,
        getInstanceFilePath: (port) => `instance-${port}`,
        getLogFilePath: () => 'log',
      },
      instanceStore: {
        readPidFile: () => 42,
        readInstanceRecord: () => ({ pid: 42, identityFingerprint: 'old' }),
        removePidFile: (file) => removed.push(['pid', file]),
        removeInstanceFile: (file) => removed.push(['instance', file]),
        writePidFile: () => {},
        writeInstanceRecord: () => {},
      },
      processRuntime: {
        resolveAvailablePort: async () => 3211,
        verifyIdentity: () => ({ verified: false, reason: 'stale-record' }),
        isProcessRunning: () => true,
        isPortAvailable: async () => true,
      },
      logFiles: { ensureLogDir: () => {}, rotateLogFile: () => {}, getLogFilePath: () => 'log' },
      fsLike: { openSync: () => 1, closeSync: () => {} },
      processLike: { pid: 99, env: {}, stdout: { write: vi.fn() }, stderr: { write: vi.fn() } },
      output: { stdout: { write: vi.fn() }, stderr: { write: vi.fn() }, shouldRenderHumanOutput: () => false, isJsonMode: () => false, isQuietMode: () => true },
      discoverOpenCode: async () => '/bin/opencode',
      startForeground: async () => ({ getPort: () => 3211 }),
      keepForegroundAlive: async () => {},
    });

    await expect(serve({ port: 3211, explicitPort: true, foreground: true, quiet: true })).resolves.toBe(3211);
    expect(removed).toEqual([['pid', 'pid-3211'], ['instance', 'instance-3211']]);
  });

  it('persists an auto-selected listening port only after verified daemon IPC readiness', async () => {
    const written = [];
    const child = new EventEmitter();
    child.pid = 77;
    child.unref = vi.fn();
    child.disconnect = vi.fn();
    const serve = createServeCommand({
      paths: { getPidFilePath: (port) => `pid-${port}`, getInstanceFilePath: (port) => `instance-${port}`, getLogFilePath: (port) => `log-${port}` },
      instanceStore: {
        readPidFile: () => null,
        writePidFile: (file, pid) => written.push(['pid', file, pid]),
        writeInstanceRecord: (file, record) => written.push(['instance', file, record]),
        removePidFile: vi.fn(),
        removeInstanceFile: vi.fn(),
      },
      processRuntime: {
        resolveAvailablePort: async () => 0,
        buildLocalUrl: (port) => `http://127.0.0.1:${port}/`,
      },
      logFiles: { ensureLogDir: vi.fn(), rotateLogFile: vi.fn(), getLogFilePath: (port) => `log-${port}` },
      fsLike: { openSync: () => 4, closeSync: vi.fn(), existsSync: () => false, unlinkSync: vi.fn() },
      processLike: { env: {}, stdout: { write: vi.fn() }, stderr: { write: vi.fn() } },
      output: { stdout: { write: vi.fn() }, stderr: { write: vi.fn() }, shouldRenderHumanOutput: () => false, isJsonMode: () => false, isQuietMode: () => true },
      discoverOpenCode: async () => '/bin/opencode',
      spawnImpl: () => { queueMicrotask(() => child.emit('message', { type: 'openchamber:ready', port: 4321 })); return child; },
      readinessTimeoutMs: 50,
      serverEntries: { foreground: 'foreground', daemon: 'daemon' },
    });

    await expect(serve({ port: 3000, quiet: true })).resolves.toBe(4321);
    expect(written[0]).toEqual(['pid', 'pid-4321', 77]);
    expect(written[1][1]).toBe('instance-4321');
  });

  it('rolls back a newly spawned child and log when readiness times out', async () => {
    const child = new EventEmitter();
    child.pid = 78;
    const terminate = vi.fn(async () => ({ stopped: true }));
    const unlink = vi.fn();
    const serve = createServeCommand({
      paths: { getPidFilePath: (port) => `pid-${port}`, getInstanceFilePath: (port) => `instance-${port}`, getLogFilePath: () => 'log-auto' },
      instanceStore: { readPidFile: () => null, removePidFile: vi.fn(), removeInstanceFile: vi.fn() },
      processRuntime: { resolveAvailablePort: async () => 0, getProcessIdentity: () => ({ fingerprint: 'start:78' }), terminateProcessTree: terminate },
      logFiles: { ensureLogDir: vi.fn(), rotateLogFile: vi.fn(), getLogFilePath: () => 'log-auto' },
      fsLike: { openSync: () => 5, closeSync: vi.fn(), existsSync: () => true, unlinkSync: unlink },
      processLike: { env: {}, stdout: { write: vi.fn() }, stderr: { write: vi.fn() } },
      output: { stdout: { write: vi.fn() }, stderr: { write: vi.fn() }, shouldRenderHumanOutput: () => false, isJsonMode: () => false, isQuietMode: () => true },
      discoverOpenCode: async () => '/bin/opencode',
      spawnImpl: () => child,
      readinessTimeoutMs: 1,
      serverEntries: { foreground: 'foreground', daemon: 'daemon' },
    });

    await expect(serve({ port: 3000, quiet: true })).rejects.toThrow('readiness');
    expect(terminate).toHaveBeenCalledWith({ pid: 78, identityFingerprint: 'start:78' }, expect.any(Object));
    expect(unlink).toHaveBeenCalledWith('log-auto');
  });

  it('uses the spawned child handle for cleanup when identity probing is unavailable', async () => {
    const child = new EventEmitter();
    child.pid = 80;
    child.kill = vi.fn(() => true);
    const serve = createServeCommand({
      paths: { getPidFilePath: (port) => `pid-${port}`, getInstanceFilePath: (port) => `instance-${port}`, getLogFilePath: () => 'log-auto' },
      instanceStore: { readPidFile: () => null, removePidFile: vi.fn(), removeInstanceFile: vi.fn() },
      processRuntime: { resolveAvailablePort: async () => 0, getProcessIdentity: () => null },
      logFiles: { ensureLogDir: vi.fn(), rotateLogFile: vi.fn(), getLogFilePath: () => 'log-auto' },
      fsLike: { openSync: () => 5, closeSync: vi.fn(), existsSync: () => true, unlinkSync: vi.fn() },
      processLike: { env: {}, stdout: { write: vi.fn() }, stderr: { write: vi.fn() } },
      output: { stdout: { write: vi.fn() }, stderr: { write: vi.fn() }, shouldRenderHumanOutput: () => false, isJsonMode: () => false, isQuietMode: () => true },
      discoverOpenCode: async () => '/bin/opencode',
      spawnImpl: () => child,
      readinessTimeoutMs: 1,
      serverEntries: { foreground: 'foreground', daemon: 'daemon' },
    });

    await expect(serve({ port: 3000, quiet: true })).rejects.toThrow('readiness');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('passes the Bun runtime selected by the injected OpenCode CLI runtime policy to daemon spawn', async () => {
    const child = new EventEmitter();
    child.pid = 79;
    child.unref = vi.fn();
    child.disconnect = vi.fn();
    let spawnedWith;
    const serve = createServeCommand({
      paths: { getPidFilePath: (port) => `pid-${port}`, getInstanceFilePath: (port) => `instance-${port}`, getLogFilePath: () => 'log' },
      serverEntries: { foreground: 'foreground', daemon: 'daemon' },
      instanceStore: { readPidFile: () => null, writePidFile: () => {}, writeInstanceRecord: () => {}, removePidFile: vi.fn(), removeInstanceFile: vi.fn() },
      processRuntime: { resolveAvailablePort: async () => 3000, isPortAvailable: async () => true, buildLocalUrl: () => 'http://127.0.0.1:3000/' },
      logFiles: { ensureLogDir: vi.fn(), rotateLogFile: vi.fn(), getLogFilePath: () => 'log' },
      fsLike: { openSync: () => 6, closeSync: vi.fn(), existsSync: () => false, unlinkSync: vi.fn() },
      processLike: { execPath: '/node', env: {}, stdout: { write: vi.fn() }, stderr: { write: vi.fn() } },
      output: { stdout: { write: vi.fn() }, stderr: { write: vi.fn() }, shouldRenderHumanOutput: () => false, isJsonMode: () => false, isQuietMode: () => true },
      openCodeCli: { checkOpenCodeCli: async () => '/bin/opencode', getDaemonRuntimeBin: () => '/bun' },
      discoverOpenCode: async () => '/bin/opencode',
      spawnImpl: (runtime) => { spawnedWith = runtime; queueMicrotask(() => child.emit('message', { type: 'openchamber:ready', port: 3000 })); return child; },
      readinessTimeoutMs: 50,
    });

    await serve({ port: 3000, explicitPort: true, quiet: true });
    expect(spawnedWith).toBe('/bun');
  });

  it('discovers configured and PATH OpenCode binaries through explicit filesystem dependencies', async () => {
    const executableFiles = new Set(['/configured/opencode', '/path/opencode']);
    const fsLike = {
      statSync: (file) => ({ isFile: () => executableFiles.has(file) }),
      accessSync: () => {},
      constants: { X_OK: 1 },
    };
    const configuredEnv = { OPENCODE_BINARY: '/configured/opencode', PATH: '/path' };
    const configured = createOpenCodeCli({ env: configuredEnv, fsLike, processLike: { platform: 'linux' } });
    await expect(configured.checkOpenCodeCli()).resolves.toBe('/configured/opencode');

    const pathEnv = { PATH: '/path' };
    const fromPath = createOpenCodeCli({ env: pathEnv, fsLike, processLike: { platform: 'linux' } });
    await expect(fromPath.checkOpenCodeCli()).resolves.toBe('/path/opencode');
    expect(pathEnv.OPENCODE_BINARY).toBe('/path/opencode');
  });

  it('preserves the prior Bun-installed versus Node fallback runtime policy', () => {
    const bun = createOpenCodeCli({
      env: { BUN_BINARY: '/tools/bun' },
      processLike: { execPath: '/node', platform: 'linux' },
      spawnSyncLike: () => ({ status: 0 }),
    });
    const node = createOpenCodeCli({
      env: { BUN_BINARY: '/tools/bun' },
      processLike: { execPath: '/node', platform: 'linux' },
      spawnSyncLike: () => ({ status: 1 }),
    });

    expect(bun.getDaemonRuntimeBin()).toBe('/tools/bun');
    expect(node.getDaemonRuntimeBin()).toBe('/node');
  });
});
