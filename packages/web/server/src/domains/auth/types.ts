export interface ProviderAuthRuntime {
  readAuthFile(): Record<string, unknown>;
  writeAuthFile(auth: Record<string, unknown>): void;
  removeProviderAuth(providerId: string): boolean;
  getProviderAuth(providerId: string): unknown | null;
  listProviderAuths(): string[];
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
  opencodeAuth: OpenCodeAuthState;
}