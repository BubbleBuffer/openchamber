# Quota Providers TypeScript Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 24 JS files under `lib/quota/` (~3,500 lines) to TypeScript under `src/domains/quota/`, remove the `require()` bridge in `feature-routes-runtime.ts`, delete old JS, and preserve identical runtime behavior.

**Architecture:** Free-function module pattern (matching `git`/`github` domains). Shared types in `types.ts`, utilities in `auth-utils.ts`, `formatters.ts`, `transformers.ts`. 14 provider modules under `providers/` plus a typed registry. `readAuthFile` imports from the already-ported `src/domains/auth/provider-auth.ts`. `readConfigLayers` for `zhipuai.ts` uses a `require()` bridge since its JS source hasn't been ported yet. Fix the duplicate `zhipuai-coding-plan` registry-key bug.

**Tech Stack:** TypeScript (verbatimModuleSyntax, `.js` extensions), Node built-ins (`node:` prefix), no new dependencies.

---

### File structure (target)

```
src/domains/quota/
  types.ts                    NEW — all interfaces
  auth-utils.ts               NEW — readJsonFile, getAuthEntry, normalizeAuthEntry, ANTIGRAVITY_ACCOUNTS_PATHS
  formatters.ts               NEW — formatResetTime, toUsageWindow, buildResult, durationToLabel, etc.
  transformers.ts             NEW — asObject, toNumber, toTimestamp, resolveWindowSeconds, etc.
  providers/
    index.ts                  NEW — typed registry + listConfiguredQuotaProviders + fetchQuotaForProvider
    claude.ts                 NEW
    openai.ts                 NEW
    codex.ts                  NEW
    copilot.ts                NEW
    kimi.ts                   NEW
    nanogpt.ts                NEW
    openrouter.ts             NEW
    zai.ts                    NEW
    zhipuai-coding-plan.ts    NEW — TOKENS_LIMIT + TIME_LIMIT, registered as 'zhipuai-tokens'
    zhipuai.ts                NEW — readConfigLayers bridge, registered as 'zhipuai-coding-plan'
    minimax-coding-plan.ts    NEW
    minimax-cn-coding-plan.ts NEW
    ollama-cloud.ts           NEW
    google/
      index.ts                NEW — fetchGoogleQuota
      auth.ts                 NEW — resolveGoogleAuthSources
      api.ts                  NEW — refreshGoogleAccessToken, fetchGoogleQuotaBuckets, fetchGoogleModels
      transforms.ts           NEW — parseGoogleRefreshToken, transformQuotaBucket, transformModelData
  routes.ts                   MODIFY — tighten QuotaRoutesDeps types
  index.ts                    MODIFY — add new exports
```

### Registry key fix

The old JS registry has two entries for `'zhipuai-coding-plan'` (lines 50-55 and 104-109), the second silently overwrites the first. In the port:
- `zhipuai-coding-plan.ts` (TOKENS_LIMIT + TIME_LIMIT) registers as `'zhipuai-tokens'`
- `zhipuai.ts` (readConfigLayers bridge, only TOKENS_LIMIT) registers as `'zhipuai-coding-plan'`
This gives each module its own key. The UI and API surface must support both keys.

---

### Task 1: Create `types.ts`

**Files:**
- Create: `packages/web/server/src/domains/quota/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
export interface UsageWindow {
  usedPercent: number | null;
  remainingPercent: number | null;
  windowSeconds: number | null;
  resetAfterSeconds: number | null;
  resetAt: number | null;
  resetAtFormatted: string | null;
  resetAfterFormatted: string | null;
  valueLabel?: string | null;
}

export interface ProviderUsage {
  windows: Record<string, UsageWindow>;
  models?: Record<string, { windows: Record<string, UsageWindow> }>;
}

export interface QuotaProviderResult {
  providerId: string;
  providerName: string;
  ok: boolean;
  configured: boolean;
  usage: ProviderUsage | null;
  error?: string | null;
  fetchedAt: number;
}

export interface ConfiguredProviderEntry {
  providerId: string;
  providerName: string;
  isConfigured: () => boolean;
  fetchQuota: () => Promise<QuotaProviderResult>;
}

export interface QuotaProviderRegistry {
  listConfiguredQuotaProviders(): string[];
  fetchQuotaForProvider(providerId: string): Promise<QuotaProviderResult>;
}

export interface GoogleAuthSource {
  sourceId: string;
  sourceLabel: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  projectId?: string | null;
  expires?: number | null;
  email?: string;
}

export interface QuotaProviderModule {
  providerId: string;
  providerName: string;
  aliases: string[];
  isConfigured: () => boolean;
  fetchQuota: () => Promise<QuotaProviderResult>;
}
```

- [ ] **Step 2: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/quota/types.ts
git commit -m "feat(quota): add TypeScript types for quota domain"
```

---

### Task 2: Port utility files

**Files:**
- Create: `packages/web/server/src/domains/quota/auth-utils.ts`
- Create: `packages/web/server/src/domains/quota/formatters.ts`
- Create: `packages/web/server/src/domains/quota/transformers.ts`

- [ ] **Step 1: Write `auth-utils.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
const OPENCODE_DATA_DIR = path.join(os.homedir(), ".local", "share", "opencode");

export const ANTIGRAVITY_ACCOUNTS_PATHS = [
  path.join(OPENCODE_CONFIG_DIR, "antigravity-accounts.json"),
  path.join(OPENCODE_DATA_DIR, "antigravity-accounts.json"),
];

export function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    console.warn(`Failed to read JSON file: ${filePath}`, error);
    return null;
  }
}

export function getAuthEntry(auth: Record<string, unknown>, aliases: string[]): unknown | null {
  for (const alias of aliases) {
    if (auth[alias]) {
      return auth[alias];
    }
  }
  return null;
}

export function normalizeAuthEntry(entry: unknown): Record<string, unknown> | null {
  if (!entry) return null;
  if (typeof entry === "string") {
    return { token: entry };
  }
  if (typeof entry === "object") {
    return entry as Record<string, unknown>;
  }
  return null;
}
```

- [ ] **Step 2: Write `formatters.ts`**

```typescript
import type { UsageWindow, QuotaProviderResult } from "./types.js";

export function formatResetTime(timestamp: number): string | null {
  try {
    const resetDate = new Date(timestamp);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();

    if (isToday) {
      return resetDate.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return resetDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export function calculateResetAfterSeconds(resetAt: number | null): number | null {
  if (!resetAt) return null;
  const delta = Math.floor((resetAt - Date.now()) / 1000);
  return delta < 0 ? 0 : delta;
}

export function toUsageWindow({
  usedPercent,
  windowSeconds,
  resetAt,
  valueLabel,
}: {
  usedPercent: number | null;
  windowSeconds: number | null;
  resetAt: number | null;
  valueLabel?: string | null;
}): UsageWindow {
  const resetAfterSeconds = calculateResetAfterSeconds(resetAt);
  const resetFormatted = resetAt ? formatResetTime(resetAt) : null;
  const result: UsageWindow = {
    usedPercent,
    remainingPercent: usedPercent !== null ? Math.max(0, 100 - usedPercent) : null,
    windowSeconds: windowSeconds ?? null,
    resetAfterSeconds,
    resetAt,
    resetAtFormatted: resetFormatted,
    resetAfterFormatted: resetFormatted,
  };
  if (valueLabel) {
    result.valueLabel = valueLabel;
  }
  return result;
}

export function buildResult({
  providerId,
  providerName,
  ok,
  configured,
  usage,
  error,
}: {
  providerId: string;
  providerName: string;
  ok: boolean;
  configured: boolean;
  usage?: { windows: Record<string, UsageWindow>; models?: Record<string, unknown> } | null;
  error?: string | null;
}): QuotaProviderResult {
  const result: QuotaProviderResult = {
    providerId,
    providerName,
    ok,
    configured,
    usage: usage ?? null,
    fetchedAt: Date.now(),
  };
  if (error) {
    result.error = error;
  }
  return result;
}

export function durationToLabel(duration: unknown, unit: unknown): string {
  if (!duration || !unit) return "limit";
  if (unit === "TIME_UNIT_MINUTE") return `${duration}m`;
  if (unit === "TIME_UNIT_HOUR") return `${duration}h`;
  if (unit === "TIME_UNIT_DAY") return `${duration}d`;
  return "limit";
}

export function durationToSeconds(duration: unknown, unit: unknown): number | null {
  if (!duration || !unit) return null;
  if (unit === "TIME_UNIT_MINUTE") return (duration as number) * 60;
  if (unit === "TIME_UNIT_HOUR") return (duration as number) * 3600;
  if (unit === "TIME_UNIT_DAY") return (duration as number) * 86400;
  return null;
}

export function formatMoney(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}
```

- [ ] **Step 3: Write `transformers.ts`**

```typescript
export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number") {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function normalizeTimestamp(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

const ZAI_TOKEN_WINDOW_SECONDS: Record<number, number> = { 3: 3600 };

export function resolveWindowSeconds(limit: { unit?: number; number?: number } | undefined): number | null {
  if (!limit || !limit.number) return null;
  const unitSeconds = ZAI_TOKEN_WINDOW_SECONDS[limit.unit ?? -1];
  if (!unitSeconds) return null;
  return unitSeconds * limit.number;
}

export function resolveWindowLabel(windowSeconds: number | null): string {
  if (!windowSeconds) return "tokens";
  if (windowSeconds % 86400 === 0) {
    const days = windowSeconds / 86400;
    return days === 7 ? "weekly" : `${days}d`;
  }
  if (windowSeconds % 3600 === 0) {
    return `${windowSeconds / 3600}h`;
  }
  return `${windowSeconds}s`;
}
```

- [ ] **Step 4: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/quota/auth-utils.ts \
        packages/web/server/src/domains/quota/formatters.ts \
        packages/web/server/src/domains/quota/transformers.ts
git commit -m "feat(quota): port utility modules to TypeScript"
```

---

### Task 3: Port simple providers (claude, openai, codex)

**Files:**
- Create: `packages/web/server/src/domains/quota/providers/claude.ts`
- Create: `packages/web/server/src/domains/quota/providers/openai.ts`
- Create: `packages/web/server/src/domains/quota/providers/codex.ts`

- [ ] **Step 1: Write `providers/claude.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "claude";
export const providerName = "Claude";
export const aliases = ["anthropic", "claude"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = (entry?.access ?? entry?.token) as string | undefined;

  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const windows: Record<string, UsageWindow> = {};
    const fiveHour = payload?.five_hour as Record<string, unknown> | undefined;
    const sevenDay = payload?.seven_day as Record<string, unknown> | undefined;
    const sevenDaySonnet = payload?.seven_day_sonnet as Record<string, unknown> | undefined;
    const sevenDayOpus = payload?.seven_day_opus as Record<string, unknown> | undefined;

    if (fiveHour) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(fiveHour.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(fiveHour.resets_at),
      });
    }
    if (sevenDay) {
      windows["7d"] = toUsageWindow({
        usedPercent: toNumber(sevenDay.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDay.resets_at),
      });
    }
    if (sevenDaySonnet) {
      windows["7d-sonnet"] = toUsageWindow({
        usedPercent: toNumber(sevenDaySonnet.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDaySonnet.resets_at),
      });
    }
    if (sevenDayOpus) {
      windows["7d-opus"] = toUsageWindow({
        usedPercent: toNumber(sevenDayOpus.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDayOpus.resets_at),
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 2: Write `providers/openai.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";

export const providerId = "openai";
export const providerName = "OpenAI";
export const aliases = ["openai", "codex", "chatgpt"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = (entry?.access ?? entry?.token) as string | undefined;

  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const primary = (payload?.rate_limit as Record<string, unknown>)?.primary_window as Record<string, unknown> | undefined;
    const secondary = (payload?.rate_limit as Record<string, unknown>)?.secondary_window as Record<string, unknown> | undefined;

    const windows: Record<string, UsageWindow> = {};
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: (primary.used_percent as number) ?? null,
        windowSeconds: (primary.limit_window_seconds as number) ?? null,
        resetAt: primary.reset_at ? (primary.reset_at as number) * 1000 : null,
      });
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: (secondary.used_percent as number) ?? null,
        windowSeconds: (secondary.limit_window_seconds as number) ?? null,
        resetAt: secondary.reset_at ? (secondary.reset_at as number) * 1000 : null,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 3: Write `providers/codex.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";
import type { UsageWindow } from "../types.js";

export const providerId = "codex";
export const providerName = "Codex";
export const aliases = ["openai", "codex", "chatgpt"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = (entry?.access ?? entry?.token) as string | undefined;
  const accountId = entry?.accountId as string | undefined;

  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    if (accountId) {
      headers["ChatGPT-Account-Id"] = accountId;
    }
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: response.status === 401
          ? "Session expired \u2014 please re-authenticate with OpenAI"
          : `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const primary = (payload?.rate_limit as Record<string, unknown>)?.primary_window as Record<string, unknown> | undefined;
    const secondary = (payload?.rate_limit as Record<string, unknown>)?.secondary_window as Record<string, unknown> | undefined;
    const credits = payload?.credits as Record<string, unknown> | undefined;

    const windows: Record<string, UsageWindow> = {};
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(primary.used_percent),
        windowSeconds: toNumber(primary.limit_window_seconds),
        resetAt: toTimestamp(primary.reset_at),
      });
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: toNumber(secondary.used_percent),
        windowSeconds: toNumber(secondary.limit_window_seconds),
        resetAt: toTimestamp(secondary.reset_at),
      });
    }
    if (credits) {
      const balance = toNumber(credits.balance);
      const unlimited = Boolean(credits.unlimited);
      const label = unlimited
        ? "Unlimited"
        : balance !== null
          ? `$${formatMoney(balance)} remaining`
          : null;
      windows["credits"] = toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: label,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 4: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/claude.ts \
        packages/web/server/src/domains/quota/providers/openai.ts \
        packages/web/server/src/domains/quota/providers/codex.ts
git commit -m "feat(quota): port claude, openai, codex providers to TypeScript"
```

---

### Task 4: Port providers (copilot, kimi, nanogpt)

**Files:**
- Create: `packages/web/server/src/domains/quota/providers/copilot.ts`
- Create: `packages/web/server/src/domains/quota/providers/kimi.ts`
- Create: `packages/web/server/src/domains/quota/providers/nanogpt.ts`

- [ ] **Step 1: Write `providers/copilot.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

function buildCopilotWindows(payload: Record<string, unknown>): Record<string, UsageWindow> {
  const quota = (payload?.quota_snapshots ?? {}) as Record<string, Record<string, unknown>>;
  const resetAt = toTimestamp(payload?.quota_reset_date);
  const windows: Record<string, UsageWindow> = {};

  const addWindow = (label: string, snapshot: Record<string, unknown> | undefined) => {
    if (!snapshot) return;
    const entitlement = toNumber(snapshot.entitlement);
    const remaining = toNumber(snapshot.remaining);
    const usedPercent = entitlement && remaining !== null
      ? Math.max(0, 100 - (remaining / entitlement) * 100)
      : null;
    const valueLabel = entitlement !== null && remaining !== null
      ? `${remaining.toFixed(0)} / ${entitlement.toFixed(0)} left`
      : null;
    windows[label] = toUsageWindow({
      usedPercent,
      windowSeconds: null,
      resetAt,
      valueLabel,
    });
  };

  addWindow("chat", quota.chat);
  addWindow("completions", quota.completions);
  addWindow("premium", quota.premium_interactions);

  return windows;
}

export const providerId = "github-copilot";
export const providerName = "GitHub Copilot";
export const aliases = ["github-copilot", "copilot"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = (entry?.access ?? entry?.token) as string | undefined;

  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://api.github.com/copilot_internal/user", {
      method: "GET",
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/json",
        "Editor-Version": "vscode/1.96.2",
        "X-Github-Api-Version": "2025-04-01",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows: buildCopilotWindows(payload) },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

export const providerIdAddon = "github-copilot-addon";
export const providerNameAddon = "GitHub Copilot Add-on";

export const fetchQuotaAddon = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = (entry?.access ?? entry?.token) as string | undefined;

  if (!accessToken) {
    return buildResult({
      providerId: providerIdAddon,
      providerName: providerNameAddon,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://api.github.com/copilot_internal/user", {
      method: "GET",
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/json",
        "Editor-Version": "vscode/1.96.2",
        "X-Github-Api-Version": "2025-04-01",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId: providerIdAddon,
        providerName: providerNameAddon,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const windows = buildCopilotWindows(payload);
    const premium = windows.premium ? { premium: windows.premium } : windows;

    return buildResult({
      providerId: providerIdAddon,
      providerName: providerNameAddon,
      ok: true,
      configured: true,
      usage: { windows: premium },
    });
  } catch (error) {
    return buildResult({
      providerId: providerIdAddon,
      providerName: providerNameAddon,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 2: Write `providers/kimi.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow, durationToLabel, durationToSeconds } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "kimi-for-coding";
export const providerName = "Kimi for Coding";
export const aliases = ["kimi-for-coding", "kimi"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://api.kimi.com/coding/v1/usages", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const windows: Record<string, UsageWindow> = {};
    const usage = payload?.usage as Record<string, unknown> | undefined;

    if (usage) {
      const limit = toNumber(usage.limit);
      const remaining = toNumber(usage.remaining);
      const usedPercent = limit && remaining !== null
        ? Math.max(0, Math.min(100, 100 - (remaining / limit) * 100))
        : null;
      windows["weekly"] = toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt: toTimestamp(usage.resetTime),
      });
    }

    const limits = Array.isArray(payload?.limits) ? payload.limits as Record<string, unknown>[] : [];
    for (const limit of limits) {
      const windowSpec = limit?.window as Record<string, unknown> | undefined;
      const detail = limit?.detail as Record<string, unknown> | undefined;
      const rawLabel = durationToLabel(windowSpec?.duration, windowSpec?.timeUnit);
      const windowSeconds = durationToSeconds(windowSpec?.duration, windowSpec?.timeUnit);
      const label = windowSeconds === 5 * 60 * 60 ? `Rate Limit (${rawLabel})` : rawLabel;
      const total = toNumber(detail?.limit);
      const remaining = toNumber(detail?.remaining);
      const usedPercent = total && remaining !== null
        ? Math.max(0, Math.min(100, 100 - (remaining / total) * 100))
        : null;
      windows[label] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt: toTimestamp(detail?.resetTime),
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 3: Write `providers/nanogpt.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

const NANO_GPT_DAILY_WINDOW_SECONDS = 86400;

export const providerId = "nano-gpt";
export const providerName = "NanoGPT";
export const aliases = ["nano-gpt", "nanogpt", "nano_gpt"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://nano-gpt.com/api/subscription/v1/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const windows: Record<string, UsageWindow> = {};
    const daily = payload?.daily as Record<string, unknown> | undefined;
    const monthly = payload?.monthly as Record<string, unknown> | undefined;
    const period = payload?.period as Record<string, unknown> | undefined;
    const state = (payload?.state as string) ?? "active";

    if (daily) {
      let usedPercent: number | null = null;
      const percentUsed = daily?.percentUsed;
      if (typeof percentUsed === "number") {
        usedPercent = Math.max(0, Math.min(100, percentUsed * 100));
      } else {
        const used = toNumber(daily?.used);
        const limit = toNumber(daily?.limit ?? (daily?.limits as Record<string, unknown>)?.daily);
        if (used !== null && limit !== null && limit > 0) {
          usedPercent = Math.max(0, Math.min(100, (used / limit) * 100));
        }
      }
      const resetAt = toTimestamp(daily?.resetAt);
      const valueLabel = state !== "active" ? `(${state})` : null;
      windows["daily"] = toUsageWindow({
        usedPercent,
        windowSeconds: NANO_GPT_DAILY_WINDOW_SECONDS,
        resetAt,
        valueLabel,
      });
    }

    if (monthly) {
      let usedPercent: number | null = null;
      const percentUsed = monthly?.percentUsed;
      if (typeof percentUsed === "number") {
        usedPercent = Math.max(0, Math.min(100, percentUsed * 100));
      } else {
        const used = toNumber(monthly?.used);
        const limit = toNumber(monthly?.limit ?? (monthly?.limits as Record<string, unknown>)?.monthly);
        if (used !== null && limit !== null && limit > 0) {
          usedPercent = Math.max(0, Math.min(100, (used / limit) * 100));
        }
      }
      const resetAt = toTimestamp(monthly?.resetAt ?? period?.currentPeriodEnd);
      const valueLabel = state !== "active" ? `(${state})` : null;
      windows["monthly"] = toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt,
        valueLabel,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 4: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/copilot.ts \
        packages/web/server/src/domains/quota/providers/kimi.ts \
        packages/web/server/src/domains/quota/providers/nanogpt.ts
git commit -m "feat(quota): port copilot, kimi, nanogpt providers to TypeScript"
```

---

### Task 5: Port providers (openrouter, zai, zhipuai-coding-plan)

**Files:**
- Create: `packages/web/server/src/domains/quota/providers/openrouter.ts`
- Create: `packages/web/server/src/domains/quota/providers/zai.ts`
- Create: `packages/web/server/src/domains/quota/providers/zhipuai-coding-plan.ts`

- [ ] **Step 1: Write `providers/openrouter.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow, formatMoney } from "../formatters.js";
import { toNumber } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "openrouter";
export const providerName = "OpenRouter";
export const aliases = ["openrouter"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const credits = (payload?.data ?? {}) as Record<string, unknown>;
    const totalCredits = toNumber(credits.total_credits);
    const totalUsage = toNumber(credits.total_usage);
    const remaining = totalCredits !== null && totalUsage !== null
      ? Math.max(0, totalCredits - totalUsage)
      : null;
    const usedPercent = totalCredits && totalUsage !== null
      ? Math.max(0, Math.min(100, (totalUsage / totalCredits) * 100))
      : null;
    const valueLabel = remaining !== null ? `$${formatMoney(remaining)} remaining` : null;

    const windows: Record<string, UsageWindow> = {
      credits: toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt: null,
        valueLabel,
      }),
    };

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 2: Write `providers/zai.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { normalizeTimestamp, resolveWindowSeconds, resolveWindowLabel } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "zai-coding-plan";
export const providerName = "z.ai";
export const aliases = ["zai-coding-plan", "zai", "z.ai"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://api.z.ai/api/monitor/usage/quota/limit", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const limits = Array.isArray(payload?.data?.limits)
      ? (payload.data.limits as Record<string, unknown>[])
      : [];
    const tokensLimit = limits.find((limit) => limit?.type === "TOKENS_LIMIT") as Record<string, unknown> | undefined;
    const windowSeconds = resolveWindowSeconds(tokensLimit as { unit?: number; number?: number } | undefined);
    const windowLabel = resolveWindowLabel(windowSeconds);
    const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null;
    const usedPercent = typeof tokensLimit?.percentage === "number" ? tokensLimit.percentage : null;

    const windows: Record<string, UsageWindow> = {};
    if (tokensLimit) {
      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 3: Write `providers/zhipuai-coding-plan.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { normalizeTimestamp, resolveWindowSeconds } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "zhipuai-coding-plan";
export const providerName = "Zhipu AI Coding Plan";
export const aliases = ["zhipuai-coding-plan"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const limits = Array.isArray(payload?.data?.limits)
      ? (payload.data.limits as Record<string, unknown>[])
      : [];

    const tokensLimit = limits.find((limit) => limit?.type === "TOKENS_LIMIT") as Record<string, unknown> | undefined;
    const mcpToolsTimeLimit = limits.find((limit) => limit?.type === "TIME_LIMIT") as Record<string, unknown> | undefined;

    const windows: Record<string, UsageWindow> = {};

    if (tokensLimit) {
      const ws = resolveWindowSeconds(tokensLimit as { unit?: number; number?: number } | undefined);
      const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null;
      const usedPercent = typeof tokensLimit?.percentage === "number" ? tokensLimit.percentage : null;
      windows["Tokens"] = toUsageWindow({
        usedPercent,
        windowSeconds: ws,
        resetAt,
      });
    }

    if (mcpToolsTimeLimit) {
      const monthSeconds = 30 * 24 * 60 * 60;
      const resetAt = mcpToolsTimeLimit?.nextResetTime ? normalizeTimestamp(mcpToolsTimeLimit.nextResetTime) : null;
      const usedPercent = typeof mcpToolsTimeLimit?.percentage === "number" ? mcpToolsTimeLimit.percentage : null;
      windows["MCP Tools"] = toUsageWindow({
        usedPercent,
        windowSeconds: monthSeconds,
        resetAt,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 4: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/openrouter.ts \
        packages/web/server/src/domains/quota/providers/zai.ts \
        packages/web/server/src/domains/quota/providers/zhipuai-coding-plan.ts
git commit -m "feat(quota): port openrouter, zai, zhipuai-coding-plan providers to TS"
```

---

### Task 6: Port providers (zhipuai with bridge, minimax, minimax-cn)

**Files:**
- Create: `packages/web/server/src/domains/quota/providers/zhipuai.ts`
- Create: `packages/web/server/src/domains/quota/providers/minimax-coding-plan.ts`
- Create: `packages/web/server/src/domains/quota/providers/minimax-cn-coding-plan.ts`

- [ ] **Step 1: Write `providers/zhipuai.ts`** (readConfigLayers require() bridge)

> **Why `require()`:** `isConfigured` must be synchronous (called by the registry). A dynamic `import()` would make it async, breaking the registry contract. The `require()` pattern is already used throughout the codebase (e.g., `feature-routes-runtime.ts` had the same pattern for `lib/quota/` itself). Bun handles ESM→CJS interop transparently at runtime. This bridge will be replaced by a typed `import` when `lib/opencode/shared.js` is ported in Stage 9.5.

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { normalizeTimestamp, resolveWindowSeconds, resolveWindowLabel } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "zhipuai-coding-plan";
export const providerName = "ZhipuAI";
export const aliases = ["zhipuai-coding-plan", "zhipuai", "zhipu"];

function getApiKey(): string | null {
  const auth = readAuthFile();
  const oldEntry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKeyFromOld = (oldEntry?.key ?? oldEntry?.token) as string | undefined;

  if (apiKeyFromOld) {
    return apiKeyFromOld;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readConfigLayers } = require("../../../lib/opencode/shared.js") as any;
    const layers = readConfigLayers();
    const { mergedConfig } = layers;

    for (const alias of aliases) {
      const providerConfig = mergedConfig?.provider?.[alias];
      if (providerConfig?.options?.apiKey) {
        return providerConfig.options.apiKey;
      }
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

export const isConfigured = (): boolean => {
  return Boolean(getApiKey());
};

export const fetchQuota = async () => {
  const apiKey = getApiKey();

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const limits = Array.isArray(payload?.data?.limits)
      ? (payload.data.limits as Record<string, unknown>[])
      : [];
    const tokensLimit = limits.find((limit) => limit?.type === "TOKENS_LIMIT") as Record<string, unknown> | undefined;
    const windowSeconds = resolveWindowSeconds(tokensLimit as { unit?: number; number?: number } | undefined);
    const windowLabel = resolveWindowLabel(windowSeconds);
    const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null;
    const usedPercent = typeof tokensLimit?.percentage === "number" ? tokensLimit.percentage : null;

    const windows: Record<string, UsageWindow> = {};
    if (tokensLimit) {
      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 2: Write `providers/minimax-coding-plan.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "minimax-coding-plan";
export const providerName = "MiniMax Coding Plan (minimax.io)";
export const aliases = ["minimax-coding-plan"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch(
      "https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const baseResp = payload?.base_resp as Record<string, unknown> | undefined;
    if (baseResp && (baseResp.status_code as number) !== 0) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: (baseResp.status_msg as string) || `API error: ${baseResp.status_code}`,
      });
    }

    const firstModel = (payload?.model_remains as Record<string, unknown>[])?.[0];
    if (!firstModel) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: "No model quota data available",
      });
    }

    const intervalTotal = toNumber(firstModel.current_interval_total_count);
    const intervalUsage = toNumber(firstModel.current_interval_usage_count);
    const intervalStartAt = toTimestamp(firstModel.start_time);
    const intervalResetAt = toTimestamp(firstModel.end_time);
    const weeklyTotal = toNumber(firstModel.current_weekly_total_count);
    const weeklyUsage = toNumber(firstModel.current_weekly_usage_count);
    const weeklyStartAt = toTimestamp(firstModel.weekly_start_time);
    const weeklyResetAt = toTimestamp(firstModel.weekly_end_time);

    const intervalUsedPercent =
      intervalTotal && intervalTotal > 0 && intervalUsage !== null
        ? Math.max(0, Math.min(100, (intervalUsage / intervalTotal) * 100))
        : null;
    const intervalWindowSeconds =
      intervalStartAt && intervalResetAt && intervalResetAt > intervalStartAt
        ? Math.floor((intervalResetAt - intervalStartAt) / 1000)
        : null;
    const weeklyUsedPercent =
      weeklyTotal && weeklyTotal > 0 && weeklyUsage !== null
        ? Math.max(0, Math.min(100, (weeklyUsage / weeklyTotal) * 100))
        : null;
    const weeklyWindowSeconds =
      weeklyStartAt && weeklyResetAt && weeklyResetAt > weeklyStartAt
        ? Math.floor((weeklyResetAt - weeklyStartAt) / 1000)
        : null;

    const windows: Record<string, UsageWindow> = {
      "5h": toUsageWindow({
        usedPercent: intervalUsedPercent,
        windowSeconds: intervalWindowSeconds,
        resetAt: intervalResetAt,
      }),
      weekly: toUsageWindow({
        usedPercent: weeklyUsedPercent,
        windowSeconds: weeklyWindowSeconds,
        resetAt: weeklyResetAt,
      }),
    };

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 3: Write `providers/minimax-cn-coding-plan.ts`**

```typescript
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "minimax-cn-coding-plan";
export const providerName = "MiniMax Coding Plan (minimaxi.com)";
export const aliases = ["minimax-cn-coding-plan"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch(
      "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const baseResp = payload?.base_resp as Record<string, unknown> | undefined;
    if (baseResp && (baseResp.status_code as number) !== 0) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: (baseResp.status_msg as string) || `API error: ${baseResp.status_code}`,
      });
    }

    const firstModel = (payload?.model_remains as Record<string, unknown>[])?.[0];
    if (!firstModel) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: "No model quota data available",
      });
    }

    const intervalTotal = toNumber(firstModel.current_interval_total_count);
    const intervalUsage = toNumber(firstModel.current_interval_usage_count);
    const intervalStartAt = toTimestamp(firstModel.start_time);
    const intervalResetAt = toTimestamp(firstModel.end_time);
    const weeklyTotal = toNumber(firstModel.current_weekly_total_count);
    const weeklyUsage = toNumber(firstModel.current_weekly_usage_count);
    const weeklyStartAt = toTimestamp(firstModel.weekly_start_time);
    const weeklyResetAt = toTimestamp(firstModel.weekly_end_time);

    const intervalUsedPercent =
      intervalTotal && intervalTotal > 0 && intervalUsage !== null
        ? Math.max(0, Math.min(100, (intervalUsage / intervalTotal) * 100))
        : null;
    const intervalWindowSeconds =
      intervalStartAt && intervalResetAt && intervalResetAt > intervalStartAt
        ? Math.floor((intervalResetAt - intervalStartAt) / 1000)
        : null;
    const weeklyUsedPercent =
      weeklyTotal && weeklyTotal > 0 && weeklyUsage !== null
        ? Math.max(0, Math.min(100, (weeklyUsage / weeklyTotal) * 100))
        : null;
    const weeklyWindowSeconds =
      weeklyStartAt && weeklyResetAt && weeklyResetAt > weeklyStartAt
        ? Math.floor((weeklyResetAt - weeklyStartAt) / 1000)
        : null;

    const windows: Record<string, UsageWindow> = {
      "5h": toUsageWindow({
        usedPercent: intervalUsedPercent,
        windowSeconds: intervalWindowSeconds,
        resetAt: intervalResetAt,
      }),
      weekly: toUsageWindow({
        usedPercent: weeklyUsedPercent,
        windowSeconds: weeklyWindowSeconds,
        resetAt: weeklyResetAt,
      }),
    };

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 4: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/zhipuai.ts \
        packages/web/server/src/domains/quota/providers/minimax-coding-plan.ts \
        packages/web/server/src/domains/quota/providers/minimax-cn-coding-plan.ts
git commit -m "feat(quota): port zhipuai, minimax, minimax-cn providers to TS"
```

---

### Task 7: Port ollama-cloud provider

**Files:**
- Create: `packages/web/server/src/domains/quota/providers/ollama-cloud.ts`

- [ ] **Step 1: Write `providers/ollama-cloud.ts`**

```typescript
import { homedir } from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber } from "../transformers.js";
import type { UsageWindow } from "../types.js";

const COOKIE_PATH = join(homedir(), ".config", "ollama-quota", "cookie");

function readCookieFile(): string | null {
  try {
    if (!existsSync(COOKIE_PATH)) return null;
    const content = readFileSync(COOKIE_PATH, "utf-8");
    const trimmed = content.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

function parseOllamaSettingsHtml(html: string): Record<string, UsageWindow> {
  const windows: Record<string, UsageWindow> = {};
  const sessionMatch = html.match(/Session\s+usage[^0-9]*([0-9.]+)%/i);
  if (sessionMatch) {
    windows["session"] = toUsageWindow({
      usedPercent: toNumber(sessionMatch[1]),
      windowSeconds: null,
      resetAt: null,
    });
  }
  const weeklyMatch = html.match(/Weekly\s+usage[^0-9]*([0-9.]+)%/i);
  if (weeklyMatch) {
    windows["weekly"] = toUsageWindow({
      usedPercent: toNumber(weeklyMatch[1]),
      windowSeconds: null,
      resetAt: null,
    });
  }
  const premiumMatch = html.match(/Premium[^0-9]*([0-9]+)\s*\/\s*([0-9]+)/i);
  if (premiumMatch) {
    const used = toNumber(premiumMatch[1]);
    const total = toNumber(premiumMatch[2]);
    const usedPercent = total && used !== null ? Math.min(100, (used / total) * 100) : null;
    windows["premium"] = toUsageWindow({
      usedPercent,
      windowSeconds: null,
      resetAt: null,
      valueLabel: `${used ?? 0} / ${total ?? 0}`,
    });
  }
  return windows;
}

export const providerId = "ollama-cloud";
export const providerName = "Ollama Cloud";
export const aliases = ["ollama-cloud", "ollamacloud"];

export const isConfigured = (): boolean => {
  const cookie = readCookieFile();
  return Boolean(cookie);
};

export const fetchQuota = async () => {
  const cookie = readCookieFile();

  if (!cookie) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://ollama.com/settings", {
      method: "GET",
      headers: {
        Cookie: cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const html = await response.text();
    const windows = parseOllamaSettingsHtml(html);

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};
```

- [ ] **Step 2: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/ollama-cloud.ts
git commit -m "feat(quota): port ollama-cloud provider to TypeScript"
```

---

### Task 8: Port Google provider (4 files)

**Files:**
- Create: `packages/web/server/src/domains/quota/providers/google/transforms.ts`
- Create: `packages/web/server/src/domains/quota/providers/google/api.ts`
- Create: `packages/web/server/src/domains/quota/providers/google/auth.ts`
- Create: `packages/web/server/src/domains/quota/providers/google/index.ts`

- [ ] **Step 1: Write `providers/google/transforms.ts`**

```typescript
import { asNonEmptyString, toNumber, toTimestamp } from "../../transformers.js";
import { toUsageWindow } from "../../formatters.js";
import type { UsageWindow } from "../../types.js";

const GOOGLE_FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60;
const GOOGLE_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

export function parseGoogleRefreshToken(rawRefreshToken: unknown): {
  refreshToken: string | null;
  projectId: string | null;
  managedProjectId: string | null;
} {
  const token = asNonEmptyString(rawRefreshToken);
  if (!token) {
    return { refreshToken: null, projectId: null, managedProjectId: null };
  }

  const [rawToken = "", rawProject = "", rawManagedProject = ""] = token.split("|");
  return {
    refreshToken: asNonEmptyString(rawToken),
    projectId: asNonEmptyString(rawProject),
    managedProjectId: asNonEmptyString(rawManagedProject),
  };
}

export function resolveGoogleWindow(
  sourceId: string,
  resetAt: number | null
): { label: string; seconds: number } {
  if (sourceId === "gemini") {
    return { label: "daily", seconds: GOOGLE_DAILY_WINDOW_SECONDS };
  }

  if (sourceId === "antigravity") {
    const remainingSeconds = typeof resetAt === "number"
      ? Math.max(0, Math.round((resetAt - Date.now()) / 1000))
      : null;

    if (remainingSeconds !== null && remainingSeconds > 10 * 60 * 60) {
      return { label: "daily", seconds: GOOGLE_DAILY_WINDOW_SECONDS };
    }

    return { label: "5h", seconds: GOOGLE_FIVE_HOUR_WINDOW_SECONDS };
  }

  return { label: "daily", seconds: GOOGLE_DAILY_WINDOW_SECONDS };
}

export function transformQuotaBucket(
  bucket: Record<string, unknown> | null,
  sourceId: string
): Record<string, { windows: Record<string, UsageWindow> }> | null {
  const modelId = asNonEmptyString(bucket?.modelId);
  if (!modelId) return null;

  const scopedName = modelId.startsWith(`${sourceId}/`)
    ? modelId
    : `${sourceId}/${modelId}`;

  const remainingFraction = toNumber(bucket?.remainingFraction);
  const remainingPercent = remainingFraction !== null
    ? Math.round(remainingFraction * 100)
    : null;
  const usedPercent = remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
  const resetAt = toTimestamp(bucket?.resetTime);
  const window = resolveGoogleWindow(sourceId, resetAt);

  return {
    [scopedName]: {
      windows: {
        [window.label]: toUsageWindow({
          usedPercent,
          windowSeconds: window.seconds,
          resetAt,
        }),
      },
    },
  };
}

export function transformModelData(
  modelName: string,
  modelData: Record<string, unknown>,
  sourceId: string
): Record<string, { windows: Record<string, UsageWindow> }> {
  const scopedName = modelName.startsWith(`${sourceId}/`)
    ? modelName
    : `${sourceId}/${modelName}`;

  const quotaInfo = modelData?.quotaInfo as Record<string, unknown> | undefined;
  const remainingFraction = quotaInfo?.remainingFraction;
  const remainingPercent = typeof remainingFraction === "number"
    ? Math.round(remainingFraction * 100)
    : null;
  const usedPercent = remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
  const resetAt = quotaInfo?.resetTime
    ? new Date(quotaInfo.resetTime as string).getTime()
    : null;
  const window = resolveGoogleWindow(sourceId, resetAt);

  return {
    [scopedName]: {
      windows: {
        [window.label]: toUsageWindow({
          usedPercent,
          windowSeconds: window.seconds,
          resetAt,
        }),
      },
    },
  };
}
```

- [ ] **Step 2: Write `providers/google/api.ts`**

```typescript
const GOOGLE_PRIMARY_ENDPOINT = "https://cloudcode-pa.googleapis.com";

const GOOGLE_ENDPOINTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  GOOGLE_PRIMARY_ENDPOINT,
];

const GOOGLE_HEADERS: Record<string, string> = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata":
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Record<string, unknown>;
  return typeof data?.access_token === "string" ? data.access_token : null;
}

export async function fetchGoogleQuotaBuckets(
  accessToken: string,
  projectId?: string
): Promise<Record<string, unknown> | null> {
  const body = projectId ? { project: projectId } : {};

  try {
    const response = await fetch(`${GOOGLE_PRIMARY_ENDPOINT}/v1internal:retrieveUserQuota`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchGoogleModels(
  accessToken: string,
  projectId?: string
): Promise<Record<string, unknown> | null> {
  const body = projectId ? { project: projectId } : {};

  for (const endpoint of GOOGLE_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...GOOGLE_HEADERS,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        return (await response.json()) as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}
```

- [ ] **Step 3: Write `providers/google/auth.ts`**

```typescript
import {
  ANTIGRAVITY_ACCOUNTS_PATHS,
  readJsonFile,
  getAuthEntry,
  normalizeAuthEntry,
} from "../../auth-utils.js";
import { readAuthFile } from "../../../auth/provider-auth.js";
import { asObject, asNonEmptyString, toTimestamp } from "../../transformers.js";
import { parseGoogleRefreshToken } from "./transforms.js";
import type { GoogleAuthSource } from "../../types.js";

const ANTIGRAVITY_GOOGLE_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const ANTIGRAVITY_GOOGLE_CLIENT_SECRET = "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";
const GEMINI_GOOGLE_CLIENT_ID =
  "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const GEMINI_GOOGLE_CLIENT_SECRET = "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";
export const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

export function resolveGoogleOAuthClient(sourceId: string): {
  clientId: string;
  clientSecret: string;
} {
  if (sourceId === "gemini") {
    return {
      clientId: GEMINI_GOOGLE_CLIENT_ID,
      clientSecret: GEMINI_GOOGLE_CLIENT_SECRET,
    };
  }

  return {
    clientId: ANTIGRAVITY_GOOGLE_CLIENT_ID,
    clientSecret: ANTIGRAVITY_GOOGLE_CLIENT_SECRET,
  };
}

export function resolveGeminiCliAuth(
  auth: Record<string, unknown>
): GoogleAuthSource | null {
  const entry = normalizeAuthEntry(getAuthEntry(auth, ["google", "google.oauth"]));
  const entryObject = asObject(entry);
  if (!entryObject) {
    return null;
  }

  const oauthObject = asObject(entryObject["oauth"] as unknown) ?? entryObject;
  const accessToken =
    asNonEmptyString(oauthObject["access"]) ??
    asNonEmptyString(oauthObject["token"]);
  const refreshParts = parseGoogleRefreshToken(oauthObject["refresh"]);

  if (!accessToken && !refreshParts.refreshToken) {
    return null;
  }

  return {
    sourceId: "gemini",
    sourceLabel: "Gemini",
    accessToken,
    refreshToken: refreshParts.refreshToken,
    projectId: refreshParts.projectId ?? refreshParts.managedProjectId,
    expires: toTimestamp(oauthObject["expires"]),
  };
}

export function resolveAntigravityAuth(): GoogleAuthSource | null {
  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    const accounts = data?.accounts as Record<string, unknown>[] | undefined;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const index =
        typeof data?.activeIndex === "number" ? data.activeIndex : 0;
      const account = accounts[index] ?? accounts[0];
      if (account?.refreshToken) {
        const refreshParts = parseGoogleRefreshToken(account.refreshToken as string);
        return {
          sourceId: "antigravity",
          sourceLabel: "Antigravity",
          refreshToken: refreshParts.refreshToken,
          projectId:
            asNonEmptyString(account["projectId"]) ??
            asNonEmptyString(account["managedProjectId"]) ??
            refreshParts.projectId ??
            refreshParts.managedProjectId,
          email: account["email"] as string | undefined,
        };
      }
    }
  }

  return null;
}

export function resolveGoogleAuthSources(): GoogleAuthSource[] {
  const auth = readAuthFile();
  const sources: GoogleAuthSource[] = [];

  const geminiAuth = resolveGeminiCliAuth(auth);
  if (geminiAuth) {
    sources.push(geminiAuth);
  }

  const antigravityAuth = resolveAntigravityAuth();
  if (antigravityAuth) {
    sources.push(antigravityAuth);
  }

  return sources;
}
```

- [ ] **Step 4: Write `providers/google/index.ts`**

```typescript
import { buildResult } from "../../formatters.js";
import {
  resolveGoogleAuthSources,
  resolveGoogleOAuthClient,
  DEFAULT_PROJECT_ID,
} from "./auth.js";
import { transformQuotaBucket, transformModelData } from "./transforms.js";
import {
  refreshGoogleAccessToken,
  fetchGoogleQuotaBuckets,
  fetchGoogleModels,
} from "./api.js";
import type { UsageWindow } from "../../types.js";

export {
  resolveGoogleOAuthClient,
  resolveGeminiCliAuth,
  resolveAntigravityAuth,
  resolveGoogleAuthSources,
  DEFAULT_PROJECT_ID,
} from "./auth.js";

export {
  resolveGoogleWindow,
  transformQuotaBucket,
  transformModelData,
} from "./transforms.js";

export {
  refreshGoogleAccessToken,
  fetchGoogleQuotaBuckets,
  fetchGoogleModels,
} from "./api.js";

export const fetchGoogleQuota = async () => {
  const authSources = resolveGoogleAuthSources();
  if (!authSources.length) {
    return buildResult({
      providerId: "google",
      providerName: "Google",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  const models: Record<string, { windows: Record<string, UsageWindow> }> = {};
  const sourceErrors: string[] = [];

  for (const source of authSources) {
    const now = Date.now();
    let accessToken: string | null | undefined = source.accessToken;

    if (
      !accessToken ||
      (typeof source.expires === "number" && source.expires <= now)
    ) {
      if (!source.refreshToken) {
        sourceErrors.push(`${source.sourceLabel}: Missing refresh token`);
        continue;
      }
      const { clientId, clientSecret } = resolveGoogleOAuthClient(
        source.sourceId
      );
      accessToken = await refreshGoogleAccessToken(
        source.refreshToken,
        clientId,
        clientSecret
      );
    }

    if (!accessToken) {
      sourceErrors.push(
        `${source.sourceLabel}: Failed to refresh OAuth token`
      );
      continue;
    }

    const projectId = source.projectId ?? DEFAULT_PROJECT_ID;
    let mergedAnyModel = false;

    if (source.sourceId === "gemini" && projectId) {
      const quotaPayload = await fetchGoogleQuotaBuckets(accessToken, projectId);
      const buckets = Array.isArray(quotaPayload?.buckets)
        ? (quotaPayload.buckets as Record<string, unknown>[])
        : [];

      for (const bucket of buckets) {
        const transformed = transformQuotaBucket(bucket, source.sourceId);
        if (transformed) {
          Object.assign(models, transformed);
          mergedAnyModel = true;
        }
      }
    }

    if (projectId) {
      const payload = await fetchGoogleModels(accessToken, projectId);
      if (payload) {
        for (const [modelName, modelData] of Object.entries(
          (payload.models ?? {}) as Record<string, Record<string, unknown>>
        )) {
          const transformed = transformModelData(
            modelName,
            modelData,
            source.sourceId
          );
          Object.assign(models, transformed);
          mergedAnyModel = true;
        }
      }
    }

    if (!mergedAnyModel) {
      sourceErrors.push(
        `${source.sourceLabel}: Failed to fetch models`
      );
    }
  }

  if (!Object.keys(models).length) {
    return buildResult({
      providerId: "google",
      providerName: "Google",
      ok: false,
      configured: true,
      error: sourceErrors[0] ?? "Failed to fetch models",
    });
  }

  return buildResult({
    providerId: "google",
    providerName: "Google",
    ok: true,
    configured: true,
    usage: {
      windows: {},
      models: Object.keys(models).length ? models : undefined,
    },
  });
};
```

- [ ] **Step 5: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/google/
git commit -m "feat(quota): port Google provider (4 files) to TypeScript"
```

---

### Task 9: Port providers/index.ts (registry)

**Files:**
- Create: `packages/web/server/src/domains/quota/providers/index.ts`

- [ ] **Step 1: Write `providers/index.ts`** — typed registry with fix for duplicate key

```typescript
import { buildResult } from "../formatters.js";
import type { ConfiguredProviderEntry } from "../types.js";

import * as claude from "./claude.js";
import * as codex from "./codex.js";
import * as copilot from "./copilot.js";
import * as google from "./google/index.js";
import * as kimi from "./kimi.js";
import * as nanogpt from "./nanogpt.js";
import * as openai from "./openai.js";
import * as openrouter from "./openrouter.js";
import * as zai from "./zai.js";
import * as zhipuaiCodingPlan from "./zhipuai-coding-plan.js";
import * as minimaxCodingPlan from "./minimax-coding-plan.js";
import * as minimaxCnCodingPlan from "./minimax-cn-coding-plan.js";
import * as ollamaCloud from "./ollama-cloud.js";
import * as zhipuai from "./zhipuai.js";

const registry: Record<string, ConfiguredProviderEntry> = {
  claude: {
    providerId: claude.providerId,
    providerName: claude.providerName,
    isConfigured: claude.isConfigured,
    fetchQuota: claude.fetchQuota,
  },
  codex: {
    providerId: codex.providerId,
    providerName: codex.providerName,
    isConfigured: codex.isConfigured,
    fetchQuota: codex.fetchQuota,
  },
  google: {
    providerId: "google",
    providerName: "Google",
    isConfigured: () => google.resolveGoogleAuthSources().length > 0,
    fetchQuota: google.fetchGoogleQuota,
  },
  "zai-coding-plan": {
    providerId: zai.providerId,
    providerName: zai.providerName,
    isConfigured: zai.isConfigured,
    fetchQuota: zai.fetchQuota,
  },
  "zhipuai-tokens": {
    providerId: zhipuaiCodingPlan.providerId,
    providerName: zhipuaiCodingPlan.providerName,
    isConfigured: zhipuaiCodingPlan.isConfigured,
    fetchQuota: zhipuaiCodingPlan.fetchQuota,
  },
  "zhipuai-coding-plan": {
    providerId: zhipuai.providerId,
    providerName: zhipuai.providerName,
    isConfigured: zhipuai.isConfigured,
    fetchQuota: zhipuai.fetchQuota,
  },
  "kimi-for-coding": {
    providerId: kimi.providerId,
    providerName: kimi.providerName,
    isConfigured: kimi.isConfigured,
    fetchQuota: kimi.fetchQuota,
  },
  openrouter: {
    providerId: openrouter.providerId,
    providerName: openrouter.providerName,
    isConfigured: openrouter.isConfigured,
    fetchQuota: openrouter.fetchQuota,
  },
  "nano-gpt": {
    providerId: nanogpt.providerId,
    providerName: nanogpt.providerName,
    isConfigured: nanogpt.isConfigured,
    fetchQuota: nanogpt.fetchQuota,
  },
  "github-copilot": {
    providerId: copilot.providerId,
    providerName: copilot.providerName,
    isConfigured: copilot.isConfigured,
    fetchQuota: copilot.fetchQuota,
  },
  "github-copilot-addon": {
    providerId: copilot.providerIdAddon,
    providerName: copilot.providerNameAddon,
    isConfigured: copilot.isConfigured,
    fetchQuota: copilot.fetchQuotaAddon,
  },
  "minimax-coding-plan": {
    providerId: minimaxCodingPlan.providerId,
    providerName: minimaxCodingPlan.providerName,
    isConfigured: minimaxCodingPlan.isConfigured,
    fetchQuota: minimaxCodingPlan.fetchQuota,
  },
  "minimax-cn-coding-plan": {
    providerId: minimaxCnCodingPlan.providerId,
    providerName: minimaxCnCodingPlan.providerName,
    isConfigured: minimaxCnCodingPlan.isConfigured,
    fetchQuota: minimaxCnCodingPlan.fetchQuota,
  },
  "ollama-cloud": {
    providerId: ollamaCloud.providerId,
    providerName: ollamaCloud.providerName,
    isConfigured: ollamaCloud.isConfigured,
    fetchQuota: ollamaCloud.fetchQuota,
  },
};

export function listConfiguredQuotaProviders(): string[] {
  const configured: string[] = [];

  for (const [id, provider] of Object.entries(registry)) {
    try {
      if (provider.isConfigured()) {
        configured.push(id);
      }
    } catch {
      // Ignore provider-specific config errors in list API.
    }
  }

  return configured;
}

export async function fetchQuotaForProvider(providerId: string) {
  const provider = registry[providerId];

  if (!provider) {
    return buildResult({
      providerId,
      providerName: providerId,
      ok: false,
      configured: false,
      error: "Unsupported provider",
    });
  }

  try {
    return await provider.fetchQuota();
  } catch (error) {
    return buildResult({
      providerId: provider.providerId,
      providerName: provider.providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
}

export const fetchClaudeQuota = claude.fetchQuota;
export const fetchOpenaiQuota = openai.fetchQuota;
export const fetchGoogleQuota = google.fetchGoogleQuota;
export const fetchCodexQuota = codex.fetchQuota;
export const fetchCopilotQuota = copilot.fetchQuota;
export const fetchCopilotAddonQuota = copilot.fetchQuotaAddon;
export const fetchKimiQuota = kimi.fetchQuota;
export const fetchOpenRouterQuota = openrouter.fetchQuota;
export const fetchZaiQuota = zai.fetchQuota;
export const fetchZhipuaiCodingPlanQuota = zhipuaiCodingPlan.fetchQuota;
export const fetchNanoGptQuota = nanogpt.fetchQuota;
export const fetchMinimaxCodingPlanQuota = minimaxCodingPlan.fetchQuota;
export const fetchMinimaxCnCodingPlanQuota = minimaxCnCodingPlan.fetchQuota;
export const fetchOllamaCloudQuota = ollamaCloud.fetchQuota;
export const fetchZhipuaiQuota = zhipuai.fetchQuota;
```

- [ ] **Step 2: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/index.ts
git commit -m "feat(quota): port provider registry to TypeScript"
```

---

### Task 10: Update barrel and consumer

**Files:**
- Modify: `packages/web/server/src/domains/quota/index.ts`
- Modify: `packages/web/server/src/domains/quota/routes.ts`
- Modify: `packages/web/server/src/domains/routes/feature-routes-runtime.ts`

- [ ] **Step 1: Update `src/domains/quota/index.ts` barrel**

Replace with:

```typescript
export { registerQuotaRoutes } from "./routes.js";
export type { QuotaRoutesDeps } from "./routes.js";

export { listConfiguredQuotaProviders, fetchQuotaForProvider } from "./providers/index.js";
export type { QuotaProviderResult, UsageWindow, ProviderUsage, QuotaProviderRegistry } from "./types.js";
```

- [ ] **Step 2: Update `src/domains/quota/routes.ts`** — use typed import

Replace with:

```typescript
import type { Express } from "express";
import type { QuotaProviderRegistry } from "./types.js";

export interface QuotaRoutesDeps {
  getQuotaProviders(): Promise<QuotaProviderRegistry>;
}

export function registerQuotaRoutes(app: Express, { getQuotaProviders }: QuotaRoutesDeps): void {
  app.get("/api/quota/providers", async (_req, res) => {
    try {
      const { listConfiguredQuotaProviders } = await getQuotaProviders();
      const providers = listConfiguredQuotaProviders();
      res.json({ providers });
    } catch (error) {
      console.error("Failed to list quota providers:", error);
      res.status(500).json({ error: (error as Error).message || "Failed to list quota providers" });
    }
  });

  app.get("/api/quota/:providerId", async (req, res) => {
    try {
      const { providerId } = req.params;
      if (!providerId) {
        return res.status(400).json({ error: "Provider ID is required" });
      }
      const { fetchQuotaForProvider } = await getQuotaProviders();
      const result = await fetchQuotaForProvider(providerId);
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch quota:", error);
      res.status(500).json({ error: (error as Error).message || "Failed to fetch quota" });
    }
  });
}
```

- [ ] **Step 3: Update `feature-routes-runtime.ts`** — replace require() bridge with typed ES import

Remove the `require()` bridge (lines 21-28) and replace with typed lazy import:

Change:
```typescript
  let quotaProviders: any = null;
  const getQuotaProviders = async () => {
    if (!quotaProviders) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      quotaProviders = require('../../../lib/quota/index.js') as any;
    }
    return quotaProviders;
  };
```

To:
```typescript
  let quotaProviders: QuotaProviderRegistry | null = null;
  const getQuotaProviders = async (): Promise<QuotaProviderRegistry> => {
    if (!quotaProviders) {
      const mod = await import("../quota/providers/index.js");
      quotaProviders = mod;
    }
    return quotaProviders;
  };
```

Also add the type import at the top of the file:
```typescript
import type { QuotaProviderRegistry } from "../quota/types.js";
```

- [ ] **Step 4: Verify type-check**

```bash
npx tsc -p packages/web/tsconfig.server.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/quota/index.ts \
        packages/web/server/src/domains/quota/routes.ts \
        packages/web/server/src/domains/routes/feature-routes-runtime.ts
git commit -m "feat(quota): update barrels and remove require() bridge from feature-routes-runtime"
```

---

### Task 11: Delete old JS files and verify

**Files:**
- Delete: `packages/web/server/lib/quota/index.js`
- Delete: `packages/web/server/lib/quota/utils/index.js`
- Delete: `packages/web/server/lib/quota/utils/auth.js`
- Delete: `packages/web/server/lib/quota/utils/formatters.js`
- Delete: `packages/web/server/lib/quota/utils/transformers.js`
- Delete: `packages/web/server/lib/quota/providers/interface.js`
- Delete: `packages/web/server/lib/quota/providers/index.js`
- Delete: `packages/web/server/lib/quota/providers/claude.js`
- Delete: `packages/web/server/lib/quota/providers/codex.js`
- Delete: `packages/web/server/lib/quota/providers/copilot.js`
- Delete: `packages/web/server/lib/quota/providers/kimi.js`
- Delete: `packages/web/server/lib/quota/providers/nanogpt.js`
- Delete: `packages/web/server/lib/quota/providers/openai.js`
- Delete: `packages/web/server/lib/quota/providers/openrouter.js`
- Delete: `packages/web/server/lib/quota/providers/zai.js`
- Delete: `packages/web/server/lib/quota/providers/zhipuai-coding-plan.js`
- Delete: `packages/web/server/lib/quota/providers/zhipuai.js`
- Delete: `packages/web/server/lib/quota/providers/minimax-coding-plan.js`
- Delete: `packages/web/server/lib/quota/providers/minimax-cn-coding-plan.js`
- Delete: `packages/web/server/lib/quota/providers/ollama-cloud.js`
- Delete: `packages/web/server/lib/quota/providers/google/index.js`
- Delete: `packages/web/server/lib/quota/providers/google/auth.js`
- Delete: `packages/web/server/lib/quota/providers/google/api.js`
- Delete: `packages/web/server/lib/quota/providers/google/transforms.js`

- [ ] **Step 1: Delete all old JS quota files**

```bash
rm -rf packages/web/server/lib/quota/utils/
rm -rf packages/web/server/lib/quota/providers/
rm packages/web/server/lib/quota/index.js
```

- [ ] **Step 2: Verify nothing left in lib/ references quota**

```bash
grep -r "lib/quota" packages/web/server/src/ --include="*.ts" | grep -v node_modules
```
Expected: No matches (all references should now point to `src/domains/quota/`).

- [ ] **Step 3: Build and type-check**

```bash
bun run build:web-server
npx tsc -p packages/web/tsconfig.server.json --noEmit
```
Expected: Both PASS.

- [ ] **Step 4: Run lint on new files**

```bash
cd packages/web && npx eslint server/src/domains/quota/
```

- [ ] **Step 5: Commit**

```bash
git add -A packages/web/server/lib/quota/
git commit -m "chore(quota): delete old JS quota files, fully migrated to TypeScript"
```
