# Test and Benchmark Catch-Up Plan 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first shell-runtime seam coverage for Electron and VS Code without launching Electron, VS Code, or OpenCode processes.

**Architecture:** Electron coverage is source-contract testing because `main.mjs` has top-level Electron side effects and cannot be imported safely without extraction. VS Code coverage imports the already-exported `handleBridgeMessage` through Bun tests with module mocks for `vscode` and bridge runtimes, exercising bridge dispatch behavior directly.

**Tech Stack:** Node built-in `node:test` for Electron `.mjs` source-contract tests and `bun:test` for VS Code TypeScript bridge tests. Run these with direct commands instead of package scripts so this test-only slice does not touch already-dirty package manifests.

---

## File Structure

- Create: `packages/electron/__tests__/preload-contract.test.mjs` — asserts preload exposes the expected `__TAURI__`/desktop globals and IPC channels by source contract.
- Create: `packages/electron/__tests__/remote-ipc-gate.test.mjs` — asserts `main.mjs` keeps the remote-origin command allowlist narrow and gates `openchamber:invoke`.
- Create: `packages/vscode/src/bridges/__tests__/bridge-dispatch.test.ts` — Bun test for `handleBridgeMessage` dispatch order, GitHub disabled responses, unknown messages, and error capture.

## Hard Constraints

- Do not launch Electron.
- Do not launch VS Code or an extension host.
- Do not spawn OpenCode.
- Do not add `pgrep`, `pkill`, `killall`, or process-name matching.
- Do not add dependencies or new test runners.

---

### Task 1: Add Electron Source-Contract Tests

**Files:**
- Create: `packages/electron/__tests__/preload-contract.test.mjs`
- Create: `packages/electron/__tests__/remote-ipc-gate.test.mjs`
- Read: `packages/electron/preload.mjs`
- Read: `packages/electron/main.mjs`

- [ ] **Step 1: Create preload contract test**

Create `packages/electron/__tests__/preload-contract.test.mjs` with this complete target content:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, '..', 'preload.mjs');

const readPreload = () => fs.readFile(preloadPath, 'utf8');

describe('Electron preload contract', () => {
  it('exposes desktop identity and local metadata globals', async () => {
    const source = await readPreload();
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_ELECTRON__'/);
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_LOCAL_ORIGIN__'/);
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_HOME__'/);
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_MACOS_MAJOR__'/);
  });

  it('maps __TAURI__.core.invoke to the openchamber invoke channel', async () => {
    const source = await readPreload();
    assert.match(source, /exposeInMainWorld\('__TAURI__'/);
    assert.match(source, /core:\s*{[\s\S]*invoke:\s*\(cmd, args\)\s*=>\s*ipcRenderer\.invoke\('openchamber:invoke', cmd, args \|\| {}\)/);
  });

  it('keeps dialog and event APIs on their expected IPC contracts', async () => {
    const source = await readPreload();
    assert.match(source, /dialog:\s*{[\s\S]*open:\s*\(options\)\s*=>\s*ipcRenderer\.invoke\('openchamber:dialog:open', options \|\| {}\)/);
    assert.match(source, /event:\s*{[\s\S]*listen:\s*async \(event, handler\)\s*=>\s*addListener\(event, handler\)/);
    assert.match(source, /ipcRenderer\.on\('openchamber:emit'/);
    assert.match(source, /dispatchNativeEvent\(event, payload\.detail\)/);
  });
});
```

- [ ] **Step 2: Create remote IPC gate test**

Create `packages/electron/__tests__/remote-ipc-gate.test.mjs` with this complete target content:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPath = path.join(__dirname, '..', 'main.mjs');

const readMain = () => fs.readFile(mainPath, 'utf8');

const extractRemoteSafeCommands = (source) => {
  const match = source.match(/const COMMANDS_SAFE_FOR_REMOTE = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, 'COMMANDS_SAFE_FOR_REMOTE block should exist');
  return new Set(Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1]));
};

describe('Electron remote IPC gate contract', () => {
  it('allows only low-risk window and host-switcher commands for remote origins', async () => {
    const commands = extractRemoteSafeCommands(await readMain());
    for (const command of [
      'desktop_hosts_get',
      'desktop_host_probe',
      'desktop_new_window',
      'desktop_new_window_at_url',
      'desktop_set_window_title',
      'desktop_set_window_theme',
      'desktop_is_window_fullscreen',
      'desktop_start_window_drag',
      'desktop_get_app_version',
      'desktop_get_lan_address',
    ]) {
      assert.equal(commands.has(command), true, `${command} should remain remote-safe`);
    }
  });

  it('does not allow local file, shell, notification, or update commands remotely', async () => {
    const commands = extractRemoteSafeCommands(await readMain());
    for (const command of [
      'desktop_read_file',
      'desktop_save_markdown_file',
      'desktop_open_path',
      'desktop_reveal_path',
      'desktop_open_in_app',
      'desktop_open_file_in_app',
      'desktop_notify',
      'desktop_check_for_updates',
      'desktop_install_update',
      'desktop_ssh_start',
    ]) {
      assert.equal(commands.has(command), false, `${command} must not be remote-safe`);
    }
  });

  it('guards openchamber:invoke before dispatching to handleInvoke', async () => {
    const source = await readMain();
    assert.match(source, /ipcMain\.handle\('openchamber:invoke'/);
    assert.match(source, /!isLocalSender\(event\.sender\)\s*&&\s*!COMMANDS_SAFE_FOR_REMOTE\.has\(command\)/);
    assert.match(source, /throw new Error\('IPC not available for this origin'\)/);
    assert.match(source, /return handleInvoke\(browserWindow, command, args\)/);
  });
});
```

Notes:
- These tests intentionally do not import `main.mjs` or `preload.mjs`; importing would execute Electron top-level side effects.
- This is a first seam test. A later refactor can extract pure IPC gate helpers and replace source-contract tests with direct unit tests.

- [ ] **Step 3: Verify Electron seam tests**

Run: `node --test packages/electron/__tests__/*.test.mjs`

Expected: PASS, 6 tests, no Electron process launched.

Run: `bun run --cwd packages/electron type-check`

Expected: PASS.

- [ ] **Step 4: Commit Electron tests**

```bash
git add packages/electron/__tests__/preload-contract.test.mjs packages/electron/__tests__/remote-ipc-gate.test.mjs
git commit -m "test(electron): cover shell IPC contracts"
```

---

### Task 2: Add VS Code Bridge Dispatch Tests

**Files:**
- Create: `packages/vscode/src/bridges/__tests__/bridge-dispatch.test.ts`
- Read: `packages/vscode/src/bridges/bridge.ts`

- [ ] **Step 1: Create bridge dispatch test**

Create `packages/vscode/src/bridges/__tests__/bridge-dispatch.test.ts` with this target-state sketch:

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test"

const standardGitHandler = mock(async () => null)
const specialGitHandler = mock(async () => null)
const fsHandler = mock(async () => null)
const configHandler = mock(async () => null)
const systemHandler = mock(async () => null)
const proxyHandler = mock(async () => null)

mock.module("vscode", () => ({
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: () => undefined }),
  },
  Uri: { file: (value: string) => ({ fsPath: value }) },
}))

mock.module("../bridge-git-runtime", () => ({
  handleStandardGitBridgeMessage: standardGitHandler,
}))
mock.module("../bridge-git-special-runtime", () => ({
  handleSpecialGitBridgeMessage: specialGitHandler,
}))
mock.module("../bridge-fs-runtime", () => ({
  handleFsBridgeMessage: fsHandler,
}))
mock.module("../bridge-config-runtime", () => ({
  handleConfigBridgeMessage: configHandler,
}))
mock.module("../bridge-system-runtime", () => ({
  handleSystemBridgeMessage: systemHandler,
}))
mock.module("../bridge-proxy-runtime", () => ({
  handleProxyBridgeMessage: proxyHandler,
}))
mock.module("../bridge-settings-runtime", () => ({
  fetchOpenCodeSkillsFromApi: mock(async () => []),
  persistSettings: mock(async (changes: Record<string, unknown>) => changes),
  readSettings: mock(() => ({})),
  readMagicPromptOverrides: mock(() => ({ version: 1, overrides: {} })),
  saveMagicPromptOverride: mock(async () => ({ version: 1, overrides: {} })),
  resetMagicPromptOverride: mock(async () => ({ version: 1, overrides: {} })),
  resetAllMagicPromptOverrides: mock(async () => ({ version: 1, overrides: {} })),
}))
mock.module("../bridge-git-process-runtime", () => ({ execGit: mock(async () => ({ stdout: "", stderr: "", exitCode: 0 })) }))
mock.module("../bridge-fs-helpers-runtime", () => ({
  parseDroppedFileReference: mock(() => ({ skipped: { name: "", reason: "" } })),
  readUriAsAttachment: mock(async () => ({ skipped: { name: "", reason: "" } })),
  resolveUserPath: mock((value: string) => value),
  listDirectoryEntries: mock(async () => []),
  normalizeFsPath: mock((value: string) => value),
  searchDirectory: mock(async () => []),
  resolveFileReadPath: mock(async (value: string) => ({ ok: true, resolvedPath: value })),
  fetchModelsMetadata: mock(async () => ({})),
}))
mock.module("../bridge-localfs-proxy-runtime", () => ({
  tryHandleLocalFsProxy: mock(async () => null),
  buildUnavailableApiResponse: mock(() => ({ status: 503, headers: {}, bodyBase64: "" })),
  sanitizeForwardHeaders: mock((headers?: Record<string, string>) => headers ?? {}),
  collectHeaders: mock(() => ({})),
  base64EncodeUtf8: mock((value: string) => Buffer.from(value, "utf8").toString("base64")),
}))

const { handleBridgeMessage } = await import("../bridge")

beforeEach(() => {
  for (const handler of [standardGitHandler, specialGitHandler, fsHandler, configHandler, systemHandler, proxyHandler]) {
    handler.mockClear()
    handler.mockImplementation(async () => null)
  }
})

describe("handleBridgeMessage", () => {
  it("returns the first standard git runtime response", async () => {
    standardGitHandler.mockImplementationOnce(async ({ id, type }) => ({ id, type, success: true, data: "git" }))
    const response = await handleBridgeMessage({ id: "1", type: "api:git/check", payload: { directory: "/repo" } })
    expect(response).toEqual({ id: "1", type: "api:git/check", success: true, data: "git" })
    expect(specialGitHandler).not.toHaveBeenCalled()
  })

  it("falls through runtimes and returns the GitHub-disabled error", async () => {
    const response = await handleBridgeMessage({ id: "2", type: "api:github/pr:create" })
    expect(response.success).toBe(false)
    expect(response.error).toContain("GitHub integration is disabled")
    expect(proxyHandler).toHaveBeenCalled()
  })

  it("returns an unknown message error for unhandled types", async () => {
    const response = await handleBridgeMessage({ id: "3", type: "unknown:thing" })
    expect(response).toEqual({ id: "3", type: "unknown:thing", success: false, error: "Unknown message type: unknown:thing" })
  })

  it("captures runtime exceptions as bridge errors", async () => {
    fsHandler.mockImplementationOnce(async () => { throw new Error("fs exploded") })
    const response = await handleBridgeMessage({ id: "4", type: "files:list", payload: { path: "." } })
    expect(response).toEqual({ id: "4", type: "files:list", success: false, error: "fs exploded" })
  })
})
```

Notes:
- If Bun's module mock specifier matching requires exact resolved paths, adjust mock specifiers to match `bridge.ts` imports. Do not change production bridge code.
- `packages/vscode/package.json` is already dirty before this work; do not edit or stage it for this plan. Run the test with the direct command below instead of adding a script.
- Keep this file focused on `handleBridgeMessage`; per-runtime tests can be added later after this seam exists.

- [ ] **Step 2: Verify VS Code bridge tests**

Run: `bun --cwd packages/vscode test --isolate src/bridges/__tests__`

Expected: PASS, no VS Code process or extension host launched.

Run: `bun run --cwd packages/vscode type-check`

Expected: PASS.

- [ ] **Step 3: Commit VS Code tests**

```bash
git add packages/vscode/src/bridges/__tests__/bridge-dispatch.test.ts
git commit -m "test(vscode): cover bridge dispatch seam"
```

---

### Task 3: Final Plan 4 Verification

**Files:**
- Verify: `packages/electron/__tests__/*.test.mjs`, `packages/vscode/src/bridges/__tests__/bridge-dispatch.test.ts`

- [ ] **Step 1: Run shell seam tests**

Run: `node --test packages/electron/__tests__/*.test.mjs`

Expected: PASS.

Run: `bun --cwd packages/vscode test --isolate src/bridges/__tests__`

Expected: PASS.

- [ ] **Step 2: Run package type-checks**

Run: `bun run --cwd packages/electron type-check`

Expected: PASS.

Run: `bun run --cwd packages/vscode type-check`

Expected: PASS.

Run: `bun run type-check`

Expected: PASS.

- [ ] **Step 3: Verify no shell/process launch commands were introduced**

Run: `git diff main..HEAD -- packages/electron packages/vscode | rg "^\+.*(pgrep|pkill|killall|electron .*--|code --extensionDevelopmentPath|ExtensionDevelopmentHost)"`

Expected: no matches in added lines. Existing production strings are out of scope; do not add new launch or name-based process matching commands.

- [ ] **Step 4: Inspect final diff**

Run: `git diff main..HEAD --stat -- packages/electron packages/vscode`

Expected: only shell test files changed. No production shell runtime code or package manifests changed.
