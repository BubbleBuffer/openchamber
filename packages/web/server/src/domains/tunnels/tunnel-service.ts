import {
  TUNNEL_MODE_QUICK,
  TUNNEL_PROVIDER_CLOUDFLARE,
  TunnelServiceError,
  normalizeTunnelStartRequest,
  validateTunnelStartRequest,
} from "./types.js";

import type {
  TunnelProviderRegistry,
} from "./registry.js";

import type { TunnelController, TunnelStartRequestRaw, TunnelStartRequest } from "./types.js";

export interface TunnelServiceDeps {
  registry: TunnelProviderRegistry;
  getController(): TunnelController | null;
  setController(controller: TunnelController | null): void;
  getActivePort?(): number | null;
  onQuickTunnelWarning?(): void;
}

export interface TunnelStartResult {
  publicUrl: string;
  request: TunnelStartRequest;
  activeMode: string;
  provider: string;
  providerMetadata: Record<string, unknown> | null;
}

export interface TunnelService {
  start(rawRequest: TunnelStartRequestRaw, options?: Record<string, unknown>): Promise<TunnelStartResult>;
  stop(): boolean;
  checkAvailability(providerId: string): Promise<{ available: boolean; version?: string; message?: string }>;
  getPublicUrl(): string | null;
  getProviderMetadata(): Record<string, unknown> | null;
  resolveActiveMode(): string | null;
  resolveActiveProvider(): string | null;
}

export function createTunnelService({
  registry,
  getController,
  setController,
  getActivePort,
  onQuickTunnelWarning,
}: TunnelServiceDeps): TunnelService {
  if (!registry) {
    throw new Error("Tunnel service requires a provider registry");
  }

  const resolveActiveMode = (): string | null => {
    const controller = getController();
    if (!controller || typeof controller.mode !== "string") {
      return null;
    }
    return controller.mode;
  };

  const resolveActiveProvider = (): string | null => {
    const controller = getController();
    if (!controller || typeof controller.provider !== "string") {
      return null;
    }
    return controller.provider;
  };

  const stop = (): boolean => {
    const controller = getController();
    if (!controller) {
      return false;
    }

    const providerId = typeof controller.provider === "string" ? controller.provider : "";
    const provider = providerId ? registry.get(providerId) : null;
    if (provider?.stop) {
      provider.stop(controller);
    } else {
      controller.stop?.();
    }
    setController(null);
    return true;
  };

  const checkAvailability = async (providerId: string): Promise<{ available: boolean; version?: string; message?: string }> => {
    const provider = registry.get(providerId);
    if (!provider) {
      throw new TunnelServiceError("provider_unsupported", `Unsupported tunnel provider: ${providerId}`);
    }
    const result = await provider.checkAvailability();
    return result;
  };

  let startLock = Promise.resolve();

  const start = async (
    rawRequest: TunnelStartRequestRaw,
    options: Record<string, unknown> = {},
  ): Promise<TunnelStartResult> => {
    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const previousLock = startLock;
    startLock = lockPromise;

    await previousLock;

    try {
      const request = normalizeTunnelStartRequest(rawRequest);
      const provider = registry.get(request.provider);

      if (!provider) {
        throw new TunnelServiceError("provider_unsupported", `Unsupported tunnel provider: ${request.provider}`);
      }

      validateTunnelStartRequest(request, provider.capabilities);

      let publicUrl = provider.resolvePublicUrl(getController());
      const activeMode = resolveActiveMode();

      if (publicUrl && activeMode !== request.mode) {
        stop();
        publicUrl = null;
      }

      if (!publicUrl) {
        const availability = await provider.checkAvailability();
        if (!availability?.available) {
          const missingDependencyMessage =
            typeof availability?.message === "string" && availability.message.trim().length > 0
              ? availability.message
              : request.provider === TUNNEL_PROVIDER_CLOUDFLARE
                ? "cloudflared is not installed. Install it with: brew install cloudflared"
                : `Required dependency for provider '${request.provider}' is missing`;
          throw new TunnelServiceError("missing_dependency", missingDependencyMessage);
        }

        const activePort = getActivePort && Number.isFinite(getActivePort()) ? getActivePort() : null;
        const originUrl = activePort !== null ? `http://127.0.0.1:${activePort}` : undefined;

        const controller = await provider.start(request, {
          activePort,
          originUrl,
          ...options,
        });
        controller.provider = request.provider;
        setController(controller);

        publicUrl = provider.resolvePublicUrl(controller);
        if (!publicUrl) {
          stop();
          throw new TunnelServiceError("startup_failed", "Tunnel started but no public URL was assigned");
        }

        if (request.mode === TUNNEL_MODE_QUICK) {
          onQuickTunnelWarning?.();
        }
      }

      return {
        publicUrl,
        request,
        activeMode: request.mode,
        provider: request.provider,
        providerMetadata: provider.getMetadata?.(getController()) ?? null,
      };
    } finally {
      releaseLock();
    }
  };

  const getPublicUrl = (): string | null => {
    const controller = getController();
    if (!controller) {
      return null;
    }
    const provider = registry.get(controller.provider ?? "");
    if (!provider) {
      return controller.getPublicUrl?.() ?? null;
    }
    return provider.resolvePublicUrl(controller);
  };

  const getProviderMetadata = (): Record<string, unknown> | null => {
    const controller = getController();
    if (!controller) {
      return null;
    }
    const provider = registry.get(controller.provider ?? "");
    return provider?.getMetadata?.(controller) ?? null;
  };

  return {
    start,
    stop,
    checkAvailability,
    getPublicUrl,
    getProviderMetadata,
    resolveActiveMode,
    resolveActiveProvider,
  };
}
