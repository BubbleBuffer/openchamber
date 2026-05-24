// packages/web/server/lib/opencode/runtime.test.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthRuntime = {
  getOpenCodeAuthHeaders: vi.fn(() => ({ Authorization: 'Basic test' })),
  isOpenCodeConnectionSecure: vi.fn(() => true),
  ensureLocalOpenCodeServerPassword: vi.fn(async () => 'password'),
};

const mockNetworkRuntime = {
  buildOpenCodeUrl: vi.fn((p) => `http://127.0.0.1:4096${p}`),
  normalizeApiPrefix: vi.fn(() => ''),
  waitForReady: vi.fn(async () => true),
  ensureOpenCodeApiPrefix: vi.fn(),
  setDetectedOpenCodeApiPrefix: vi.fn(),
};

const mockLifecycleRuntime = {
  bootstrapOpenCodeAtStartup: vi.fn(async () => {}),
  restartOpenCode: vi.fn(async () => {}),
  refreshOpenCodeAfterConfigChange: vi.fn(async () => {}),
  startHealthMonitoring: vi.fn(),
  triggerHealthCheck: vi.fn(async () => {}),
  waitForOpenCodeReady: vi.fn(async () => {}),
  waitForAgentPresence: vi.fn(async () => {}),
  killProcessOnPort: vi.fn(),
  waitForPortRelease: vi.fn(async () => true),
};

vi.mock('./bootstrap/lifecycle.js', () => ({
  createOpenCodeLifecycleRuntime: vi.fn(() => mockLifecycleRuntime),
}));

vi.mock('./auth.js', () => ({
  createOpenCodeAuthStateRuntime: vi.fn(() => mockAuthRuntime),
}));

vi.mock('./network.js', () => ({
  createOpenCodeNetworkRuntime: vi.fn(() => mockNetworkRuntime),
}));

import { createOpenCodeRuntime } from './runtime.js';

function createRuntime(overrides = {}) {
  return createOpenCodeRuntime({
    eventBus: { on: vi.fn(), emit: vi.fn() },
    config: {
      env: {
        ENV_CONFIGURED_OPENCODE_PORT: 4096,
        ENV_CONFIGURED_OPENCODE_HOST: null,
        ENV_EFFECTIVE_PORT: null,
        ENV_CONFIGURED_OPENCODE_HOSTNAME: '127.0.0.1',
        ENV_SKIP_OPENCODE_START: false,
      },
      syncToHmrState: vi.fn(),
      syncFromHmrState: vi.fn(),
      applyOpencodeBinaryFromSettings: vi.fn(async () => null),
      ensureOpencodeCliEnv: vi.fn(),
      buildWslExecArgs: vi.fn((args) => args),
      resolveWslExecutablePath: vi.fn(() => null),
      resolveManagedOpenCodeLaunchSpec: vi.fn(() => null),
      buildAugmentedPath: vi.fn(() => process.env.PATH),
      buildManagedOpenCodePath: vi.fn(() => process.env.PATH),
      clearResolvedOpenCodeBinary: vi.fn(),
      normalizeApiPrefix: vi.fn(() => ''),
      ...overrides,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('OpenCodeRuntime', () => {
  describe('accessors', () => {
    it('getUrl delegates to network runtime', () => {
      const rt = createRuntime();
      mockNetworkRuntime.buildOpenCodeUrl.mockReturnValue('http://127.0.0.1:4096/global/health');
      const url = rt.getUrl('/global/health');
      expect(url).toBe('http://127.0.0.1:4096/global/health');
      expect(mockNetworkRuntime.buildOpenCodeUrl).toHaveBeenCalledWith('/global/health', undefined);
    });

    it('getUrl passes prefixOverride through', () => {
      const rt = createRuntime();
      mockNetworkRuntime.buildOpenCodeUrl.mockReturnValue('http://127.0.0.1:4096/api/session');
      const url = rt.getUrl('/session', '');
      expect(url).toBe('http://127.0.0.1:4096/api/session');
      expect(mockNetworkRuntime.buildOpenCodeUrl).toHaveBeenCalledWith('/session', '');
    });

    it('getAuthHeaders delegates to auth runtime', () => {
      const rt = createRuntime();
      const headers = rt.getAuthHeaders();
      expect(headers).toEqual({ Authorization: 'Basic test' });
      expect(mockAuthRuntime.getOpenCodeAuthHeaders).toHaveBeenCalled();
    });

    it('isConnectionSecure delegates to auth runtime', () => {
      const rt = createRuntime();
      expect(rt.isConnectionSecure()).toBe(true);
    });

    it('isReady returns false initially', () => {
      const rt = createRuntime();
      expect(rt.isReady()).toBe(false);
    });

    it('isRestarting returns false initially', () => {
      const rt = createRuntime();
      expect(rt.isRestarting()).toBe(false);
    });

    it('getPort returns null initially', () => {
      const rt = createRuntime();
      expect(rt.getPort()).toBeNull();
    });

    it('isExternal returns false initially', () => {
      const rt = createRuntime();
      expect(rt.isExternal()).toBe(false);
    });

    it('setApp stores express app reference', () => {
      const rt = createRuntime();
      const app = {};
      rt.setApp(app);
      expect(rt.getState().expressApp).toBe(app);
    });

    it('setShuttingDown sets shutdown flag', () => {
      const rt = createRuntime();
      rt.setShuttingDown(true);
      expect(rt.getState().isShuttingDown).toBe(true);
    });
  });

  describe('lifecycle delegation', () => {
    it('init delegates to bootstrapOpenCodeAtStartup', async () => {
      const rt = createRuntime();
      await rt.init();
      expect(mockLifecycleRuntime.bootstrapOpenCodeAtStartup).toHaveBeenCalled();
    });

    it('restart delegates to restartOpenCode', async () => {
      const rt = createRuntime();
      await rt.restart();
      expect(mockLifecycleRuntime.restartOpenCode).toHaveBeenCalled();
    });

    it('refreshAfterConfigChange delegates', async () => {
      const rt = createRuntime();
      await rt.refreshAfterConfigChange('config-change', { agentName: 'test' });
      expect(mockLifecycleRuntime.refreshOpenCodeAfterConfigChange).toHaveBeenCalledWith('config-change', { agentName: 'test' });
    });

    it('startHealthMonitoring delegates', () => {
      const rt = createRuntime();
      rt.startHealthMonitoring(15000);
      expect(mockLifecycleRuntime.startHealthMonitoring).toHaveBeenCalledWith(15000);
    });

    it('triggerHealthCheck delegates', async () => {
      const rt = createRuntime();
      await rt.triggerHealthCheck();
      expect(mockLifecycleRuntime.triggerHealthCheck).toHaveBeenCalled();
    });

    it('waitForReady delegates', async () => {
      const rt = createRuntime();
      await rt.waitForReady(20000);
      expect(mockLifecycleRuntime.waitForOpenCodeReady).toHaveBeenCalledWith(20000);
    });

    it('waitForAgentPresence delegates', async () => {
      const rt = createRuntime();
      await rt.waitForAgentPresence('test-agent', 10000);
      expect(mockLifecycleRuntime.waitForAgentPresence).toHaveBeenCalledWith('test-agent', 10000);
    });

    // waitForPort is implemented locally in runtime.js, NOT delegating to lifecycle
    // because lifecycle.js doesn't export waitForOpenCodePort.
    // runtime.js implements it as a local polling function that checks state.openCodePort.

    it('killProcessOnPort delegates', () => {
      const rt = createRuntime();
      rt.killProcessOnPort(4096);
      expect(mockLifecycleRuntime.killProcessOnPort).toHaveBeenCalledWith(4096);
    });

    it('waitForPortRelease delegates', async () => {
      const rt = createRuntime();
      const result = await rt.waitForPortRelease(4096, 5000);
      expect(result).toBe(true);
      expect(mockLifecycleRuntime.waitForPortRelease).toHaveBeenCalledWith(4096, 5000);
    });
  });

  describe('health', () => {
    it('stopHealthMonitoring clears interval', () => {
      const rt = createRuntime();
      const fakeInterval = setInterval(() => {}, 10000);
      rt.getState().healthCheckInterval = fakeInterval;
      rt.stopHealthMonitoring();
      expect(rt.getState().healthCheckInterval).toBeNull();
      clearInterval(fakeInterval);
    });
  });
});
