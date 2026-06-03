import { createTunnelProviderRegistry } from "./registry.js";
import { createCloudflareTunnelProvider } from "./providers/cloudflare.js";
import { createTunnelService } from "./tunnel-service.js";
import { createTunnelRoutesRuntime } from "./routes.js";
import { createTunnelAuth } from "../auth/tunnel-auth.js";
import { printTunnelWarning } from "../../../lib/cloudflare-tunnel.js";
import type { TunnelController } from "./types.js";

export interface TunnelRuntimeDeps {
  eventBus: { emit(event: string, payload: unknown): void };
  crypto: typeof import("crypto");
  URL: typeof URL;
  readSettingsFromDiskMigrated(): Promise<Record<string, unknown>>;
  readManagedRemoteTunnelConfigFromDisk(): Promise<import("./types.js").ManagedTunnelConfig>;
  normalizeTunnelProvider(value: unknown): string;
  normalizeTunnelMode(value: unknown): string;
  normalizeOptionalPath(value: unknown): string | null | undefined;
  normalizeManagedRemoteTunnelHostname(value: unknown): string | undefined;
  normalizeTunnelBootstrapTtlMs(value: number | null): number | null;
  normalizeTunnelSessionTtlMs(value: number): number;
  isSupportedTunnelMode(mode: string): boolean;
  upsertManagedRemoteTunnelToken(params: {
    id: string;
    name: string;
    hostname: string;
    token: string;
  }): Promise<void>;
  resolveManagedRemoteTunnelToken(params: {
    presetId?: string;
    hostname?: string;
  }): Promise<string>;
  TUNNEL_MODE_QUICK: string;
  TUNNEL_MODE_MANAGED_LOCAL: string;
  TUNNEL_MODE_MANAGED_REMOTE: string;
  TUNNEL_PROVIDER_CLOUDFLARE: string;
  TunnelServiceError: typeof import("./types.js").TunnelServiceError;
}

export const createTunnelRuntime = (deps: TunnelRuntimeDeps) => {
  const {
    eventBus,
    crypto,
    URL: URLClass,
    readSettingsFromDiskMigrated,
    readManagedRemoteTunnelConfigFromDisk,
    normalizeTunnelProvider,
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

  const tunnelProviderRegistry = createTunnelProviderRegistry([createCloudflareTunnelProvider()]);
  tunnelProviderRegistry.seal();

  const tunnelAuthController = createTunnelAuth();
  let activeTunnelController: TunnelController | null = null;
  let runtimeManagedRemoteTunnelHostname = "";
  let runtimeManagedRemoteTunnelToken = "";

  const initialize = (app: unknown, port: number) => {
    let activePort = port;

    const tunnelService = createTunnelService({
      registry: tunnelProviderRegistry,
      getController: () => activeTunnelController,
      setController: (v: TunnelController | null) => {
        activeTunnelController = v;
      },
      getActivePort: () => activePort,
      onQuickTunnelWarning: () => {
        printTunnelWarning();
      },
    });

    const tunnelRoutesRuntime = createTunnelRoutesRuntime({
      crypto,
      URL: URLClass,
      tunnelService,
      tunnelProviderRegistry,
      tunnelAuthController,
      readSettingsFromDiskMigrated,
      readManagedRemoteTunnelConfigFromDisk,
      normalizeTunnelProvider,
      normalizeTunnelMode: deps.normalizeTunnelMode,
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
      getActivePort: () => activePort,
      getRuntimeManagedRemoteTunnelHostname: () => runtimeManagedRemoteTunnelHostname,
      setRuntimeManagedRemoteTunnelHostname: (v: string) => {
        runtimeManagedRemoteTunnelHostname = v;
      },
      getRuntimeManagedRemoteTunnelToken: () => runtimeManagedRemoteTunnelToken,
      setRuntimeManagedRemoteTunnelToken: (v: string) => {
        runtimeManagedRemoteTunnelToken = v;
      },
      getActiveTunnelController: () => activeTunnelController,
      setActiveTunnelController: (v: unknown) => {
        activeTunnelController = v as TunnelController | null;
      },
    });

    tunnelRoutesRuntime.registerRoutes(app as Parameters<typeof tunnelRoutesRuntime.registerRoutes>[0]);

    const origStart = tunnelService.start.bind(tunnelService);
    tunnelService.start = async (...args: Parameters<typeof tunnelService.start>) => {
      const tunnelResult = await origStart(...args);
      const url = tunnelService.getPublicUrl();
      if (url) {
        const provider = tunnelService.resolveActiveProvider
          ? tunnelService.resolveActiveProvider()
          : TUNNEL_PROVIDER_CLOUDFLARE;
        eventBus.emit("tunnel-ready", { url, provider });
      }
      return tunnelResult;
    };

    eventBus.emit("server-port-bound", { port });
    return {
      tunnelService,
      startTunnelWithNormalizedRequest: (...args: Parameters<typeof tunnelRoutesRuntime.startTunnelWithNormalizedRequest>) =>
        tunnelRoutesRuntime.startTunnelWithNormalizedRequest(...args),
      getActivePort: () => activePort,
      setActivePort: (value: number) => {
        activePort = value;
      },
    };
  };

  return {
    initialize,
    getActiveTunnelController: () => activeTunnelController,
    getTunnelAuthController: () => tunnelAuthController,
  };
};
