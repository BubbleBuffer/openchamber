import os from "os";
import path from "path";

export const TUNNEL_PROVIDER_CLOUDFLARE = "cloudflare";

export const TUNNEL_MODE_QUICK = "quick";
export const TUNNEL_MODE_MANAGED_REMOTE = "managed-remote";
export const TUNNEL_MODE_MANAGED_LOCAL = "managed-local";

export const TUNNEL_INTENT_EPHEMERAL_PUBLIC = "ephemeral-public";
export const TUNNEL_INTENT_PERSISTENT_PUBLIC = "persistent-public";
export const TUNNEL_INTENT_PRIVATE_NETWORK = "private-network";

const SUPPORTED_TUNNEL_INTENTS = new Set([
  TUNNEL_INTENT_EPHEMERAL_PUBLIC,
  TUNNEL_INTENT_PERSISTENT_PUBLIC,
  TUNNEL_INTENT_PRIVATE_NETWORK,
]);

const SUPPORTED_TUNNEL_MODES = new Set([
  TUNNEL_MODE_QUICK,
  TUNNEL_MODE_MANAGED_REMOTE,
  TUNNEL_MODE_MANAGED_LOCAL,
]);

export interface TunnelStartRequestRaw {
  provider?: string;
  mode?: string;
  intent?: string;
  configPath?: string | null;
  token?: string;
  hostname?: string;
}

export interface TunnelStartRequest {
  provider: string;
  mode: string;
  intent: string | undefined;
  configPath: string | null | undefined;
  token: string;
  hostname: string;
}

export interface TunnelProviderCapabilities {
  provider: string;
  defaults: {
    mode: string;
    optionDefaults: Record<string, unknown>;
  };
  modes: TunnelModeDescriptor[];
}

export interface TunnelModeDescriptor {
  key: string;
  label: string;
  intent: string;
  requires: string[];
  supports: string[];
  stability: string;
}

export interface TunnelProvider {
  id: string;
  capabilities: TunnelProviderCapabilities;
  checkAvailability(): Promise<{ available: boolean; version?: string; path?: string; message?: string }>;
  diagnose?(request: Record<string, unknown>): Promise<{
    providerChecks: CheckResult[];
    modes: ModeResult[];
  }>;
  start(request: TunnelStartRequest, context: { activePort?: number | null; originUrl?: string; [key: string]: unknown }): Promise<TunnelController>;
  stop(controller: TunnelController): void;
  resolvePublicUrl(controller: TunnelController | null): string | null;
  getMetadata?(controller: TunnelController | null): Record<string, unknown> | null;
}

export interface TunnelController {
  provider?: string;
  mode?: string;
  stop?(): void;
  getPublicUrl?(): string;
  getEffectiveConfigPath?(): string;
  getResolvedHostname?(): string;
}

export interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface ModeResult {
  mode: string;
  checks: CheckResult[];
  summary: { ready: boolean; failures: number; warnings: number };
  ready: boolean;
  blockers: string[];
}

export interface ManagedTunnelEntry {
  id: string;
  name: string;
  hostname: string;
  token: string;
  updatedAt: number;
}

export interface ManagedTunnelConfig {
  version: number;
  tunnels: ManagedTunnelEntry[];
}

export class TunnelServiceError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "TunnelServiceError";
    this.code = code;
    this.details = details;
  }
}

const SUPPORTED_TUNNEL_PROVIDERS = new Set([TUNNEL_PROVIDER_CLOUDFLARE]);

export function normalizeTunnelProvider(value: unknown): string {
  if (typeof value !== "string") {
    return TUNNEL_PROVIDER_CLOUDFLARE;
  }
  const provider = value.trim().toLowerCase();
  if (!provider || !SUPPORTED_TUNNEL_PROVIDERS.has(provider)) {
    return TUNNEL_PROVIDER_CLOUDFLARE;
  }
  return provider;
}

export function normalizeTunnelMode(value: unknown): string {
  if (typeof value !== "string") {
    return TUNNEL_MODE_QUICK;
  }
  const mode = value.trim().toLowerCase();
  if (!mode) {
    return TUNNEL_MODE_QUICK;
  }
  if (mode === TUNNEL_MODE_QUICK) {
    return TUNNEL_MODE_QUICK;
  }
  if (mode === TUNNEL_MODE_MANAGED_REMOTE) {
    return TUNNEL_MODE_MANAGED_REMOTE;
  }
  if (mode === TUNNEL_MODE_MANAGED_LOCAL) {
    return TUNNEL_MODE_MANAGED_LOCAL;
  }
  return TUNNEL_MODE_QUICK;
}

export function normalizeTunnelIntent(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const intent = value.trim().toLowerCase();
  if (!intent || !SUPPORTED_TUNNEL_INTENTS.has(intent)) {
    return undefined;
  }
  return intent;
}

function modeIntentFallback(mode: string): string | undefined {
  if (mode === TUNNEL_MODE_QUICK) {
    return TUNNEL_INTENT_EPHEMERAL_PUBLIC;
  }
  if (mode === TUNNEL_MODE_MANAGED_REMOTE || mode === TUNNEL_MODE_MANAGED_LOCAL) {
    return TUNNEL_INTENT_PERSISTENT_PUBLIC;
  }
  return undefined;
}

function normalizeTunnelModeForRequest(value: unknown): string {
  if (typeof value === "string") {
    const mode = value.trim().toLowerCase();
    if (mode === TUNNEL_MODE_QUICK || mode === TUNNEL_MODE_MANAGED_REMOTE || mode === TUNNEL_MODE_MANAGED_LOCAL) {
      return mode;
    }
  }
  return TUNNEL_MODE_QUICK;
}

export function normalizeOptionalPath(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  let resolved: string;
  if (trimmed === "~") {
    resolved = os.homedir();
  } else if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    resolved = path.join(os.homedir(), trimmed.slice(2));
  } else {
    resolved = path.resolve(trimmed);
  }
  const home = os.homedir();
  if (resolved !== home && !resolved.startsWith(home + path.sep)) {
    throw new TunnelServiceError(
      "validation_error",
      `Config path must be within the home directory (${home}). Got: ${resolved}`,
    );
  }
  return resolved;
}

export function isSupportedTunnelMode(mode: string): boolean {
  return SUPPORTED_TUNNEL_MODES.has(mode);
}

export function normalizeTunnelStartRequest(
  input: TunnelStartRequestRaw = {},
  defaults: Partial<TunnelStartRequestRaw> = {},
): TunnelStartRequest {
  const provider = normalizeTunnelProvider(input.provider ?? defaults.provider);
  const mode = normalizeTunnelModeForRequest(input.mode ?? defaults.mode);
  const explicitIntent = normalizeTunnelIntent(input.intent ?? defaults.intent);
  const intent = explicitIntent ?? modeIntentFallback(mode);
  const configPathValue = Object.prototype.hasOwnProperty.call(input, "configPath")
    ? input.configPath
    : defaults.configPath;
  const configPath = normalizeOptionalPath(configPathValue);

  const token =
    typeof (input.token ?? defaults.token) === "string" ? (input.token ?? (defaults.token ?? "")).trim() : "";

  const hostname =
    typeof (input.hostname ?? defaults.hostname) === "string"
      ? (input.hostname ?? (defaults.hostname ?? "")).trim().toLowerCase()
      : "";

  return {
    provider,
    mode,
    intent,
    configPath,
    token,
    hostname,
  };
}

export function validateTunnelStartRequest(request: TunnelStartRequest, capabilities: TunnelProviderCapabilities): void {
  if (!request || typeof request !== "object") {
    throw new TunnelServiceError("validation_error", "Tunnel start request must be an object");
  }

  if (!request.provider) {
    throw new TunnelServiceError("validation_error", "Tunnel provider is required");
  }

  if (!isSupportedTunnelMode(request.mode)) {
    throw new TunnelServiceError("mode_unsupported", `Unsupported tunnel mode: ${request.mode}`);
  }

  if (!capabilities || capabilities.provider !== request.provider) {
    throw new TunnelServiceError("provider_unsupported", `Unsupported tunnel provider: ${request.provider}`);
  }

  if (!Array.isArray(capabilities.modes)) {
    throw new TunnelServiceError("mode_unsupported", `Provider '${request.provider}' does not declare tunnel modes`);
  }

  const modeDescriptor = capabilities.modes.find((entry) => entry?.key === request.mode);
  if (!modeDescriptor) {
    throw new TunnelServiceError("mode_unsupported", `Provider '${request.provider}' does not support mode '${request.mode}'`);
  }

  if (typeof request.intent === "string" && request.intent.length > 0) {
    if (!SUPPORTED_TUNNEL_INTENTS.has(request.intent)) {
      throw new TunnelServiceError("validation_error", `Unsupported tunnel intent: ${request.intent}`);
    }
    if (modeDescriptor.intent !== request.intent) {
      throw new TunnelServiceError(
        "validation_error",
        `Tunnel intent '${request.intent}' does not match mode '${request.mode}' (expected '${modeDescriptor.intent}')`,
      );
    }
  }

  const requiredFields = Array.isArray(modeDescriptor.requires) ? modeDescriptor.requires : [];

  if (requiredFields.includes("token")) {
    if (!request.token) {
      throw new TunnelServiceError("validation_error", "Managed remote tunnel token is required");
    }
  }

  if (requiredFields.includes("hostname")) {
    if (!request.hostname) {
      throw new TunnelServiceError("validation_error", "Managed remote tunnel hostname is required");
    }
  }

  if (requiredFields.includes("configPath")) {
    if (request.configPath === undefined || request.configPath === null || request.configPath === "") {
      throw new TunnelServiceError("validation_error", `Mode '${request.mode}' requires a configPath`);
    }
  }
}
