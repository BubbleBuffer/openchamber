import { describe, expect, it, vi } from 'vitest';

import { createProcessRuntime } from './process-runtime.js';

describe('process runtime', () => {
  it('refuses to signal a PID whose exact identity has changed', async () => {
    const signals = [];
    const runtime = createProcessRuntime({
      processLike: {
        kill: (pid, signal) => signals.push([pid, signal]),
        platform: 'linux',
      },
      identityProbe: () => ({ fingerprint: 'new' }),
      isProcessRunning: () => true,
      timers: { setTimeout: () => 0, clearTimeout: () => {} },
      clock: () => 100,
    });

    const result = await runtime.stopInstanceProcess({ pid: 42, identityFingerprint: 'old' }, {
      shutdownWaitMs: 0,
      gracefulTimeoutMs: 0,
      forceTimeoutMs: 0,
    });

    expect(result).toEqual(expect.objectContaining({ stopped: false, reason: 'stale-record' }));
    expect(signals).toEqual([]);
  });

  it('does not escalate an unverified legacy record', async () => {
    const kill = vi.fn();
    const runtime = createProcessRuntime({
      processLike: { kill, platform: 'linux' },
      isProcessRunning: () => true,
      identityProbe: () => null,
      timers: { setTimeout: () => 0, clearTimeout: () => {} },
      clock: () => 100,
    });

    const result = await runtime.stopInstanceProcess({ pid: 43 }, { shutdownWaitMs: 0 });

    expect(result).toEqual(expect.objectContaining({ stopped: false, reason: 'identity-unverified' }));
    expect(kill).not.toHaveBeenCalled();
  });

  it('checks identity before graceful and force escalation', async () => {
    const signals = [];
    let alive = true;
    const runtime = createProcessRuntime({
      processLike: {
        kill: (pid, signal) => {
          signals.push([pid, signal]);
          if (signal === 'SIGKILL') alive = false;
        },
        platform: 'linux',
      },
      identityProbe: () => ({ fingerprint: 'same' }),
      isProcessRunning: () => alive,
      timers: { setTimeout: (callback) => { callback(); return 0; }, clearTimeout: () => {} },
      clock: (() => { let now = 0; return () => (now += 1); })(),
    });

    const result = await runtime.stopInstanceProcess({ pid: 44, identityFingerprint: 'same' }, {
      shutdownWaitMs: 0,
      gracefulTimeoutMs: 0,
      forceTimeoutMs: 0,
    });

    expect(result.stopped).toBe(true);
    expect(signals).toEqual([[44, 'SIGTERM'], [44, 'SIGKILL']]);
  });

  it('distinguishes an occupied port from a free port and reports the system-info occupant', async () => {
    const listeners = new Set([3000]);
    const netLike = {
      createServer() {
        const handlers = {};
        return {
          unref() {},
          on(event, handler) { handlers[event] = handler; return this; },
          listen({ port }) {
            if (listeners.has(port)) handlers.error?.(new Error('busy'));
            else { listeners.add(port); handlers.listening?.(); }
          },
          close(callback) { callback(); },
        };
      },
    };
    const runtime = createProcessRuntime({
      netLike,
      fetchImpl: async () => ({ ok: true, json: async () => ({ runtime: 'cli', pid: 9 }) }),
      timers: { setTimeout, clearTimeout },
    });

    await expect(runtime.isPortAvailable(3000)).resolves.toBe(false);
    await expect(runtime.resolveAvailablePort(3000, false)).resolves.toBe(0);
    await expect(runtime.fetchSystemInfoFromPort(3000)).resolves.toEqual({ runtime: 'cli', pid: 9 });
  });

  it('uses the generic occupied-port notice for every runtime', async () => {
    const notices = [];
    const runtime = createProcessRuntime({
      netLike: {
        createServer() {
          return {
            unref() {},
            on(event, handler) { if (event === 'error') this.error = handler; return this; },
            listen() { this.error?.(new Error('busy')); },
            close(callback) { callback(); },
          };
        },
      },
      fetchImpl: async () => ({ ok: true, json: async () => ({ runtime: 'desktop', pid: 9 }) }),
    });

    await runtime.resolveAvailablePort(3000, false, (notice) => notices.push(notice));

    expect(notices[0].message).toBe('Port 3000 in use; using a free port');
  });

  it('aborts timed-out JSON probes and clears the timer', async () => {
    const cleared = [];
    const runtime = createProcessRuntime({
      fetchImpl: async (_url, { signal }) => {
        if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      },
      timers: {
        setTimeout: (callback) => { callback(); return 12; },
        clearTimeout: (id) => cleared.push(id),
      },
    });

    await expect(runtime.requestJson(3000, '/health', { timeoutMs: 5 })).rejects.toThrow('timed out after 5ms');
    expect(cleared).toEqual([12]);
  });
});
