# Singleton Store Tests — Slice 1 of Stores Testing Strategy

> **For agentic workers:** This is a design document. It is approved and frozen. Implementation follows via `.superpawers/plans/2026-06-27-singleton-store-tests.md` (written next, after this spec is committed).

**Goal:** Cover the 15 top-level singleton zustand stores in `packages/ui/src/stores/` plus the pure helper functions in `globalSessions.ts`. Tier the coverage by risk: deep on complex / persistence-coupled stores, smoke on refactor-prone ones.

**Architecture:** Colocated `*.test.ts` files next to each store source file. `bun:test` (already the project's runtime for sync tests under `packages/ui/src/sync/*.test.ts`). No new test config. `happy-dom` imported per-file for persistence tests + `fileStore` DOM-needing tests. Real `getSafeStorage()` (already SSR-safe).

**Tech Stack:** `bun:test`, `happy-dom` (new devDep on `packages/ui`), `zustand`, existing `persist` middleware. No new global config files.

---

## Why this slice

`packages/ui/src/stores/` is split two ways:

1. **Domain subdirectories** — `agents/`, `config/`, `files/`, `git/`, `github/`, `mcp/`, `projects/`, `quota/`, `session/`, `skills/`, `terminal/`, `types/`, `utils/` — each their own bounded area, will become their own slice later.
2. **Top-level singletons** — 15 cross-cutting stores that any feature area can read/write. These are the cross-cutting client-state surface that the integration tests don't directly cover (integration tests exercise the API surface; these exercise the client state machine surface).

This slice covers (2). Slice 2+ will cover domain stores. Components (third slice) will live in `tests/react/` with vitest + happy-dom + Testing Library.

`useUIStore` (1648 lines) is slated for a major refactor separate from this work. We cover its most observable action(s) only — sidebar toggle — and accept that the test will need updating post-refactor. This is the leanest defensible coverage on a refactor-prone monolith.

---

## Scope: 16 test files, 65-90 tests

### Tier 1 — Pure state machines (exhaustive, ~35 tests)

Each action + setter in a clean boolean/flag store. Trivial to write, easy to maintain, catches regressions on hot UI state.

| File | Store | Tests | What we pin |
|---|---|---|---|
| `useDialogStore.test.ts` | `useDialogStore` | ~30 | All 14 boolean flags + 16 actions (set/toggle pairs) |
| `useFeatureFlagsStore.test.ts` | `useFeatureFlagsStore` | 2 | `isEnabled(name)` truthy/falsy path |
| `useMagicPromptsStore.test.ts` | `useMagicPromptsStore` | 3 | Add / list / clear |

### Tier 2 — Simple singletons (1-3 smoke tests, ~10 tests)

Stores that are pure logic but not pure state machines — message queueing, command registration, permission policy. Smoke tests on the most observable action(s).

| File | Store | Tests |
|---|---|---|
| `useUpdateStore.test.ts` | `useUpdateStore` | 1-2 |
| `useDesktopSshStore.test.ts` | `useDesktopSshStore` | 1-2 |
| `messageQueueStore.test.ts` | `messageQueueStore` | 2-3 |
| `permissionStore.test.ts` | `permissionStore` | 2-3 |

### Tier 3 — Complex stable stores (3-5 deep tests, ~20 tests)

Stores with non-trivial logic worth pinning: eviction, migration, Map roundtrips, keybind lookup, worktree paths.

| File | Store | Tests | What we pin |
|---|---|---|---|
| `useTodosPersistStore.test.ts` | `useTodosPersistStore` | 3-4 | Set + get roundtrip; eviction at `MAX_SESSIONS=50`; clearing on empty array; happy-path migration from `version: 1` |
| `contextStore.test.ts` | `contextStore` | 3-4 | Model selection roundtrip via Map; agent selection roundtrip; rehydrate from real localStorage; basic `hasHydrated` flag transition |
| `useInlineCommentDraftStore.test.ts` | `useInlineCommentDraftStore` | 4-5 | `addDraft` roundtrip; `consumeDrafts` returns sorted by `createdAt` + clears; `clearDrafts` removes session key; migration sanitizes invalid drafts (load-bearing) |
| `useCommandsStore.test.ts` | `useCommandsStore` | 3-5 | Command registration; keybind lookup; execution path through registered handler; replacement of duplicate registrations |
| `useMultiRunStore.test.ts` | `useMultiRunStore` | 3-5 | Worktree happy-path with `mock.module` for external stores; basic add/remove lifecycle |

### Tier 4 — Refactor-prone / smoke (~5 tests)

| File | Store | Tests | Notes |
|---|---|---|---|
| `useUIStore.test.ts` | `useUIStore` | 1-2 | Sidebar toggle (most observable action). Test is expected to break during the planned refactor — that's the signal. |
| `fileStore.test.ts` | `fileStore` | 2-3 | String-based APIs only: `addServerFile(path, name, content?)`, `removeAttachedFile(id)`, `clearAttachedFiles()`. **Skip `addAttachedFile(file: File)`** — that needs the real `File` API; deferred to component slice. |

### globalSessions.ts helpers (~6-10 tests)

`globalSessions.ts` is a utility module, not a zustand store. Pure function tests.

| Helper | Tests | What we pin |
|---|---|---|
| `readNextCursor` | 3 | Valid header → number; missing header → null; non-numeric header → null |
| `isMissingGlobalSessionsEndpointError` | 2-3 | True on `status: 404` / `status: 405`; false on `status: 200`; false on non-object input |
| Others in the file | 1-4 | Whatever pure helpers exist (verified during impl) |

---

## Persistence & DOM handling

Both `useTodosPersistStore` and `contextStore` use `persist` middleware with `getSafeStorage()`. Tests use the **real** `getSafeStorage()` — it's already SSR-safe (it falls back to a noop storage when `window` is undefined).

Pattern for persistence tests:

```ts
import 'happy-dom';
import { describe, it, expect, beforeEach } from 'bun:test';
import { useTodosPersistStore } from './useTodosPersistStore';

describe('useTodosPersistStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTodosPersistStore.setState(useTodosPersistStore.getInitialState(), true);
  });

  it('roundtrips a session\'s todos via persistence', () => {
    // ...
  });
});
```

`happy-dom` is imported at the top of persistence test files only. Loads in single-digit ms; no global setup, no bunfig, no vitest config.

`fileStore.test.ts` follows the same `happy-dom` import pattern but skips `addAttachedFile(file: File)` since that path requires the real browser `File` API (not just `File`-shaped objects). Deferred to component slice, where a real DOM environment will exist.

---

## Execution & CI

- **`packages/ui/package.json`** gets `"test:stores": "bun test packages/ui/src/stores"` script + `"happy-dom"` devDep.
- **Root `package.json`** gets `"test:stores": "bun run --cwd packages/ui test:stores"` script, mirroring the existing `test:integration` / `test:web` / `test:react` pattern.
- **`verify.sh`** is **unchanged**. Adding `test:stores` to the full verify would slow CI for a one-shot scope (it's the first of several slices; full-suite integration of test commands is deferred until stores + components slices both ship).
- **No `bunfig.toml`**, no vitest config, no global preload. `happy-dom` import is per-file only.

---

## Acceptance criteria

Done when:

1. **16 `.test.ts` files exist** in `packages/ui/src/stores/` (15 stores + `globalSessions.test.ts`).
2. **`bun run test:stores` passes 3 consecutive runs** without flakes, no skipped tests beyond documented environmental skips.
3. **Total test count is 65-90** (matches the tier breakdown above).
4. **Tiers match per-store expectations** — exhaustive on Tier 1, smoke on Tier 2, deep on Tier 3 invariants, minimal on Tier 4.
5. **`bun run type-check` and `bun run lint` and `bun run build` all pass** (no new errors introduced by this work).
6. **Only new dep is `happy-dom`** as a devDep on `packages/ui`. No new transitive deps, no new config files.

---

## Out of scope (explicit)

- **Domain stores** under `stores/{agents,session,terminal,config,files,git,github,mcp,projects,quota,skills,types,utils}/` — each its own future slice.
- **`useGlobalSessionsStore`** (the real zustand store backing `globalSessions.ts` helpers) — likely belongs with the session domain slice, not this one.
- **React component tests** — separate slice, lives in `tests/react/` workspace with vitest + happy-dom + Testing Library.
- **`useMultiRunStore` deep API integration** — happy-path worktree only in this slice; real OpenCode/worktree API integration in a later slice.
- **`fileStore.addAttachedFile(file: File)`** — needs real DOM `File` API; deferred to component slice.
- **No changes to `packages/ui/src/sync/`** — sync tests already exist, follow same colocated bun:test pattern.
- **No changes to `tests/` workspace** — that workspace stays vitest+integration-only.
- **No `useUIStore` refactor** — separate future work; the single sidebar-toggle test will break on purpose during that refactor.

---

## Verification

- `bun run --cwd packages/ui test:stores` — 65-90 pass, 3 consecutive clean runs
- `bun run type-check` — pre-existing baseline errors on `process` / `NodeJS` / `fs` remain unchanged (out of scope for this slice; documented in AGENTS.md is preferred over fixing here)
- `bun run lint` — clean
- `bun run build` — clean
- `git grep -nE "killall|pkill|pgrep" packages/ui/src/stores/*.test.ts` — no matches (per AGENTS.md hard rule)
- `git status` clean on `feature/singleton-store-tests` after merge

---

## Process cleanup

No processes spawned. Pure unit tests. No PID files, no watchdog, no reaper. Nothing to clean up beyond `localStorage.clear()` in `beforeEach` for persistence tests.