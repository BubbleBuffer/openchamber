# Singleton Store Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the 14 top-level singleton zustand stores in `packages/ui/src/stores/` (out of 15; `useGlobalSessionsStore` is explicitly out of scope per spec) plus the pure helpers in `globalSessions.ts` with colocated `*.test.ts` files using `bun:test`. 15 new test files, 65-90 tests across 4 risk tiers.

**Architecture:** Colocated tests next to each store source file. `bun:test` (mirrors the existing `packages/ui/src/sync/*.test.ts` pattern — `bun test` auto-discovers `*.test.ts`). `happy-dom` imported per-file for persistence tests + `fileStore` DOM-needing tests. Real `getSafeStorage()` (already SSR-safe — falls back to an in-memory map when `window` is undefined, but using happy-dom gives us real `localStorage`). External module deps mocked via `mock.module()` where needed (`useCommandsStore`, `useMultiRunStore`).

**Tech Stack:** `bun:test`, `happy-dom` (new devDep on `packages/ui`), `zustand`, existing `persist` middleware. No new global config files, no `bunfig.toml`, no vitest config.

---

## Reference: pre-slice baseline

After the integration testing branch (commit `bdb39f8b` on main), `packages/ui/src/stores/` has zero tests. The `tests/` workspace already has vitest+integration tests (34 opencode + 19 web = 53 tests). This slice is fully separate from the `tests/` workspace and lives entirely under `packages/ui/src/stores/`.

Existing bun:test precedent in this codebase: 22 `.test.ts` files already pass under `bun test` (e.g., `packages/ui/src/sync/liveness.test.ts`). All use `import { ... } from "bun:test"`, no global setup, no config files.

---

## Process safety

Per AGENTS.md: No processes spawned by these tests. Pure unit tests. No `killall`/`pkill`/`pgrep` anywhere. No PID files. No subagents dispatched by implementers.

---

## Task 0: Infrastructure setup

**Files:**
- Modify: `/home/breadcat/Projects/openchamber/packages/ui/package.json` — add `"test:stores"` script (after `lint`) + `"happy-dom"` devDep (alphabetical position in devDependencies)
- Modify: `/home/breadcat/Projects/openchamber/package.json` (root) — add `"test:stores"` script (after `test:react`)

- [ ] **Step 1: Add `"test:stores"` script + `"happy-dom"` devDep to `packages/ui/package.json`**

In `packages/ui/package.json`, in the `"scripts"` block (currently `"dev"`, `"build"`, `"type-check"`, `"lint"`), insert `"test:stores": "bun test src/stores"` after `"lint"`.

In the `"devDependencies"` block, insert `"happy-dom": "^15.11.7"` after `"globals": "^16.5.0"` (alphabetical position between `globals` and `nodemon`).

- [ ] **Step 2: Add `"test:stores"` script to root `package.json`**

In `/home/breadcat/Projects/openchamber/package.json`, in the `"scripts"` block (currently `"test:react"`, `"test:perf"`, `"test:integration:slow"`), insert `"test:stores": "bun run --cwd packages/ui test:stores"` after `"test:react"`.

- [ ] **Step 3: Install `happy-dom`**

```bash
bun install
```

Expected: `happy-dom` appears in `packages/ui/node_modules/`. No errors. Lockfile updated.

- [ ] **Step 4: Verify the script resolves**

```bash
bun run --cwd packages/ui test:stores --dry-run 2>&1 | head -5
```

Expected: bun's help output for `bun test` (since `--dry-run` may not be supported, alternative verification: `cat packages/ui/node_modules/happy-dom/package.json | head -3` to confirm install).

**Fallback verification:**

```bash
bun pm ls --filter @openchamber/ui 2>&1 | grep -E "happy-dom" || cat packages/ui/package.json | grep -E "test:stores"
```

Expected: `test:stores` script present in the dumped `package.json` content.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/package.json package.json bun.lock bun.lockb 2>/dev/null
git commit -m "test(ui): add test:stores script and happy-dom devDep"
```

(`bun.lockb` may or may not exist; add it if present.)

---

## Task 1: Tier 1 — Pure state machines (3 files, ~35 tests)

**Files:**
- Create: `packages/ui/src/stores/useDialogStore.test.ts` — exhaustive action coverage (~30 tests)
- Create: `packages/ui/src/stores/useFeatureFlagsStore.test.ts` — 2 tests
- Create: `packages/ui/src/stores/useMagicPromptsStore.test.ts` — 3 tests

### File 1: `useDialogStore.test.ts`

No external deps (only `zustand` + `zustand/middleware`). All tests are pure state machine — verify initial state, set/toggle pairs.

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { useDialogStore } from "./useDialogStore";

const initialState = {
  isQuickOpenOpen: false,
  isCommandPaletteOpen: false,
  isHelpDialogOpen: false,
  isAboutDialogOpen: false,
  isOpenCodeStatusDialogOpen: false,
  openCodeStatusText: "",
  isSessionCreateDialogOpen: false,
  isScheduledTasksDialogOpen: false,
  isSettingsDialogOpen: false,
  isModelSelectorOpen: false,
  isTimelineDialogOpen: false,
  isImagePreviewOpen: false,
  isMultiRunLauncherOpen: false,
  multiRunLauncherPrefillPrompt: "",
};

describe("useDialogStore", () => {
  beforeEach(() => {
    useDialogStore.setState(initialState, false);
  });

  describe("initial state", () => {
    it("all boolean dialogs default to false", () => {
      const state = useDialogStore.getState();
      expect(state.isQuickOpenOpen).toBe(false);
      expect(state.isCommandPaletteOpen).toBe(false);
      expect(state.isHelpDialogOpen).toBe(false);
      expect(state.isAboutDialogOpen).toBe(false);
      expect(state.isOpenCodeStatusDialogOpen).toBe(false);
      expect(state.isSessionCreateDialogOpen).toBe(false);
      expect(state.isScheduledTasksDialogOpen).toBe(false);
      expect(state.isSettingsDialogOpen).toBe(false);
      expect(state.isModelSelectorOpen).toBe(false);
      expect(state.isTimelineDialogOpen).toBe(false);
      expect(state.isImagePreviewOpen).toBe(false);
      expect(state.isMultiRunLauncherOpen).toBe(false);
      expect(state.openCodeStatusText).toBe("");
      expect(state.multiRunLauncherPrefillPrompt).toBe("");
    });
  });

  describe("set/toggle pairs", () => {
    it("setQuickOpenOpen sets the flag", () => {
      useDialogStore.getState().setQuickOpenOpen(true);
      expect(useDialogStore.getState().isQuickOpenOpen).toBe(true);
    });
    it("toggleQuickOpen flips the flag", () => {
      useDialogStore.getState().toggleQuickOpen();
      expect(useDialogStore.getState().isQuickOpenOpen).toBe(true);
      useDialogStore.getState().toggleQuickOpen();
      expect(useDialogStore.getState().isQuickOpenOpen).toBe(false);
    });
    it("setCommandPaletteOpen sets, toggleCommandPalette flips", () => {
      useDialogStore.getState().setCommandPaletteOpen(true);
      expect(useDialogStore.getState().isCommandPaletteOpen).toBe(true);
      useDialogStore.getState().toggleCommandPalette();
      expect(useDialogStore.getState().isCommandPaletteOpen).toBe(false);
    });
    it("setHelpDialogOpen sets, toggleHelpDialog flips", () => {
      useDialogStore.getState().setHelpDialogOpen(true);
      expect(useDialogStore.getState().isHelpDialogOpen).toBe(true);
      useDialogStore.getState().toggleHelpDialog();
      expect(useDialogStore.getState().isHelpDialogOpen).toBe(false);
    });
    it("setAboutDialogOpen sets the flag", () => {
      useDialogStore.getState().setAboutDialogOpen(true);
      expect(useDialogStore.getState().isAboutDialogOpen).toBe(true);
    });
    it("setOpenCodeStatusDialogOpen + setOpenCodeStatusText", () => {
      useDialogStore.getState().setOpenCodeStatusDialogOpen(true);
      useDialogStore.getState().setOpenCodeStatusText("hello");
      const s = useDialogStore.getState();
      expect(s.isOpenCodeStatusDialogOpen).toBe(true);
      expect(s.openCodeStatusText).toBe("hello");
    });
    it("setSessionCreateDialogOpen sets the flag", () => {
      useDialogStore.getState().setSessionCreateDialogOpen(true);
      expect(useDialogStore.getState().isSessionCreateDialogOpen).toBe(true);
    });
    it("setScheduledTasksDialogOpen sets the flag", () => {
      useDialogStore.getState().setScheduledTasksDialogOpen(true);
      expect(useDialogStore.getState().isScheduledTasksDialogOpen).toBe(true);
    });
    it("setSettingsDialogOpen sets the flag (false is no-op)", () => {
      useDialogStore.getState().setSettingsDialogOpen(true);
      expect(useDialogStore.getState().isSettingsDialogOpen).toBe(true);
      // setSettingsDialogOpen(false) is a no-op guard in this store; verify
      // that closing via setSettingsDialogOpen(false) does leave it false.
      useDialogStore.getState().setSettingsDialogOpen(false);
      expect(useDialogStore.getState().isSettingsDialogOpen).toBe(false);
    });
    it("setModelSelectorOpen sets the flag", () => {
      useDialogStore.getState().setModelSelectorOpen(true);
      expect(useDialogStore.getState().isModelSelectorOpen).toBe(true);
    });
    it("setTimelineDialogOpen sets the flag", () => {
      useDialogStore.getState().setTimelineDialogOpen(true);
      expect(useDialogStore.getState().isTimelineDialogOpen).toBe(true);
    });
    it("setImagePreviewOpen sets the flag", () => {
      useDialogStore.getState().setImagePreviewOpen(true);
      expect(useDialogStore.getState().isImagePreviewOpen).toBe(true);
    });
    it("setMultiRunLauncherOpen(true) preserves prefill", () => {
      useDialogStore.getState().setMultiRunLauncherOpen(true);
      expect(useDialogStore.getState().isMultiRunLauncherOpen).toBe(true);
      expect(useDialogStore.getState().multiRunLauncherPrefillPrompt).toBe("");
    });
    it("setMultiRunLauncherOpen(false) resets prefill", () => {
      useDialogStore.getState().setMultiRunLauncherOpen(true);
      useDialogStore.setState({ multiRunLauncherPrefillPrompt: "draft" });
      useDialogStore.getState().setMultiRunLauncherOpen(false);
      const s = useDialogStore.getState();
      expect(s.isMultiRunLauncherOpen).toBe(false);
      expect(s.multiRunLauncherPrefillPrompt).toBe("");
    });
    it("openMultiRunLauncher opens the launcher", () => {
      useDialogStore.getState().openMultiRunLauncher();
      expect(useDialogStore.getState().isMultiRunLauncherOpen).toBe(true);
    });
    it("openMultiRunLauncherWithPrompt opens with prefill", () => {
      useDialogStore.getState().openMultiRunLauncherWithPrompt("do thing");
      const s = useDialogStore.getState();
      expect(s.isMultiRunLauncherOpen).toBe(true);
      expect(s.multiRunLauncherPrefillPrompt).toBe("do thing");
    });
  });
});
```

### File 2: `useFeatureFlagsStore.test.ts`

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { useFeatureFlagsStore } from "./useFeatureFlagsStore";

describe("useFeatureFlagsStore", () => {
  beforeEach(() => {
    useFeatureFlagsStore.setState({ planModeEnabled: false }, false);
  });

  it("planModeEnabled defaults to false", () => {
    expect(useFeatureFlagsStore.getState().planModeEnabled).toBe(false);
  });

  it("setPlanModeEnabled updates the flag", () => {
    useFeatureFlagsStore.getState().setPlanModeEnabled(true);
    expect(useFeatureFlagsStore.getState().planModeEnabled).toBe(true);
    useFeatureFlagsStore.getState().setPlanModeEnabled(false);
    expect(useFeatureFlagsStore.getState().planModeEnabled).toBe(false);
  });
});
```

### File 3: `useMagicPromptsStore.test.ts`

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { useMagicPromptsStore } from "./useMagicPromptsStore";

describe("useMagicPromptsStore", () => {
  beforeEach(() => {
    useMagicPromptsStore.setState(
      { selectedPromptId: "git.commit.generate" },
      false,
    );
  });

  it("defaults to git.commit.generate", () => {
    expect(useMagicPromptsStore.getState().selectedPromptId).toBe(
      "git.commit.generate",
    );
  });

  it("setSelectedPromptId updates the id", () => {
    useMagicPromptsStore.getState().setSelectedPromptId("custom.prompt");
    expect(useMagicPromptsStore.getState().selectedPromptId).toBe("custom.prompt");
  });

  it("setSelectedPromptId with same id is a no-op (no re-render)", () => {
    useMagicPromptsStore.getState().setSelectedPromptId("git.commit.generate");
    // State reference should be unchanged — store returns the same state object.
    const refBefore = useMagicPromptsStore.getState();
    useMagicPromptsStore.getState().setSelectedPromptId("git.commit.generate");
    const refAfter = useMagicPromptsStore.getState();
    expect(refAfter).toBe(refBefore);
  });
});
```

### Verification (Task 1)

```bash
bun run --cwd packages/ui test:stores src/stores/useDialogStore.test.ts src/stores/useFeatureFlagsStore.test.ts src/stores/useMagicPromptsStore.test.ts
```

Expected: 35 pass (or whatever the sum is from the 3 files). All in <5s.

Full surface after Task 1: 35 of 65-90 tests.

### Commit

```bash
git add packages/ui/src/stores/useDialogStore.test.ts \
        packages/ui/src/stores/useFeatureFlagsStore.test.ts \
        packages/ui/src/stores/useMagicPromptsStore.test.ts
git commit -m "test(ui-stores): add Tier 1 pure state machine tests (dialog, feature flags, magic prompts)"
```

---

## Task 2: Tier 2 — Simple singletons (4 files, ~10 tests)

**Files:**
- Create: `packages/ui/src/stores/useUpdateStore.test.ts` — 2 tests
- Create: `packages/ui/src/stores/useDesktopSshStore.test.ts` — 2 tests
- Create: `packages/ui/src/stores/messageQueueStore.test.ts` — 3 tests
- Create: `packages/ui/src/stores/permissionStore.test.ts` — 3 tests

**Important pattern for Tier 2:** many of these stores have heavy external module imports (e.g., `useUpdateStore` imports `@/lib/desktop/desktop`, `useDesktopSshStore` imports `@/lib/desktop/desktopSsh`, `permissionStore` imports `@/sync/sync-refs` + `@/lib/opencode/client`). Tests that don't trigger those imports are smoke-only: focus on actions whose behavior is self-contained (e.g., `dismiss`, `reset`, `clearError`, `setQueueMode` when no sync store exists).

**Important persistence setup:** `messageQueueStore` and `permissionStore` both use `persist` middleware. Use `happy-dom` for those two files. The other two (`useUpdateStore`, `useDesktopSshStore`) don't use persist — no happy-dom needed.

### File 1: `useUpdateStore.test.ts` (no happy-dom)

Focus on `dismiss` and `reset` — both are self-contained (no external module calls).

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { useUpdateStore } from "./useUpdateStore";

const initialState = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  info: null,
  progress: null,
  error: null,
  runtimeType: null,
  lastChecked: null,
  nextCheckInSec: null,
};

describe("useUpdateStore", () => {
  beforeEach(() => {
    useUpdateStore.setState(initialState, false);
  });

  it("dismiss clears available + downloaded + info", () => {
    useUpdateStore.setState({
      available: true,
      downloaded: true,
      info: { available: true } as never,
    });
    useUpdateStore.getState().dismiss();
    const s = useUpdateStore.getState();
    expect(s.available).toBe(false);
    expect(s.downloaded).toBe(false);
    expect(s.info).toBe(null);
  });

  it("reset returns to initial state", () => {
    useUpdateStore.setState({
      checking: true,
      error: "boom",
      runtimeType: "desktop",
      lastChecked: 12345,
    });
    useUpdateStore.getState().reset();
    const s = useUpdateStore.getState();
    expect(s.checking).toBe(false);
    expect(s.error).toBe(null);
    expect(s.runtimeType).toBe(null);
    expect(s.lastChecked).toBe(null);
  });
});
```

### File 2: `useDesktopSshStore.test.ts` (no happy-dom)

Focus on `clearError` and `getStatus` (sync read).

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { useDesktopSshStore } from "./useDesktopSshStore";

describe("useDesktopSshStore", () => {
  beforeEach(() => {
    useDesktopSshStore.setState(
      {
        instances: [],
        statusesById: {},
        importCandidates: [],
        isLoading: false,
        isSaving: false,
        isImportsLoading: false,
        initialized: false,
        listenerReady: false,
        error: null,
      },
      false,
    );
  });

  it("clearError sets error to null", () => {
    useDesktopSshStore.setState({ error: "boom" });
    useDesktopSshStore.getState().clearError();
    expect(useDesktopSshStore.getState().error).toBe(null);
  });

  it("getStatus returns null for unknown id, returns entry for known id", () => {
    expect(useDesktopSshStore.getState().getStatus("nope")).toBe(null);
    useDesktopSshStore.setState({
      statusesById: { known: { id: "known", status: "connected" } as never },
    });
    expect(useDesktopSshStore.getState().getStatus("known")).toEqual({
      id: "known",
      status: "connected",
    });
  });
});
```

### File 3: `messageQueueStore.test.ts` (happy-dom + persistence)

```ts
import "happy-dom";
import { describe, it, expect, beforeEach } from "bun:test";
import { useMessageQueueStore } from "./messageQueueStore";

describe("messageQueueStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useMessageQueueStore.setState(
      { queuedMessages: {}, queueModeEnabled: true },
      false,
    );
  });

  it("addToQueue generates id + createdAt and stores under sessionId", () => {
    useMessageQueueStore.getState().addToQueue("sess-1", {
      content: "hello",
    });
    const queue = useMessageQueueStore.getState().getQueueForSession("sess-1");
    expect(queue).toHaveLength(1);
    expect(queue[0]?.content).toBe("hello");
    expect(typeof queue[0]?.id).toBe("string");
    expect(typeof queue[0]?.createdAt).toBe("number");
  });

  it("removeFromQueue drops a queued message by id", () => {
    const { addToQueue, removeFromQueue, getQueueForSession } =
      useMessageQueueStore.getState();
    addToQueue("sess-1", { content: "first" });
    const id = getQueueForSession("sess-1")[0]!.id;
    addToQueue("sess-1", { content: "second" });
    removeFromQueue("sess-1", id);
    const queue = getQueueForSession("sess-1");
    expect(queue).toHaveLength(1);
    expect(queue[0]?.content).toBe("second");
  });

  it("popToInput returns the message and removes it from the queue", () => {
    useMessageQueueStore.getState().addToQueue("sess-1", {
      content: "draft",
    });
    const id = useMessageQueueStore.getState().getQueueForSession("sess-1")[0]!
      .id;
    const popped = useMessageQueueStore.getState().popToInput("sess-1", id);
    expect(popped?.content).toBe("draft");
    expect(useMessageQueueStore.getState().getQueueForSession("sess-1")).toEqual(
      [],
    );
  });
});
```

### File 4: `permissionStore.test.ts` (happy-dom + persistence)

`setSessionAutoAccept` POSTs to the server — **skip that test**. Focus on `isSessionAutoAccepting` and direct state mutation.

```ts
import "happy-dom";
import { describe, it, expect, beforeEach } from "bun:test";
import { usePermissionStore } from "./permissionStore";

describe("permissionStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePermissionStore.setState({ autoAccept: {} }, false);
  });

  it("isSessionAutoAccepting returns false for unknown session", () => {
    expect(
      usePermissionStore.getState().isSessionAutoAccepting("nope"),
    ).toBe(false);
  });

  it("isSessionAutoAccepting returns true when session is marked accepting", () => {
    usePermissionStore.setState({
      autoAccept: { "sess-1": true },
    });
    expect(
      usePermissionStore.getState().isSessionAutoAccepting("sess-1"),
    ).toBe(true);
  });

  it("autoAccept persists across getState/setState cycles via storage", () => {
    usePermissionStore.setState({ autoAccept: { "sess-x": true } });
    // Persistence write is async; verify the localStorage entry shape.
    const raw = window.localStorage.getItem("permission-store");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.autoAccept).toEqual({ "sess-x": true });
  });
});
```

### Verification (Task 2)

```bash
bun run --cwd packages/ui test:stores src/stores/useUpdateStore.test.ts \
  src/stores/useDesktopSshStore.test.ts \
  src/stores/messageQueueStore.test.ts \
  src/stores/permissionStore.test.ts
```

Expected: 10 pass, all in <10s.

Full surface after Task 2: ~45 of 65-90 tests.

### Commit

```bash
git add packages/ui/src/stores/useUpdateStore.test.ts \
        packages/ui/src/stores/useDesktopSshStore.test.ts \
        packages/ui/src/stores/messageQueueStore.test.ts \
        packages/ui/src/stores/permissionStore.test.ts
git commit -m "test(ui-stores): add Tier 2 simple singleton smoke tests"
```

---

## Task 3: Tier 3 — Complex stable (5 files, ~17-21 tests)

**Files:**
- Create: `packages/ui/src/stores/useTodosPersistStore.test.ts` — 4 tests
- Create: `packages/ui/src/stores/contextStore.test.ts` — 3 tests
- Create: `packages/ui/src/stores/useInlineCommentDraftStore.test.ts` — 5 tests
- Create: `packages/ui/src/stores/useCommandsStore.test.ts` — 3 tests (mocked)
- Create: `packages/ui/src/stores/useMultiRunStore.test.ts` — 4 tests (mocked)

### File 1: `useTodosPersistStore.test.ts` (happy-dom + persistence)

Pin: roundtrip, eviction, clearing, basic behavior. `MAX_SESSIONS = 50`.

```ts
import "happy-dom";
import { describe, it, expect, beforeEach } from "bun:test";
import { useTodosPersistStore } from "./useTodosPersistStore";
import type { Todo } from "@/lib/opencode/client";

const makeTodo = (id: string): Todo => ({
  id,
  content: `task ${id}`,
  status: "pending",
  priority: "medium",
});

describe("useTodosPersistStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTodosPersistStore.setState({ sessions: {} }, false);
  });

  it("setSessionTodos + getSessionTodos roundtrips via state", () => {
    const todos = [makeTodo("t1"), makeTodo("t2")];
    useTodosPersistStore.getState().setSessionTodos("sess-1", todos);
    expect(useTodosPersistStore.getState().getSessionTodos("sess-1")).toEqual(
      todos,
    );
  });

  it("setSessionTodos with empty array deletes the session key", () => {
    useTodosPersistStore
      .getState()
      .setSessionTodos("sess-1", [makeTodo("t1")]);
    expect(
      useTodosPersistStore.getState().getSessionTodos("sess-1"),
    ).toHaveLength(1);
    useTodosPersistStore.getState().setSessionTodos("sess-1", []);
    expect(
      useTodosPersistStore.getState().getSessionTodos("sess-1"),
    ).toBeUndefined();
  });

  it("evicts oldest session when exceeding MAX_SESSIONS (50)", () => {
    const store = useTodosPersistStore.getState();
    // Insert 51 sessions; the oldest (sess-0) should be evicted.
    for (let i = 0; i < 51; i++) {
      store.setSessionTodos(`sess-${i}`, [makeTodo(`t-${i}`)]);
    }
    const state = useTodosPersistStore.getState();
    expect(Object.keys(state.sessions)).toHaveLength(50);
    expect(state.getSessionTodos("sess-0")).toBeUndefined();
    expect(state.getSessionTodos("sess-50")).toBeDefined();
  });

  it("touchedAt updates on subsequent sets, preserving most-recent", () => {
    useTodosPersistStore.getState().setSessionTodos("sess-1", [makeTodo("t1")]);
    const firstTouch = useTodosPersistStore.getState().sessions["sess-1"]!.touchedAt;
    // Small delay to ensure Date.now() advances.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        useTodosPersistStore
          .getState()
          .setSessionTodos("sess-1", [makeTodo("t1"), makeTodo("t2")]);
        const secondTouch =
          useTodosPersistStore.getState().sessions["sess-1"]!.touchedAt;
        expect(secondTouch).toBeGreaterThanOrEqual(firstTouch);
        resolve();
      }, 5);
    });
  });
});
```

### File 2: `contextStore.test.ts` (happy-dom + persistence)

Pin: `sessionModelSelections` Map roundtrip + rehydration. Skip complex methods (`pollForTokenUpdates`, `getContextUsage`).

```ts
import "happy-dom";
import { describe, it, expect, beforeEach } from "bun:test";
import { useContextStore } from "./contextStore";

describe("contextStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useContextStore.setState(useContextStore.getInitialState(), false);
  });

  it("saveSessionModelSelection + getSessionModelSelection roundtrips", () => {
    useContextStore
      .getState()
      .saveSessionModelSelection("sess-1", "anthropic", "claude-sonnet-4");
    expect(useContextStore.getState().getSessionModelSelection("sess-1")).toEqual(
      { providerId: "anthropic", modelId: "claude-sonnet-4" },
    );
  });

  it("saveSessionAgentSelection + getSessionAgentSelection roundtrips", () => {
    useContextStore.getState().saveSessionAgentSelection("sess-1", "build");
    expect(useContextStore.getState().getSessionAgentSelection("sess-1")).toBe(
      "build",
    );
  });

  it("hasHydrated flag is observable in state", () => {
    expect(typeof useContextStore.getState().hasHydrated).toBe("boolean");
  });
});
```

### File 3: `useInlineCommentDraftStore.test.ts` (happy-dom + persistence)

```ts
import "happy-dom";
import { describe, it, expect, beforeEach } from "bun:test";
import { useInlineCommentDraftStore } from "./useInlineCommentDraftStore";
import type { InlineCommentDraft } from "./useInlineCommentDraftStore";

const makeDraft = (overrides: Partial<InlineCommentDraft> = {}): Omit<InlineCommentDraft, "id" | "createdAt"> => ({
  sessionKey: "sess-1",
  source: "diff",
  fileLabel: "foo.ts",
  startLine: 1,
  endLine: 2,
  code: "code",
  language: "ts",
  text: "comment text",
  ...overrides,
});

describe("useInlineCommentDraftStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useInlineCommentDraftStore.setState({ drafts: {} }, false);
  });

  it("addDraft stores a draft under sessionKey with generated id + createdAt", () => {
    useInlineCommentDraftStore.getState().addDraft(makeDraft());
    const drafts = useInlineCommentDraftStore.getState().getDrafts("sess-1");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.sessionKey).toBe("sess-1");
    expect(drafts[0]?.source).toBe("diff");
    expect(typeof drafts[0]?.id).toBe("string");
    expect(typeof drafts[0]?.createdAt).toBe("number");
  });

  it("consumeDrafts returns sorted-by-createdAt and clears the session", async () => {
    const { addDraft, consumeDrafts } = useInlineCommentDraftStore.getState();
    addDraft(makeDraft({ text: "first" }));
    await new Promise((r) => setTimeout(r, 2));
    addDraft(makeDraft({ text: "second" }));
    const consumed = consumeDrafts("sess-1");
    expect(consumed).toHaveLength(2);
    expect(consumed[0]?.text).toBe("first");
    expect(consumed[1]?.text).toBe("second");
    expect(useInlineCommentDraftStore.getState().getDrafts("sess-1")).toEqual(
      [],
    );
  });

  it("clearDrafts removes the sessionKey entirely", () => {
    useInlineCommentDraftStore.getState().addDraft(makeDraft());
    expect(useInlineCommentDraftStore.getState().hasDrafts("sess-1")).toBe(true);
    useInlineCommentDraftStore.getState().clearDrafts("sess-1");
    expect(useInlineCommentDraftStore.getState().hasDrafts("sess-1")).toBe(false);
  });

  it("updateDraft mutates a draft in place by id", () => {
    const { addDraft, updateDraft, getDrafts } =
      useInlineCommentDraftStore.getState();
    addDraft(makeDraft({ text: "original" }));
    const id = getDrafts("sess-1")[0]!.id;
    updateDraft("sess-1", id, { text: "updated" });
    expect(getDrafts("sess-1")[0]?.text).toBe("updated");
    // Untouched fields are preserved.
    expect(getDrafts("sess-1")[0]?.source).toBe("diff");
    expect(getDrafts("sess-1")[0]?.id).toBe(id);
  });

  it("removeDraft drops the matching draft and removes the sessionKey when last", () => {
    const { addDraft, removeDraft, hasDrafts } =
      useInlineCommentDraftStore.getState();
    addDraft(makeDraft());
    const id = useInlineCommentDraftStore.getState().getDrafts("sess-1")[0]!.id;
    removeDraft("sess-1", id);
    expect(hasDrafts("sess-1")).toBe(false);
    expect(
      useInlineCommentDraftStore.getState().drafts["sess-1"],
    ).toBeUndefined();
  });

  it("getDraftCount returns the count for a sessionKey", () => {
    const { addDraft } = useInlineCommentDraftStore.getState();
    addDraft(makeDraft());
    addDraft(makeDraft());
    expect(useInlineCommentDraftStore.getState().getDraftCount("sess-1")).toBe(2);
    expect(useInlineCommentDraftStore.getState().getDraftCount("nope")).toBe(0);
  });
});
```

### File 4: `useCommandsStore.test.ts` (no happy-dom; use mock.module for `opencodeClient` + `useProjectsStore`)

The store calls `opencodeClient.experimental.command.list()` etc. Use `bun:test`'s `mock.module()` to stub these before importing.

```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock external modules BEFORE importing the store.
mock.module("@/lib/opencode/client", () => ({
  opencodeClient: {
    experimental: {
      command: {
        list: mock(async () => [
          { name: "init", scope: "user", isBuiltIn: true },
          { name: "review", scope: "user", isBuiltIn: true },
        ]),
        create: mock(async () => true),
        update: mock(async () => true),
        delete: mock(async () => true),
      },
    },
  },
}));

mock.module("@/stores/projects/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({ activeProject: null }),
    subscribe: () => () => {},
  },
}));

mock.module("@/lib/config/configUpdate", () => ({
  startConfigUpdate: () => {},
  finishConfigUpdate: () => {},
  updateConfigUpdateMessage: () => {},
}));

mock.module("@/lib/config/configSync", () => ({
  emitConfigChange: () => {},
  scopeMatches: () => true,
  subscribeToConfigChanges: () => () => {},
}));

const { useCommandsStore, isCommandBuiltIn } = await import("./useCommandsStore");

describe("useCommandsStore", () => {
  beforeEach(() => {
    useCommandsStore.setState(
      {
        selectedCommandName: null,
        commands: [],
        isLoading: false,
        commandDraft: null,
      },
      false,
    );
  });

  it("setSelectedCommand updates the selection", () => {
    useCommandsStore.getState().setSelectedCommand("init");
    expect(useCommandsStore.getState().selectedCommandName).toBe("init");
  });

  it("setCommandDraft sets and clears the draft", () => {
    useCommandsStore.getState().setCommandDraft({
      name: "x",
      scope: "user",
    });
    expect(useCommandsStore.getState().commandDraft?.name).toBe("x");
    useCommandsStore.getState().setCommandDraft(null);
    expect(useCommandsStore.getState().commandDraft).toBe(null);
  });

  it("getCommandByName finds a registered command", () => {
    useCommandsStore.setState({
      commands: [
        { name: "init", scope: "user", isBuiltIn: true },
        { name: "review", scope: "user", isBuiltIn: true },
      ],
    });
    expect(useCommandsStore.getState().getCommandByName("init")?.name).toBe(
      "init",
    );
    expect(useCommandsStore.getState().getCommandByName("nope")).toBeUndefined();
  });
});

describe("isCommandBuiltIn", () => {
  it("returns true for built-in commands", () => {
    expect(isCommandBuiltIn({ name: "init" })).toBe(true);
    expect(isCommandBuiltIn({ name: "review" })).toBe(true);
  });
  it("returns false for non built-in commands", () => {
    expect(isCommandBuiltIn({ name: "custom" })).toBe(false);
  });
});
```

### File 5: `useMultiRunStore.test.ts` (no happy-dom; use mock.module for `useProjectsStore` + `checkIsGitRepository`)

```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";

mock.module("@/stores/projects/useProjectsStore", () => ({
  useProjectsStore: {
    getState: () => ({
      activeProject: { id: "p1", worktree: "/repo" },
    }),
    subscribe: () => () => {},
  },
}));

mock.module("@/lib/git/gitApi", () => ({
  checkIsGitRepository: mock(async () => true),
}));

mock.module("@/lib/worktrees/worktreeManager", () => ({
  ProjectRef: class {},
}));

mock.module("@/lib/worktrees/worktreeCreate", () => ({
  createWorktreeWithDefaults: mock(async () => ({})),
  resolveRootTrackingRemote: mock(async () => "origin"),
}));

mock.module("@/lib/worktrees/worktreeStatus", () => ({
  getRootBranch: mock(async () => "main"),
}));

mock.module("@/lib/config/openchamberConfig", () => ({
  saveWorktreeSetupCommands: mock(async () => {}),
}));

mock.module("@/lib/opencode/client", () => ({
  opencodeClient: {
    session: {
      create: mock(async () => ({ data: { id: "sess-1" } })),
    },
    experimental: {
      session: {
        create: mock(async () => ({ data: { id: "sess-1" } })),
      },
    },
  },
}));

mock.module("@/sync/session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({}),
    setState: () => {},
  },
}));

mock.module("@/stores/files/useDirectoryStore", () => ({
  useDirectoryStore: {
    getState: () => ({ activeDirectory: "/repo" }),
    setState: () => {},
  },
}));

const { useMultiRunStore } = await import("./useMultiRunStore");

describe("useMultiRunStore", () => {
  beforeEach(() => {
    useMultiRunStore.setState({ isLoading: false, error: null }, false);
  });

  it("createMultiRun returns null + sets error when group name is empty", async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: "",
      prompt: "do thing",
      models: [{ providerID: "anthropic", modelID: "claude-sonnet-4" }],
    });
    expect(result).toBe(null);
    expect(useMultiRunStore.getState().error).toBe("Group name is required");
  });

  it("createMultiRun returns null + sets error when prompt is empty", async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: "grp",
      prompt: "",
      models: [{ providerID: "anthropic", modelID: "claude-sonnet-4" }],
    });
    expect(result).toBe(null);
    expect(useMultiRunStore.getState().error).toBe("Prompt is required");
  });

  it("createMultiRun returns null when models.length is 0", async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: "grp",
      prompt: "do thing",
      models: [],
    });
    expect(result).toBe(null);
    expect(useMultiRunStore.getState().error).toBe("Select at least 1 model");
  });

  it("clearError resets error to null", () => {
    useMultiRunStore.setState({ error: "boom" });
    useMultiRunStore.getState().clearError();
    expect(useMultiRunStore.getState().error).toBe(null);
  });
});
```

### Verification (Task 3)

```bash
bun run --cwd packages/ui test:stores src/stores/useTodosPersistStore.test.ts \
  src/stores/contextStore.test.ts \
  src/stores/useInlineCommentDraftStore.test.ts \
  src/stores/useCommandsStore.test.ts \
  src/stores/useMultiRunStore.test.ts
```

Expected: 19 pass (4 + 3 + 5 + 3 + 4), all in <15s.

Full surface after Task 3: ~64 of 65-90 tests.

### Commit

```bash
git add packages/ui/src/stores/useTodosPersistStore.test.ts \
        packages/ui/src/stores/contextStore.test.ts \
        packages/ui/src/stores/useInlineCommentDraftStore.test.ts \
        packages/ui/src/stores/useCommandsStore.test.ts \
        packages/ui/src/stores/useMultiRunStore.test.ts
git commit -m "test(ui-stores): add Tier 3 complex stable store tests (persistence + mocked externals)"
```

---

## Task 4: Tier 4 + helpers (3 files, ~10-13 tests)

**Files:**
- Create: `packages/ui/src/stores/useUIStore.test.ts` — 2 tests (sidebar toggle + clamp)
- Create: `packages/ui/src/stores/fileStore.test.ts` — 3 tests (string APIs only, happy-dom)
- Create: `packages/ui/src/stores/globalSessions.test.ts` — 6 tests (pure helpers)

### File 1: `useUIStore.test.ts` (no happy-dom; sidebar toggle)

Pin: `toggleSidebar` flips state. Document that the test will need updating when the planned `useUIStore` refactor lands.

```ts
import { describe, it, expect, beforeEach } from "bun:test";
import { useUIStore } from "./useUIStore";

describe("useUIStore (smoke — sidebar toggle)", () => {
  beforeEach(() => {
    // Reset just the sidebar-related fields; the store has ~60 fields and
    // this is a smoke test, not exhaustive coverage.
    useUIStore.setState(
      {
        isSidebarOpen: true,
        sidebarWidth: 300,
      },
      false,
    );
  });

  it("toggleSidebar flips isSidebarOpen", () => {
    const before = useUIStore.getState().isSidebarOpen;
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarOpen).toBe(!before);
  });

  it("setFontSize clamps to [50, 200]", () => {
    useUIStore.getState().setFontSize(500);
    expect(useUIStore.getState().fontSize).toBe(200);
    useUIStore.getState().setFontSize(10);
    expect(useUIStore.getState().fontSize).toBe(50);
  });
});
```

### File 2: `fileStore.test.ts` (happy-dom + persistence; string APIs only)

`addServerFile` reads from `/api/fs/raw` — needs `fetch` mock. For test simplicity, mock `fetch` per-test.

```ts
import "happy-dom";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useFileStore } from "./fileStore";

describe("fileStore (string-based APIs only)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useFileStore.setState({ attachedFiles: [] }, false);
  });

  afterEach(() => {
    // Restore global fetch in case a test stubbed it.
  });

  it("removeAttachedFile filters by id", () => {
    useFileStore.setState({
      attachedFiles: [
        {
          id: "a",
          file: null as never,
          dataUrl: "",
          mimeType: "image/png",
          filename: "a.png",
          size: 1,
          source: "server",
        },
        {
          id: "b",
          file: null as never,
          dataUrl: "",
          mimeType: "image/png",
          filename: "b.png",
          size: 1,
          source: "server",
        },
      ],
    });
    useFileStore.getState().removeAttachedFile("a");
    const remaining = useFileStore.getState().attachedFiles;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("b");
  });

  it("clearAttachedFiles empties the array", () => {
    useFileStore.setState({
      attachedFiles: [
        {
          id: "x",
          file: null as never,
          dataUrl: "",
          mimeType: "image/png",
          filename: "x.png",
          size: 1,
          source: "server",
        },
      ],
    });
    useFileStore.getState().clearAttachedFiles();
    expect(useFileStore.getState().attachedFiles).toEqual([]);
  });

  it("addServerFile dedupes by serverPath", async () => {
    // Stub fetch: fileStore.addServerFile calls fetch('/api/fs/raw?path=...')
    // for binary MIME types; for plain text, it uses `content` directly.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => "stub-content",
    })) as never;

    try {
      await useFileStore.getState().addServerFile("/repo/foo.ts", "foo.ts");
      const files = useFileStore.getState().attachedFiles;
      expect(files).toHaveLength(1);
      expect(files[0]?.filename).toBe("foo.ts");
      expect(files[0]?.source).toBe("server");
      expect(files[0]?.serverPath).toBe("/repo/foo.ts");

      // Second add with same serverPath is a no-op.
      await useFileStore.getState().addServerFile("/repo/foo.ts", "foo.ts");
      expect(useFileStore.getState().attachedFiles).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

### File 3: `globalSessions.test.ts` (pure helpers, no happy-dom)

```ts
import { describe, it, expect } from "bun:test";
import {
  readNextCursor,
  isMissingGlobalSessionsEndpointError,
} from "./globalSessions";

describe("readNextCursor", () => {
  it("returns parsed number from x-next-cursor header", () => {
    const response = {
      headers: { get: (name: string) => (name === "x-next-cursor" ? "42" : null) },
    };
    expect(readNextCursor(response)).toBe(42);
  });

  it("returns null when header missing", () => {
    const response = { headers: { get: () => null } };
    expect(readNextCursor(response)).toBe(null);
  });

  it("returns null for non-numeric header", () => {
    const response = {
      headers: { get: (name: string) => (name === "x-next-cursor" ? "abc" : null) },
    };
    expect(readNextCursor(response)).toBe(null);
  });

  it("returns null for non-object response", () => {
    expect(readNextCursor(null)).toBe(null);
    expect(readNextCursor(undefined)).toBe(null);
    expect(readNextCursor("string")).toBe(null);
  });

  it("supports plain-record headers", () => {
    const response = { headers: { "x-next-cursor": "99" } };
    expect(readNextCursor(response)).toBe(99);
  });
});

describe("isMissingGlobalSessionsEndpointError", () => {
  it("returns true for status 404", () => {
    expect(isMissingGlobalSessionsEndpointError({ status: 404 })).toBe(true);
  });

  it("returns true for status 405", () => {
    expect(isMissingGlobalSessionsEndpointError({ status: 405 })).toBe(true);
  });

  it("returns false for status 200", () => {
    expect(isMissingGlobalSessionsEndpointError({ status: 200 })).toBe(false);
  });

  it("returns false for non-object input", () => {
    expect(isMissingGlobalSessionsEndpointError(null)).toBe(false);
    expect(isMissingGlobalSessionsEndpointError(undefined)).toBe(false);
    expect(isMissingGlobalSessionsEndpointError("404")).toBe(false);
  });
});
```

### Verification (Task 4)

```bash
bun run --cwd packages/ui test:stores src/stores/useUIStore.test.ts \
  src/stores/fileStore.test.ts \
  src/stores/globalSessions.test.ts
```

Expected: 11 pass (2 + 3 + 6), all in <10s.

Full surface after Task 4: ~75 of 65-90 tests.

### Commit

```bash
git add packages/ui/src/stores/useUIStore.test.ts \
        packages/ui/src/stores/fileStore.test.ts \
        packages/ui/src/stores/globalSessions.test.ts
git commit -m "test(ui-stores): add Tier 4 smoke tests + globalSessions helpers"
```

---

## Task 5: Full-surface verification + forbidden-pattern audit

**Files:** none modified. Verification only.

- [ ] **Step 1: Run the full `test:stores` script 3 consecutive times**

```bash
for i in 1 2 3; do
  echo "=== Run $i ===";
  bun run test:stores 2>&1 | tail -25;
done
```

Expected: each run reports `~75 pass` (or whatever the actual total is, in the 65-90 range from the spec). No flakes across 3 runs. No skipped tests beyond any documented environmental skips.

- [ ] **Step 2: Verify total test count**

```bash
bun run test:stores 2>&1 | grep -E "^\s+(\([0-9]+ pass\)|[0-9]+ pass)" | tail -3
```

Expected: single line like `75 pass` (no failures, no skips).

- [ ] **Step 3: Forbidden-pattern grep audit (per AGENTS.md hard rule)**

```bash
git grep -nE "killall|pkill|pgrep" packages/ui/src/stores/*.test.ts
```

Expected: no output.

- [ ] **Step 4: Confirm `happy-dom` is the only new dep**

```bash
git diff main -- package.json packages/ui/package.json bun.lock 2>&1 | grep -E "^\+[^+]" | grep -vE "^\+\+\+|test:stores|happy-dom" | head -20
```

Expected: empty (only the `test:stores` script additions and `happy-dom` devDep should appear in the diff).

- [ ] **Step 5: Type-check + lint unchanged (baseline tolerated)**

```bash
bun run --cwd packages/ui type-check 2>&1 | tail -5
bun run --cwd packages/ui lint 2>&1 | tail -5
```

Expected: no NEW errors introduced by this work. Pre-existing baseline errors (`process` / `NodeJS` / `fs` type declarations) are tolerated and out of scope per the spec.

- [ ] **Step 6: Done — no commit unless docs were added**

If Steps 1-5 pass and no documentation was added, there is no commit for Task 5. The branch is ready to merge.

---

## Acceptance criteria (verification matrix)

| Criterion | How to verify | Expected |
|---|---|---|
| 15 `.test.ts` files exist | `ls packages/ui/src/stores/*.test.ts \| wc -l` | `15` |
| `test:stores` passes 3 consecutive runs | Task 5 Step 1 | all green |
| Total test count 65-90 | Task 5 Step 2 | matches per-file sum |
| Tiers match per-store expectations | Task 5 + per-task verification | each tier behaves per the spec |
| Type-check + lint + build pass | Task 5 Step 5 + `bun run build` | no NEW errors |
| Only new dep is `happy-dom` | Task 5 Step 4 | only `happy-dom` + script additions in diff |
| No `killall`/`pkill`/`pgrep` in tests | Task 5 Step 3 | empty grep output |

---

## Reviewer notes

The implementer subagent must:
- Use the exact test code shown in the plan for each file (full content provided)
- Run `bun run --cwd packages/ui test:stores <file>` after each test file is created
- Run `bun run --cwd packages/ui type-check` after each task (to catch type errors early)
- Commit each task separately (one commit per tier task)

The implementer subagent must NOT:
- Add any new npm dependencies beyond `happy-dom`
- Modify production store code (tests are read-only against stores)
- Dispatch any subagents itself
- Use `killall`/`pkill`/`pgrep` for any reason
- Skip the `import 'happy-dom'` pragma on persistence + fileStore test files

If a test fails unexpectedly (e.g., the actual store has a guard the spec didn't anticipate):
- Read the failing assertion and the relevant action source
- Document the adaptation inline in the test file as a comment
- Re-run; if it still fails, capture the error message in the commit message and stop

If a `mock.module()` call fails because the real module has additional exports the mock doesn't provide:
- Add `default: ...` to the mock object
- Or extend the mock to include the specific exports the real store uses at import time
- Document the extension inline