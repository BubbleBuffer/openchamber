/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ServerUtilsRuntimeDeps {
  fs: typeof import("fs");
  os: typeof import("os");
  path: typeof import("path");
  process: typeof import("process");
  openCodeReadyGraceMs: number;
  longRequestTimeoutMs: number;
  openCodeRuntime: any;
  getUiNotificationClients: () => Set<any>;
  getLoginShellPath: () => string | null;
}

export interface ServerUtilsRuntime {
  setOpenCodePort(port: number): void;
  waitForOpenCodePort(timeoutMs?: number): Promise<number>;
  buildAugmentedPath(): string;
  buildManagedOpenCodePath(): string;
  parseSseDataPayload(block: string): object | null;
  fetchAgentsSnapshot(): Promise<unknown[]>;
  fetchProvidersSnapshot(): Promise<unknown[]>;
  fetchModelsSnapshot(): Promise<unknown[]>;
  setupProxy(app: any): void;
}

export interface ProxyDeps {
  fs: typeof import("fs");
  os: typeof import("os");
  path: typeof import("path");
  OPEN_CODE_READY_GRACE_MS: number;
  openCodeRuntime: any;
}