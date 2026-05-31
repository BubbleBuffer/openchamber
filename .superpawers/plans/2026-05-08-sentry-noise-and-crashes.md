# Sentry Noise Reduction & Crash Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 6 highest-signal unresolved Sentry issues (OPENCHAMBER-2, N/G/H/P/15, A, 12/C) covering server crash, 5 Base UI component warnings, 13 missing Zustand migrate functions, and noisy directory-probe error logging.

**Architecture:** All fixes are surgical — no new files, no new dependencies. Server fix enables sourcemap support and filters out the incompatible `SystemError` integration. Client fixes add `nativeButton={false}` to 5 Base UI wrapper components, identity `migrate` to 13 Zustand persists, and downgrade a noisy `console.error` to `console.warn`. A `beforeSend` safety net in `sentry.ts` prevents future noise from reaching Sentry.

**Tech Stack:** @sentry/node (server), @sentry/react (client), @base-ui/react, Zustand persist middleware

---

### Task 1: Fix OPENCHAMBER-2 — Server-side Sentry: sourcemaps + remove incompatible integration (67 events)

**Files:**
- Modify: `packages/web/server/instrument.mjs`

- [ ] **Step 1: Add `sourceMaps: true` and filter out incompatible `SystemError` integration**

Bun runtime lacks `util.getSystemErrorMap()` (Node-only). The `@sentry/node` default `systemError` integration crashes when calling it. At the same time, enable source map support so server-side stack traces are readable in Sentry.

Open `packages/web/server/instrument.mjs` and replace the `Sentry.init(...)` block:

```js
Sentry.init({
  dsn: 'https://fdd1d15d875e43828cbc8e4cbdb8fff6@o4511341573636096.ingest.de.sentry.io/4511341589430352',
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE ?? undefined,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // Enable source map parsing so stack traces resolve original source
  // locations in Sentry. Bun processes source maps from filesystem.
  sourceMaps: true,
  integrations: (integrations) => {
    // Bun doesn't support util.getSystemErrorMap() — the systemError
    // integration crashes with TypeError on every invocation.
    return integrations.filter((i) => i.name !== 'SystemError');
  },
});
```

Note: Client-side sourcemaps are already handled by `@sentry/vite-plugin` in `packages/web/vite.config.ts` — this change is server-side only.

- [ ] **Step 2: Verify with type-check and lint**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/instrument.mjs
git commit -m "fix: enable sourcemap support and disable incompatible Sentry systemError integration on Bun"
```

---

### Task 2: Fix OPENCHAMBER-N/G/H/P/15 — Base UI `nativeButton` prop warnings (84 events)

**Files:**
- Modify: `packages/ui/src/components/ui/dialog.tsx`
- Modify: `packages/ui/src/components/ui/dropdown-menu.tsx`
- Modify: `packages/ui/src/components/ui/select.tsx`
- Modify: `packages/ui/src/components/ui/tooltip.tsx`
- Modify: `packages/ui/src/components/ui/collapsible.tsx`

**Context:** Base UI buttons default to `nativeButton=true` which expects the rendered DOM element to be a `<button>`. When our wrappers use `asChild` + `render` prop to pass non-button elements (icons, custom components), the mismatch triggers a `console.error` warning — captured by our Sentry interceptor.

- [ ] **Step 1: Fix `dialog.tsx` — `DialogClose` (line 48)**

```tsx
// BEFORE:
return <BaseDialog.Close data-slot="dialog-close" {...props} {...r} />

// AFTER:
return <BaseDialog.Close data-slot="dialog-close" nativeButton={false} {...props} {...r} />
```

- [ ] **Step 2: Fix `dropdown-menu.tsx` — `DropdownMenuTrigger` (line 38)**

```tsx
// BEFORE:
<BaseMenu.Trigger
  data-slot="dropdown-menu-trigger"
  {...props}
  {...r}
/>

// AFTER:
<BaseMenu.Trigger
  data-slot="dropdown-menu-trigger"
  nativeButton={false}
  {...props}
  {...r}
/>
```

- [ ] **Step 3: Fix `select.tsx` — `SelectTrigger` (line 87)**

```tsx
// BEFORE:
<BaseSelect.Trigger
  data-slot="select-trigger"
  data-size={size}
  className={cn(...)}
  {...props}
  {...(asChildRender ?? {})}
>

// AFTER:
<BaseSelect.Trigger
  data-slot="select-trigger"
  data-size={size}
  nativeButton={false}
  className={cn(...)}
  {...props}
  {...(asChildRender ?? {})}
>
```

- [ ] **Step 4: Fix `tooltip.tsx` — `TooltipTrigger` (line 54)**

```tsx
// BEFORE:
<BaseTooltip.Trigger data-slot="tooltip-trigger" {...props} {...renderProps} />

// AFTER:
<BaseTooltip.Trigger data-slot="tooltip-trigger" nativeButton={false} {...props} {...renderProps} />
```

- [ ] **Step 5: Fix `collapsible.tsx` — `CollapsibleTrigger` (line 29)**

```tsx
// BEFORE:
<BaseCollapsible.Trigger data-slot="collapsible-trigger" className={cn(...)} {...props} {...renderProps} />

// AFTER:
<BaseCollapsible.Trigger data-slot="collapsible-trigger" nativeButton={false} className={cn(...)} {...props} {...renderProps} />
```

- [ ] **Step 6: Verify with type-check and lint**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/ui/dialog.tsx packages/ui/src/components/ui/dropdown-menu.tsx packages/ui/src/components/ui/select.tsx packages/ui/src/components/ui/tooltip.tsx packages/ui/src/components/ui/collapsible.tsx
git commit -m "fix: add nativeButton={false} to Base UI trigger wrappers using asChild"
```

---

### Task 3: Fix OPENCHAMBER-A — Zustand storage migration missing (13 events)

**Files:**
- Modify: `packages/ui/src/stores/permissionStore.ts`
- Modify: `packages/ui/src/stores/session/useSessionDisplayStore.ts`
- Modify: `packages/ui/src/stores/messageQueueStore.ts`
- Modify: `packages/ui/src/stores/useCommandsStore.ts`
- Modify: `packages/ui/src/stores/terminal/useTerminalStore.ts`
- Modify: `packages/ui/src/stores/skills/useSkillsStore.ts`
- Modify: `packages/ui/src/stores/github/useGitHubPrStatusStore.ts`
- Modify: `packages/ui/src/stores/mcp/useMcpConfigStore.ts`
- Modify: `packages/ui/src/stores/git/useGitIdentitiesStore.ts`
- Modify: `packages/ui/src/stores/config/useProviderConfigStore.ts`
- Modify: `packages/ui/src/stores/agents/useAgentConfigStore.ts`
- Modify: `packages/ui/src/stores/agents/useAgentsStore.ts`
- Modify: `packages/ui/src/stores/useTodosPersistStore.ts`

**Context:** Each of these stores has a `persist()` config with `version: 1` but no `migrate` function. When Zustand detects a version mismatch (or just uses the bare default behavior), it logs a `console.error` warning — captured by our Sentry interceptor. The fix is to add an identity `migrate` function so future schema changes can add real migrations.

- [ ] **Step 1: Add identity `migrate` to `permissionStore.ts`**

Find the persist options object (near line 228, after `version: 1`) and insert before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 2: Add identity `migrate` to `useSessionDisplayStore.ts`**

Near line 19, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 3: Add identity `migrate` to `messageQueueStore.ts`**

Near line 141, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 4: Add identity `migrate` to `useCommandsStore.ts`**

Near line 420, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 5: Add identity `migrate` to `useTerminalStore.ts`**

Near line 452, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 6: Add identity `migrate` to `useSkillsStore.ts`**

Near line 470, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 7: Add identity `migrate` to `useGitHubPrStatusStore.ts`**

Near line 605, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 8: Add identity `migrate` to `useMcpConfigStore.ts`**

Near line 352, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 9: Add identity `migrate` to `useGitIdentitiesStore.ts`**

Near line 271, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 10: Add identity `migrate` to `useProviderConfigStore.ts`**

Near line 1014, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 11: Add identity `migrate` to `useAgentConfigStore.ts`**

Near line 696, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 12: Add identity `migrate` to `useAgentsStore.ts`**

Near line 476, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 13: Add identity `migrate` to `useTodosPersistStore.ts`**

Near line 57, after `version: 1`, before `partialize`:

```ts
migrate: (persistedState, version) => {
    void version;
    return persistedState;
},
```

- [ ] **Step 14: Verify with type-check and lint**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 15: Commit**

```bash
git add packages/ui/src/stores/useTodosPersistStore.ts packages/ui/src/stores/permissionStore.ts packages/ui/src/stores/session/useSessionDisplayStore.ts packages/ui/src/stores/messageQueueStore.ts packages/ui/src/stores/useCommandsStore.ts packages/ui/src/stores/terminal/useTerminalStore.ts packages/ui/src/stores/skills/useSkillsStore.ts packages/ui/src/stores/github/useGitHubPrStatusStore.ts packages/ui/src/stores/mcp/useMcpConfigStore.ts packages/ui/src/stores/git/useGitIdentitiesStore.ts packages/ui/src/stores/config/useProviderConfigStore.ts packages/ui/src/stores/agents/useAgentConfigStore.ts packages/ui/src/stores/agents/useAgentsStore.ts
git commit -m "fix: add identity migrate functions to all Zustand persist stores"
```

---

### Task 4: Fix OPENCHAMBER-12/C — `Error: Directory not found` noise (31 events)

**Files:**
- Modify: `packages/ui/src/lib/opencode/client.ts`

**Context:** `listLocalDirectory()` logs a `console.error` and re-throws when a directory doesn't exist (line 1470, and similarly line 1437 for desktop). The error is already handled by callers like `useDirectoryStatusProbe.ts` which catches it and returns `'missing'`. The `console.error` is unnecessary noise forwarded to Sentry.

- [ ] **Step 1: Downgrade `console.error` to `console.warn` in `client.ts`**

Change two locations in `listLocalDirectory()`:

Line 1437 in the desktop API catch block:
```ts
// BEFORE:
console.error('Failed to list directory contents:', error);

// AFTER:
console.warn('Failed to list directory contents:', error);
```

Line 1470 in the HTTP API catch block:
```ts
// BEFORE:
console.error('Failed to list directory contents:', error);

// AFTER:
console.warn('Failed to list directory contents:', error);
```

Both Sentry init files only intercept `console.error`, not `console.warn`, so these will no longer reach Sentry.

- [ ] **Step 2: Verify with type-check and lint**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/opencode/client.ts
git commit -m "fix: downgrade directory probe errors from console.error to console.warn"
```

---

### Task 5: Add client-side `beforeSend` safety filter in `sentry.ts`

**Files:**
- Modify: `packages/ui/src/lib/sentry.ts`

**Context:** Even after fixing all source issues, future React warnings (key prop, HTML nesting) will still reach Sentry because the `console.error` interceptor forwards everything. Add a `beforeSend` filter as a safety net, dropping events that match known warning patterns. This gives us clean Sentry data while keeping the interceptor for genuine errors.

- [ ] **Step 1: Add `beforeSend` to `Sentry.init` in `sentry.ts`**

Insert after `dsn:` and before `environment:`:

```ts
Sentry.init({
  dsn: '...',
  beforeSend(event) {
    // Drop console.error interceptions that are known framework/library
    // warnings, not application errors. These are already logged to
    // the browser console and don't need Sentry attention.
    if (event.message) {
      const skipPatterns = [
        /^State loaded from storage couldn't be migrated/,
        /cannot be descendant of/,
        /cannot contain nested/,
        /^Each child in a list should have a unique "key" prop/,
        /^Warning: validateDOMNesting/,
      ];
      if (skipPatterns.some((p) => p.test(event.message))) {
        return null;
      }
    }
    return event;
  },
  environment: ...,
```

- [ ] **Step 2: Verify with type-check and lint**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/sentry.ts
git commit -m "fix: add beforeSend filter to suppress known framework warnings from Sentry"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full type-check and lint across all packages**

```bash
bun run type-check
bun run lint
```

Expected: both pass with zero errors.

- [ ] **Step 2: Review diff summary**

```bash
git diff main --stat
```

Expected: ~15 files changed, all in `packages/ui/src/` and `packages/web/server/`.
