/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NetworkRuntimeDeps, OpenCodeNetworkRuntime } from "./types.js";

export const createOpenCodeNetworkRuntime = (deps: NetworkRuntimeDeps): OpenCodeNetworkRuntime => {
  const { state, getOpenCodeAuthHeaders } = deps;

  const normalizeApiPrefix = (prefix: string): string => {
    if (!prefix) return "";
    if (prefix.includes("://")) {
      try {
        const parsed = new URL(prefix);
        return normalizeApiPrefix(parsed.pathname);
      } catch {
        return "";
      }
    }
    const trimmed = prefix.trim();
    if (!trimmed || trimmed === "/") return "";
    const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
  };

  const waitForReady = async (url: string, timeoutMs = 10000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${url.replace(/\/+$/, "")}/global/health`, {
          method: "GET",
          headers: { Accept: "application/json", ...getOpenCodeAuthHeaders() },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          const body = (await response.json().catch(() => null)) as { healthy?: boolean } | null;
          if (body?.healthy === true) return true;
        }
      } catch { /* empty */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  };

  const setDetectedOpenCodeApiPrefix = (): void => {
    (state as any).openCodeApiPrefix = "";
    (state as any).openCodeApiPrefixDetected = true;
    if ((state as any).openCodeApiDetectionTimer) {
      clearTimeout((state as any).openCodeApiDetectionTimer);
      (state as any).openCodeApiDetectionTimer = null;
    }
  };

  const buildOpenCodeUrl = (path: string, prefixOverride?: string): string => {
    if (!(state as any).openCodePort) throw new Error("OpenCode port is not available");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const prefix = normalizeApiPrefix(prefixOverride !== undefined ? prefixOverride : "");
    const fullPath = `${prefix}${normalizedPath}`;
    const base = (state as any).openCodeBaseUrl ?? `http://localhost:${(state as any).openCodePort}`;
    return `${base}${fullPath}`;
  };

  const detectOpenCodeApiPrefix = (): boolean => {
    (state as any).openCodeApiPrefixDetected = true;
    (state as any).openCodeApiPrefix = "";
    return true;
  };

  const ensureOpenCodeApiPrefix = (): boolean => detectOpenCodeApiPrefix();

  const scheduleOpenCodeApiDetection = (): void => {};

  return {
    waitForReady,
    normalizeApiPrefix,
    setDetectedOpenCodeApiPrefix,
    buildOpenCodeUrl,
    ensureOpenCodeApiPrefix,
    scheduleOpenCodeApiDetection,
  };
};