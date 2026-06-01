# Stage 5b: Auth + Tunnels + Notifications Domains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port auth, notifications, and network domains from JS to TS, cut over index.js, delete old JS.

**Architecture:** Three new domains under `domains/`: `auth/` (provider auth + tunnel auth + opencode auth state), `notifications/` (emitter, templates, triggers, push, routes, message helpers), and `network` added to `opencode-support/` (URL building, readiness probes). All follow the same factory pattern as prior stages. `tunnel-wiring-runtime.js` stays in `bootstrap/` domain (already there as a bridge since Stage 5a).

**Tech Stack:** TypeScript, Node.js built-ins, vitest, web-push

---

### File Map

| Domain | Files |
|--------|-------|
| `domains/auth/` | `types.ts`, `provider-auth.ts`, `tunnel-auth.ts`, `opencode-auth-state.ts`, `index.ts` |
| `domains/notifications/` | `types.ts`, `emitter.ts`, `message.ts`, `template-runtime.ts`, `trigger-runtime.ts`, `push-runtime.ts`, `routes.ts`, `runtime.ts`, `index.ts` |
| `domains/opencode-support/` | + `network.ts` (URL builder) |
| `shared/types.ts` | + `auth`, `notifications` domain slots |
| `server/index.js` | cutover imports |

### Old files to delete

- `lib/opencode/auth/auth.js`, `lib/opencode/auth/tunnel-auth.js`, `lib/opencode/auth/` dir
- `lib/opencode/auth.js` (opencode auth state)
- `lib/opencode/network.js` (URL builder)
- `lib/notifications/` (entire directory: runtime.js, emitter-runtime.js, template-runtime.js, trigger-runtime.js, push-runtime.js, routes.js, message.js, index.js, message.test.js)
- `lib/notifications/` dir removed

### Bridges preserved

- `lib/opencode/bootstrap/lifecycle.js` — used by opencode domain bridge
- `lib/opencode/env/env-runtime.js` — used by opencode-support bridge
- `lib/opencode/network/tunnel-wiring-runtime.js` — already in bootstrap

---

### Task 1: Auth Domain Types

**Files:**
- Create: `packages/web/server/src/domains/auth/types.ts`

**Code:**
```typescript
import type { EventBus } from "../../shared/types.js";

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
```

- [ ] **Step 1:** Write `types.ts`
- [ ] **Step 2:** Run `npx tsc --noEmit -p packages/web/tsconfig.server.json`
- [ ] **Step 3:** Commit

---

### Task 2: Auth Provider Auth Module

**Files:**
- Create: `packages/web/server/src/domains/auth/provider-auth.ts`

Full port of `lib/opencode/auth/auth.js` (81 lines). Exports: `readAuthFile`, `writeAuthFile`, `removeProviderAuth`, `getProviderAuth`, `listProviderAuths`, `AUTH_FILE`, `OPENCODE_DATA_DIR`. No factory — plain module.

- [ ] **Step 1:** Write `provider-auth.ts`
- [ ] **Step 2:** Run type-check, commit

---

### Task 3: Auth Tunnel Auth Module

**Files:**
- Create: `packages/web/server/src/domains/auth/tunnel-auth.ts`

Full port of `lib/opencode/auth/tunnel-auth.js` (590 lines). Factory: `createTunnelAuth()`. Internal state: `activeTunnelId`, `activeTunnelHost`, `activeTunnelMode`, `activeTunnelPublicUrl`, `bootstrapRecord`, two `BoundedMap` instances. Public API: `classifyRequestScope`, `setActiveTunnel`, `clearActiveTunnel`, `revokeTunnelArtifacts`, `issueBootstrapToken`, `getBootstrapStatus`, `requireTunnelSession`, `getTunnelSessionFromRequest`, `exchangeBootstrapToken`, `listTunnelSessions`, `clearTunnelSessionCookie`, `getActiveTunnelId`, `getActiveTunnelHost`, `getActiveTunnelMode`, `dispose`.

Import `createBoundedMap` from `../../core/bounded-cache.js` (old JS — this is a pre-existing dependency, keep as-is).

- [ ] **Step 1:** Write `tunnel-auth.ts`
- [ ] **Step 2:** Run type-check, commit

---

### Task 4: Auth OpenCode Auth State Module

**Files:**
- Create: `packages/web/server/src/domains/auth/opencode-auth-state.ts`

Full port of `lib/opencode/auth.js` (88 lines). Factory: `createOpenCodeAuthState(deps)`.

- [ ] **Step 1:** Write `opencode-auth-state.ts`
- [ ] **Step 2:** Run type-check, commit

---

### Task 5: Auth Domain Barrel

**Files:**
- Create: `packages/web/server/src/domains/auth/index.ts`

Re-exports: `createTunnelAuth`, `createOpenCodeAuthState`, all provider auth functions + constants, all types.

- [ ] **Step 1:** Write `index.ts`
- [ ] **Step 2:** Run type-check + build, commit

---

### Task 6: Network Module (URL Builder)

**Files:**
- Create: `packages/web/server/src/domains/opencode-support/network.ts`

Full port of `lib/opencode/network.js` (98 lines). Factory: `createOpenCodeNetworkRuntime(deps)`.

- [ ] **Step 1:** Write `network.ts`
- [ ] **Step 2:** Update `opencode-support/index.ts` to export it
- [ ] **Step 3:** Run type-check, commit

---

### Task 7: Notifications Domain Types

**Files:**
- Create: `packages/web/server/src/domains/notifications/types.ts`

All notification domain interfaces: `NotificationEmitterDeps`, `NotificationEmitterRuntime`, `NotificationTemplateDeps`, `NotificationTemplateRuntime`, `NotificationTriggerDeps`, `NotificationTriggerRuntime`, `PushRuntimeDeps`, `PushRuntime`, `NotificationRoutesDeps`, `NotificationRuntimeDeps`, `NotificationRuntime`.

- [ ] **Step 1:** Write `types.ts`
- [ ] **Step 2:** Run type-check, commit

---

### Task 8: Notifications Modules (emitter + message + runtime)

**Files:**
- Create: `packages/web/server/src/domains/notifications/emitter.ts`
- Create: `packages/web/server/src/domains/notifications/message.ts`
- Create: `packages/web/server/src/domains/notifications/runtime.ts`

Port `emitter-runtime.js` (75 lines), `message.js` (70 lines), `runtime.js` (46 lines). These are small and coupled — do as one commit.

- [ ] **Step 1:** Write all three files
- [ ] **Step 2:** Run type-check, commit

---

### Task 9: Notifications Modules (templates + triggers + push + routes)

**Files:**
- Create: `packages/web/server/src/domains/notifications/template-runtime.ts`
- Create: `packages/web/server/src/domains/notifications/trigger-runtime.ts`
- Create: `packages/web/server/src/domains/notifications/push-runtime.ts`
- Create: `packages/web/server/src/domains/notifications/routes.ts`

Port `template-runtime.js` (419 lines), `trigger-runtime.js` (506 lines), `push-runtime.js` (309 lines), `routes.js` (315 lines). Large files, but straightforward ports.

- [ ] **Step 1:** Write all four files
- [ ] **Step 2:** Run type-check, commit

---

### Task 10: Notifications Barrel + Cutover + Delete Old JS + Verify

**Files:**
- Create: `packages/web/server/src/domains/notifications/index.ts`
- Modify: `packages/web/server/src/shared/types.ts` — add `auth?: any; notifications?: any` to `ServerRuntime.domains`
- Modify: `packages/web/server/index.js` — replace old imports with `./dist/domains/auth/index.js`, `./dist/domains/notifications/index.js`

**Imports to replace in index.js:**
- `./lib/opencode/auth/tunnel-auth.js` → `./dist/domains/auth/index.js` (for `createTunnelAuth`)
- `./lib/opencode/auth.js` → `./dist/domains/auth/index.js` (for `createOpenCodeAuthState`)
- `./lib/notifications/runtime.js` → `./dist/domains/notifications/index.js` (for `createNotificationRuntime`)
- `./lib/notifications/emitter-runtime.js` → `./dist/domains/notifications/index.js` (for `createNotificationEmitterRuntime`)
- `./lib/notifications/trigger-runtime.js` → `./dist/domains/notifications/index.js` (for `createNotificationTriggerRuntime`)
- `./lib/notifications/template-runtime.js` → `./dist/domains/notifications/index.js` (for `createNotificationTemplateRuntime`)
- `./lib/notifications/push-runtime.js` → `./dist/domains/notifications/index.js` (for `createPushRuntime`)
- `./lib/notifications/index.js` → `./dist/domains/notifications/index.js` (for `prepareNotificationLastMessage`)
- `./lib/opencode/network.js` → `./dist/domains/opencode-support/index.js` (for `createOpenCodeNetworkRuntime`)

**Old JS to delete:**
- `lib/opencode/auth/auth.js`, `lib/opencode/auth/tunnel-auth.js`, `lib/opencode/auth/` dir
- `lib/opencode/auth.js`
- `lib/opencode/network.js`
- `lib/notifications/` (entire directory + test files)

**Verification:**
1. `bun run type-check` → PASS
2. `bun run lint` → 0 errors
3. `bun run build:web-server` → PASS
4. `bun test` domains → all passing

- [ ] **Step 1:** Write `index.ts` barrel
- [ ] **Step 2:** Update `shared/types.ts` domain slots
- [ ] **Step 3:** Update `index.js` imports
- [ ] **Step 4:** Delete old JS
- [ ] **Step 5:** Run `bun run type-check`
- [ ] **Step 6:** Run `bun run lint`
- [ ] **Step 7:** Run `bun run build:web-server`
- [ ] **Step 8:** Run `bun test server/src/domains/`
- [ ] **Step 9:** Commit
