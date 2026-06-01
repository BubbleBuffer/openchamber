export interface ProviderAuthRuntime {
  readAuthFile(): Record<string, unknown>;
  writeAuthFile(auth: Record<string, unknown>): void;
  removeProviderAuth(providerId: string): boolean;
  getProviderAuth(providerId: string): unknown | null;
  listProviderAuths(): string[];
}

export interface TunnelAuthDeps {
  createBoundedMap: (opts: { maxSize: number; ttlMs: number }) => Map<unknown, unknown>;
}

export interface TunnelAuthController {
  classifyRequestScope(req: unknown): string;
  setActiveTunnel(tunnel: unknown): void;
  clearActiveTunnel(): void;
  revokeTunnelArtifacts(): void;
  issueBootstrapToken(): string;
  getBootstrapStatus(): unknown;
  requireTunnelSession(req: unknown, res: unknown, next: () => void): void;
  getTunnelSessionFromRequest(req: unknown): unknown;
  exchangeBootstrapToken(token: string, options: { sessionTtlMs: number; secure: boolean }): string | null;
  listTunnelSessions(): unknown[];
  clearTunnelSessionCookie(res: unknown): void;
  getActiveTunnelId(): string | null;
  getActiveTunnelHost(): string | null;
  getActiveTunnelMode(): string | null;
  dispose(): void;
}

export interface OpenCodeAuthStateDeps {
  crypto: typeof import("crypto");
  process: typeof import("process");
  getAuthPassword(): string | null;
  setAuthPassword(value: string | null): void;
  getAuthSource(): string | null;
  setAuthSource(value: string | null): void;
  getUserProvidedPassword(): string | null;
  syncToHmrState(): void;
}

export interface OpenCodeAuthState {
  getOpenCodeAuthHeaders(): Record<string, string>;
  isOpenCodeConnectionSecure(): boolean;
  ensureLocalOpenCodeServerPassword(opts?: { rotateManaged?: boolean }): Promise<string | null>;
}

export interface AuthDomainDeps {
  crypto: typeof import("crypto");
  process: typeof import("process");
  getAuthPassword(): string | null;
  setAuthPassword(value: string | null): void;
  getAuthSource(): string | null;
  setAuthSource(value: string | null): void;
  getUserProvidedPassword(): string | null;
  syncToHmrState(): void;
}

export interface AuthDomain {
  providerAuth: ProviderAuthRuntime;
  tunnelAuth: TunnelAuthController;
  opencodeAuth: OpenCodeAuthState;
}