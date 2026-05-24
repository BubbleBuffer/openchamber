import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEventBus } from '../core/event-bus.js';
import { createTunnelRuntime } from './tunnel-runtime.js';

describe('tunnel-runtime', () => {
  it('initializes and provides tunnel context', () => {
    const eventBus = createEventBus();

    /** @type {Array<{ type: string; payload: unknown }>} */
    const events = [];
    eventBus.on('server:port-bound', (payload) => {
      events.push({ type: 'server:port-bound', payload });
    });

    const runtime = createTunnelRuntime({
      eventBus,
      crypto,
      URL: globalThis.URL,
      readSettingsFromDiskMigrated: async () => ({}),
      readManagedRemoteTunnelConfigFromDisk: async () => ({ tunnels: [], version: 1 }),
      normalizeTunnelProvider: (v) => v || null,
      normalizeTunnelMode: (v) => v || null,
      normalizeOptionalPath: (v) => v || null,
      normalizeManagedRemoteTunnelHostname: (v) => v || null,
      normalizeTunnelBootstrapTtlMs: (v) => v || 1800000,
      normalizeTunnelSessionTtlMs: (v) => v || 28800000,
      isSupportedTunnelMode: () => true,
      upsertManagedRemoteTunnelToken: async () => {},
      resolveManagedRemoteTunnelToken: async () => null,
      TUNNEL_MODE_QUICK: 'quick',
      TUNNEL_MODE_MANAGED_LOCAL: 'managed-local',
      TUNNEL_MODE_MANAGED_REMOTE: 'managed-remote',
      TUNNEL_PROVIDER_CLOUDFLARE: 'cloudflare',
      TunnelServiceError: class extends Error {
        constructor(msg, code) {
          super(msg);
          this.code = code;
        }
      },
    });

    const mockApp = {
      get: () => {},
      post: () => {},
      put: () => {},
    };
    const ctx = runtime.initialize(mockApp, 3000);
    expect(ctx.tunnelService).toBeDefined();
    expect(typeof ctx.getActivePort).toBe('function');
    expect(ctx.getActivePort()).toBe(3000);

    const portBoundEvents = events.filter(
      (e) => e.type === 'server:port-bound',
    );
    expect(portBoundEvents.length).toBe(1);
    expect(portBoundEvents[0].payload).toEqual({ port: 3000 });
  });
});
