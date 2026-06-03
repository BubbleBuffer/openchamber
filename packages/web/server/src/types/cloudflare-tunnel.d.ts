declare module "*/lib/cloudflare-tunnel.js" {
  export function checkCloudflareApiReachability(): Promise<{ reachable: boolean; status?: number; error?: string }>;
  export function checkCloudflaredAvailable(): Promise<{
    available: boolean;
    version?: string;
    path?: string;
    message?: string;
  }>;
  export function inspectManagedLocalCloudflareConfig(opts: {
    configPath?: string;
    hostname?: string;
  }): {
    ok: boolean;
    effectiveConfigPath?: string;
    resolvedHostname?: string;
    error?: string;
  };
  export function normalizeCloudflareTunnelHostname(value: unknown): string | undefined;
  export function startCloudflareManagedLocalTunnel(opts: {
    configPath?: string;
    hostname?: string;
  }): Promise<import("../../domains/tunnels/types.js").TunnelController>;
  export function startCloudflareManagedRemoteTunnel(opts: {
    token?: string;
    hostname?: string;
    tokenFilePath?: string;
  }): Promise<import("../../domains/tunnels/types.js").TunnelController>;
  export function startCloudflareQuickTunnel(opts: {
    originUrl?: string;
    port?: number;
  }): Promise<import("../../domains/tunnels/types.js").TunnelController>;
  export function startCloudflareTunnel(opts: {
    originUrl?: string;
    port?: number;
  }): Promise<import("../../domains/tunnels/types.js").TunnelController>;
  export function printTunnelWarning(): void;
}
