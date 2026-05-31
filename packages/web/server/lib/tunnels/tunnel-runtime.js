import { createTunnelAuth } from '../opencode/auth/tunnel-auth.js';
import { createTunnelWiringRuntime } from '../opencode/network/tunnel-wiring-runtime.js';
import { createTunnelProviderRegistry } from './registry.js';
import { createCloudflareTunnelProvider } from './providers/cloudflare.js';
import { EVENTS } from '../core/events.js';

export const createTunnelRuntime = (deps) => {
  const {
    eventBus,
    crypto,
    URL,
    readSettingsFromDiskMigrated,
    readManagedRemoteTunnelConfigFromDisk,
    normalizeTunnelProvider,
    normalizeTunnelMode,
    normalizeOptionalPath,
    normalizeManagedRemoteTunnelHostname,
    normalizeTunnelBootstrapTtlMs,
    normalizeTunnelSessionTtlMs,
    isSupportedTunnelMode,
    upsertManagedRemoteTunnelToken,
    resolveManagedRemoteTunnelToken,
    TUNNEL_MODE_QUICK,
    TUNNEL_MODE_MANAGED_LOCAL,
    TUNNEL_MODE_MANAGED_REMOTE,
    TUNNEL_PROVIDER_CLOUDFLARE,
    TunnelServiceError,
  } = deps;

  const tunnelProviderRegistry = createTunnelProviderRegistry([
    createCloudflareTunnelProvider(),
  ]);
  tunnelProviderRegistry.seal();

  const tunnelAuthController = createTunnelAuth();
  let activeTunnelController = null;
  let runtimeManagedRemoteTunnelHostname = '';
  let runtimeManagedRemoteTunnelToken = '';
  let tunnelWiringRuntime = null;

  const initialize = (app, port) => {
    tunnelWiringRuntime = createTunnelWiringRuntime({
      crypto,
      URL,
      tunnelProviderRegistry,
      tunnelAuthController,
      readSettingsFromDiskMigrated,
      readManagedRemoteTunnelConfigFromDisk,
      normalizeTunnelProvider,
      normalizeTunnelMode,
      normalizeOptionalPath,
      normalizeManagedRemoteTunnelHostname,
      normalizeTunnelBootstrapTtlMs,
      normalizeTunnelSessionTtlMs,
      isSupportedTunnelMode,
      upsertManagedRemoteTunnelToken,
      resolveManagedRemoteTunnelToken,
      TUNNEL_MODE_QUICK,
      TUNNEL_MODE_MANAGED_LOCAL,
      TUNNEL_MODE_MANAGED_REMOTE,
      TUNNEL_PROVIDER_CLOUDFLARE,
      TunnelServiceError,
      getActiveTunnelController: () => activeTunnelController,
      setActiveTunnelController: (v) => {
        activeTunnelController = v;
      },
      getRuntimeManagedRemoteTunnelHostname: () => runtimeManagedRemoteTunnelHostname,
      setRuntimeManagedRemoteTunnelHostname: (v) => {
        runtimeManagedRemoteTunnelHostname = v;
      },
      getRuntimeManagedRemoteTunnelToken: () => runtimeManagedRemoteTunnelToken,
      setRuntimeManagedRemoteTunnelToken: (v) => {
        runtimeManagedRemoteTunnelToken = v;
      },
    });

    const result = tunnelWiringRuntime.initialize(app, port);

    if (result.tunnelService) {
      const origStart = result.tunnelService.start;
      result.tunnelService.start = async (...args) => {
        const tunnelResult = await origStart.apply(result.tunnelService, args);
        const url = result.tunnelService.getPublicUrl();
        if (url) {
          const provider = result.tunnelService.resolveActiveProvider
            ? result.tunnelService.resolveActiveProvider()
            : TUNNEL_PROVIDER_CLOUDFLARE;
          eventBus.emit(EVENTS.TUNNEL_READY, { url, provider });
        }
        return tunnelResult;
      };
    }

    eventBus.emit(EVENTS.SERVER_PORT_BOUND, { port });
    return result;
  };

  return {
    initialize,
    getActiveTunnelController: () => activeTunnelController,
    getTunnelAuthController: () => tunnelAuthController,
  };
};
