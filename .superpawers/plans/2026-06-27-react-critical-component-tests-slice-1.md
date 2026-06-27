# React Critical Component Tests Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React DOM test runner and add the first deep component-test slice for `SettingsView` / `SettingsWindow`, `MainLayout`, and `Sidebar`.

**Architecture:** Use the existing `tests/react/` workspace path and existing root `test:react` script. Add a dedicated Vitest happy-dom config, shared browser/store/render helpers, then write focused Testing Library tests against real components with local mocks only for heavy process-boundary or unrelated child modules.

**Tech Stack:** Vitest 4, Vite React plugin, happy-dom, `@testing-library/react`, `@testing-library/user-event`, React 19, Zustand store seeding, existing `@/` alias to `packages/ui/src`.

---

## Spec Reference

Approved spec: `.superpawers/specs/2026-06-27-react-critical-component-tests-design.md`

Initial planning slice from the spec:

1. `tests/react/` infrastructure and helpers.
2. `MainLayout` tests.
3. `Sidebar` tests.
4. `SettingsView` / `SettingsWindow` tests.

This plan intentionally does not cover `ChatInput`, `ChatSessionView`, `ChatView`, `ChatMessage`, `MessageListEntry` / `MessageListEntries`, `VirtualizedMessageList`, or `SessionSidebar` beyond lightweight mocks needed by layout tests.

---

## File Structure

### Files to Modify

- `tests/package.json` — add React DOM test devDeps and include `react/**/*.ts(x)` in the tests workspace lint script.
- `tests/tsconfig.json` — add `jsx: "react-jsx"` so `tests/react/**/*.tsx` type-checks.
- `bun.lock` — update through `bun install` after adding dependencies.

### Files to Create

- `tests/react/vitest.config.ts` — React Vitest config with happy-dom, React plugin, and aliases to `packages/ui/src`.
- `tests/react/setup.ts` — Testing Library cleanup and shared browser API shims.
- `tests/react/helpers/browser.ts` — deterministic browser shims and viewport helpers.
- `tests/react/helpers/stores.ts` — reset/seed helpers for top-level stores used by these component tests.
- `tests/react/helpers/render.tsx` — thin wrapper around Testing Library `render` with optional store seeding.
- `tests/react/helpers/fixtures.ts` — shared project/session fixtures for shell tests.
- `tests/react/helpers/mocks.tsx` — reusable mock components/factories for layout/settings child modules.
- `tests/react/settings-view.test.tsx` — DOM tests for `SettingsView` and `SettingsWindow`.
- `tests/react/layout-shell.test.tsx` — DOM tests for `MainLayout` and `Sidebar`.

---

## Implementation Tasks

### Task 0: React Test Infrastructure

**Files:**
- Modify: `tests/package.json` — devDeps and lint script anchors `"devDependencies"` and `"lint"`.
- Modify: `tests/tsconfig.json` — add compiler option anchor `"verbatimModuleSyntax"`.
- Create: `tests/react/vitest.config.ts` — React DOM Vitest config.
- Create: `tests/react/setup.ts` — global setup.
- Create: `tests/react/helpers/browser.ts` — browser shims and viewport helper.
- Create: `tests/react/helpers/stores.ts` — store reset/seed helper.
- Create: `tests/react/helpers/render.tsx` — render helper.
- Create: `tests/react/helpers/fixtures.ts` — common fixtures.
- Create: `tests/react/helpers/mocks.tsx` — mock component helpers.
- Modify: `bun.lock` — dependency lockfile update.

- [ ] **Step 1: Add test dependencies and TypeScript/lint wiring**

Run:

```bash
bun add --cwd tests -d happy-dom@^15.11.7 @testing-library/react @testing-library/user-event
```

Expected: `tests/package.json` and `bun.lock` update. `happy-dom`, `@testing-library/react`, and `@testing-library/user-event` appear in `tests/package.json` `devDependencies`.

Then update `tests/package.json` lint script from:

```json
"lint": "eslint \"./opencode/**/*.ts\" \"./web/**/*.ts\" \"./helpers/**/*.ts\" \"./vitest.config.ts\" --config ../eslint.config.js"
```

to:

```json
"lint": "eslint \"./opencode/**/*.ts\" \"./web/**/*.ts\" \"./helpers/**/*.ts\" \"./react/**/*.{ts,tsx}\" \"./vitest.config.ts\" --config ../eslint.config.js"
```

Update `tests/tsconfig.json` target state:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vitest"],
    "allowJs": false,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx"
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Create React Vitest config**

Create `tests/react/vitest.config.ts` with this complete content:

```ts
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const reactDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(reactDir, "../..")
const uiSrc = path.resolve(repoRoot, "packages/ui/src")

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": uiSrc,
      "@openchamber/ui": uiSrc,
    },
  },
  test: {
    environment: "happy-dom",
    include: ["react/**/*.test.ts", "react/**/*.test.tsx"],
    setupFiles: ["react/setup.ts"],
    isolate: true,
    restoreMocks: true,
    clearMocks: true,
  },
})
```

- [ ] **Step 3: Create browser/setup helpers**

Create `tests/react/helpers/browser.ts` with this complete content:

```ts
type ResizeObserverCallback = (entries: ResizeObserverEntry[]) => void

class TestResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry])
  }

  unobserve(): void {}

  disconnect(): void {}
}

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ""
  readonly thresholds = [0]

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

export function installBrowserMocks(): void {
  globalThis.ResizeObserver = TestResizeObserver
  globalThis.IntersectionObserver = TestIntersectionObserver
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)
  globalThis.cancelAnimationFrame = (id: number) => window.clearTimeout(id)
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {}
  window.HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() {
    return false
  }
  window.HTMLElement.prototype.setPointerCapture = function setPointerCapture() {}
  window.HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {}
}

export function setViewport(width: number, height = 900): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height })
  window.dispatchEvent(new Event("resize"))
}

export function installMatchMedia(matches = false): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  })
}
```

Create `tests/react/setup.ts` with this complete content:

```ts
import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll } from "vitest"
import { installBrowserMocks, installMatchMedia, setViewport } from "./helpers/browser"

beforeAll(() => {
  installBrowserMocks()
  installMatchMedia(false)
  setViewport(1280)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  setViewport(1280)
})
```

- [ ] **Step 4: Create store/render/fixture/mock helpers**

Create `tests/react/helpers/stores.ts` with this complete content:

```ts
import { useDialogStore } from "@/stores/useDialogStore"
import { useUIStore, type MainTab } from "@/stores/useUIStore"

type UIStatePatch = Partial<ReturnType<typeof useUIStore.getState>>
type DialogStatePatch = Partial<ReturnType<typeof useDialogStore.getState>>

export function resetTopLevelStores(): void {
  useUIStore.setState(
    {
      isSidebarOpen: true,
      sidebarWidth: 300,
      isRightSidebarOpen: false,
      rightSidebarWidth: 400,
      isBottomTerminalOpen: false,
      activeMainTab: "chat" as MainTab,
      isSessionSwitcherOpen: false,
      settingsPage: "home",
      isMobile: false,
      contextPanelByDirectory: {},
    },
    false,
  )
  useDialogStore.setState(
    {
      isSettingsDialogOpen: false,
      isCommandPaletteOpen: false,
      isHelpDialogOpen: false,
      isOpenCodeStatusDialogOpen: false,
      isMultiRunLauncherOpen: false,
      multiRunLauncherPrefillPrompt: "",
    },
    false,
  )
}

export function seedUIStore(patch: UIStatePatch): void {
  useUIStore.setState(patch, false)
}

export function seedDialogStore(patch: DialogStatePatch): void {
  useDialogStore.setState(patch, false)
}
```

Create `tests/react/helpers/render.tsx` with this complete content:

```tsx
import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"
import { resetTopLevelStores } from "./stores"

type RenderWithAppOptions = RenderOptions & {
  resetStores?: boolean
}

export function renderWithApp(ui: ReactElement, options: RenderWithAppOptions = {}): RenderResult {
  if (options.resetStores !== false) {
    resetTopLevelStores()
  }

  const { resetStores: _resetStores, ...renderOptions } = options
  return render(ui, renderOptions)
}
```

Create `tests/react/helpers/fixtures.ts` with this complete content:

```ts
export const testProject = {
  id: "project-1",
  name: "OpenChamber",
  directory: "/workspace/openchamber",
}

export const testSession = {
  id: "session-1",
  title: "Build component tests",
  directory: "/workspace/openchamber",
}

export const secondTestSession = {
  id: "session-2",
  title: "Fix layout shell",
  directory: "/workspace/openchamber",
}
```

Create `tests/react/helpers/mocks.tsx` with this complete content:

```tsx
import type { ReactNode } from "react"

export function MockPanel({ label }: { label: string }): JSX.Element {
  return <div data-testid={`mock-${label.toLowerCase().replace(/\s+/g, "-")}`}>{label}</div>
}

export function MockSessionSidebar({ mobileVariant = false }: { mobileVariant?: boolean }): JSX.Element {
  return (
    <nav aria-label={mobileVariant ? "Mobile sessions" : "Sessions"}>
      <button type="button">Build component tests</button>
      <button type="button">Fix layout shell</button>
    </nav>
  )
}

export function passthroughProvider({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>
}
```

- [ ] **Step 5: Add a canary React test and verify it passes**

Create temporary `tests/react/infrastructure.test.tsx`:

```tsx
import { screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { renderWithApp } from "./helpers/render"

describe("react test infrastructure", () => {
  test("renders JSX in happy-dom", () => {
    renderWithApp(<button type="button">React works</button>)

    expect(screen.getByRole("button", { name: "React works" })).toBeTruthy()
  })
})
```

Run:

```bash
bun run test:react
```

Expected: PASS, proving Vitest, happy-dom, aliases, setup files, JSX, and Testing Library run. If it fails because TypeScript cannot find `JSX.Element` in helper files, replace explicit `JSX.Element` return annotations with `React.ReactElement` or inferred returns.

- [ ] **Step 6: Remove the canary test after real tests exist**

Delete `tests/react/infrastructure.test.tsx` once Task 1 or Task 2 creates real tests.

- [ ] **Step 7: Inspect and commit infra**

Run:

```bash
git diff -- tests/package.json tests/tsconfig.json tests/react/vitest.config.ts tests/react/setup.ts tests/react/helpers/browser.ts tests/react/helpers/stores.ts tests/react/helpers/render.tsx tests/react/helpers/fixtures.ts tests/react/helpers/mocks.tsx bun.lock
bun run test:react
bun run --cwd tests type-check
```

Expected: diff matches this task only; React canary passes; tests workspace type-check passes.

Commit:

```bash
git add tests/package.json tests/tsconfig.json tests/react/vitest.config.ts tests/react/setup.ts tests/react/helpers/browser.ts tests/react/helpers/stores.ts tests/react/helpers/render.tsx tests/react/helpers/fixtures.ts tests/react/helpers/mocks.tsx bun.lock
git commit -m "test(react): add component test infrastructure"
```

---

### Task 1: SettingsView and SettingsWindow Tests

**Files:**
- Create: `tests/react/settings-view.test.tsx` — Settings DOM tests.
- Modify: `tests/react/helpers/stores.ts` only if extra settings store seeding is mechanically needed.

- [ ] **Step 1: Write settings tests with local section mocks**

Create `tests/react/settings-view.test.tsx`. Use this target-state sketch exactly for behavior and local mocks; adjust import paths only if the source file exports differ during implementation.

```tsx
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { renderWithApp } from "./helpers/render"
import { seedDialogStore, seedUIStore } from "./helpers/stores"

vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, isTablet: false, deviceType: "desktop" }),
  getDeviceInfo: () => ({ isMobile: false, isTablet: false, deviceType: "desktop" }),
}))

vi.mock("@/lib/desktop/desktop", () => ({
  isDesktopShell: () => false,
  isVSCodeRuntime: () => false,
  isWebRuntime: () => true,
}))

vi.mock("@/components/sections/projects/ProjectsPage", () => ({ ProjectsPage: () => <section aria-label="Projects page">Projects page</section> }))
vi.mock("@/components/sections/projects/ProjectsSidebar", () => ({ ProjectsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Project item</button> }))
vi.mock("@/components/sections/agents/AgentsPage", () => ({ AgentsPage: () => <section aria-label="Agents page">Agents page</section> }))
vi.mock("@/components/sections/agents/AgentsSidebar", () => ({ AgentsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Agent item</button> }))
vi.mock("@/components/sections/commands/CommandsPage", () => ({ CommandsPage: () => <section aria-label="Commands page">Commands page</section> }))
vi.mock("@/components/sections/commands/CommandsSidebar", () => ({ CommandsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Command item</button> }))
vi.mock("@/components/sections/mcp/McpPage", () => ({ McpPage: () => <section aria-label="MCP page">MCP page</section> }))
vi.mock("@/components/sections/mcp/McpSidebar", () => ({ McpSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>MCP item</button> }))
vi.mock("@/components/sections/skills/SkillsPage", () => ({ SkillsPage: ({ view }: { view?: string }) => <section aria-label="Skills page">Skills page {view}</section> }))
vi.mock("@/components/sections/skills/SkillsSidebar", () => ({ SkillsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Skill item</button> }))
vi.mock("@/components/sections/providers/ProvidersPage", () => ({ ProvidersPage: () => <section aria-label="Providers page">Providers page</section> }))
vi.mock("@/components/sections/providers/ProvidersSidebar", () => ({ ProvidersSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Provider item</button> }))
vi.mock("@/components/sections/usage/UsagePage", () => ({ UsagePage: () => <section aria-label="Usage page">Usage page</section> }))
vi.mock("@/components/sections/usage/UsageSidebar", () => ({ UsageSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Usage item</button> }))
vi.mock("@/components/sections/magic-prompts/MagicPromptsPage", () => ({ MagicPromptsPage: () => <section aria-label="Magic Prompts page">Magic Prompts page</section> }))
vi.mock("@/components/sections/magic-prompts/MagicPromptsSidebar", () => ({ MagicPromptsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Magic prompt item</button> }))
vi.mock("@/components/sections/openchamber/OpenChamberPage", () => ({ OpenChamberPage: ({ section }: { section: string }) => <section aria-label="OpenChamber page">OpenChamber {section}</section> }))
vi.mock("@/components/sections/git-identities/GitPage", () => ({ GitPage: () => <section aria-label="Git page">Git page</section> }))
vi.mock("@/components/sections/remote-instances/RemoteInstancesPage", () => ({ RemoteInstancesPage: () => <section aria-label="Remote Instances page">Remote Instances page</section> }))
vi.mock("@/components/sections/remote-instances/RemoteInstancesSidebar", () => ({ RemoteInstancesSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Remote instance item</button> }))

vi.mock("@/stores/agents/useAgentsStore", () => ({
  reloadOpenCodeConfiguration: vi.fn(),
  useAgentsStore: { getState: () => ({ loadAgents: vi.fn() }) },
}))
vi.mock("@/stores/useCommandsStore", () => ({ useCommandsStore: { getState: () => ({ loadCommands: vi.fn() }) } }))
vi.mock("@/stores/mcp/useMcpConfigStore", () => ({ useMcpConfigStore: { getState: () => ({ loadMcpConfigs: vi.fn() }) } }))
vi.mock("@/stores/skills/useSkillsStore", () => ({ useSkillsStore: { getState: () => ({ loadSkills: vi.fn() }) } }))
vi.mock("@/stores/skills/useSkillsCatalogStore", () => ({ useSkillsCatalogStore: { getState: () => ({ loadCatalog: vi.fn() }) } }))
vi.mock("@/stores/projects/useProjectsStore", () => ({ useProjectsStore: (selector: (state: { activeProjectId: string | null }) => unknown) => selector({ activeProjectId: "project-1" }) }))
vi.mock("@/stores/files/useDirectoryStore", () => ({ useDirectoryStore: { getState: () => ({ currentDirectory: "/workspace/openchamber" }) } }))

import { SettingsView } from "@/components/views/SettingsView"
import { SettingsWindow } from "@/components/views/SettingsWindow"
import { useUIStore } from "@/stores/useUIStore"

describe("SettingsView", () => {
  beforeEach(() => {
    seedUIStore({ settingsPage: "home" })
    seedDialogStore({ isSettingsDialogOpen: true })
  })

  test("renders the home page and quick links", () => {
    renderWithApp(<SettingsView />, { resetStores: false })

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
    expect(screen.getByText("Jump to common pages.")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Providers/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Agents/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Skills Catalog/i })).toBeTruthy()
  })

  test("clicking a navigation item updates settingsPage and renders that page", async () => {
    const user = userEvent.setup()
    renderWithApp(<SettingsView />, { resetStores: false })

    await user.click(screen.getByRole("button", { name: "Agents" }))

    expect(useUIStore.getState().settingsPage).toBe("agents")
    expect(await screen.findByLabelText("Agents page")).toBeTruthy()
  })

  test("renders an accessible settings navigation resize handle", () => {
    renderWithApp(<SettingsView />, { resetStores: false })

    expect(screen.getByRole("separator", { name: "Resize settings navigation" })).toBeTruthy()
  })

  test("calls onClose from the close settings button", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithApp(<SettingsView onClose={onClose} />, { resetStores: false })

    await user.click(screen.getByRole("button", { name: "Close settings" }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test("forceMobile renders mobile navigation and can drill into a section", async () => {
    const user = userEvent.setup()
    renderWithApp(<SettingsView forceMobile />, { resetStores: false })

    await user.click(screen.getByRole("button", { name: "Agents" }))

    expect(screen.getByRole("button", { name: "Back to Settings" })).toBeTruthy()
    expect(await screen.findByRole("button", { name: "Agent item" })).toBeTruthy()
  })
})

describe("SettingsWindow", () => {
  test("renders SettingsView inside a dialog when open", () => {
    renderWithApp(<SettingsWindow open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText("OpenChamber settings window.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
  })

  test("close settings button calls onOpenChange(false)", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderWithApp(<SettingsWindow open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole("button", { name: "Close settings" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run settings tests to verify failures are only mechanical**

Run:

```bash
bun run test:react -- settings-view.test.tsx
```

Expected before fixes: failures may appear from exact module export mismatches, Base UI portal timing, or mocked section import names. They should not require product/design decisions. Fix only mechanical mismatches by reading the source exports and adjusting the local mocks/imports.

- [ ] **Step 3: Remove canary test and make settings tests pass**

Delete `tests/react/infrastructure.test.tsx` if it still exists.

Run:

```bash
bun run test:react -- settings-view.test.tsx
```

Expected: PASS with 7 settings tests.

- [ ] **Step 4: Inspect and commit settings tests**

Run:

```bash
git diff -- tests/react/settings-view.test.tsx tests/react/infrastructure.test.tsx tests/react/helpers/stores.ts
```

Expected: diff only adds settings tests, deletes canary if present, and keeps helper changes mechanical.

Commit:

```bash
git add tests/react/settings-view.test.tsx tests/react/infrastructure.test.tsx tests/react/helpers/stores.ts
git commit -m "test(react): cover settings view shell"
```

---

### Task 2: MainLayout and Sidebar Tests

**Files:**
- Create: `tests/react/layout-shell.test.tsx` — MainLayout and Sidebar DOM tests.
- Modify: `tests/react/helpers/stores.ts` only if extra UI store seeding is mechanically needed.
- Modify: `tests/react/helpers/browser.ts` only if pointer/geometry shims need a local mechanical addition.

- [ ] **Step 1: Write layout/sidebar tests with local child mocks**

Create `tests/react/layout-shell.test.tsx`. Use this target-state sketch exactly for behavior and local mocks; adjust import paths only if source exports differ.

```tsx
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { setViewport } from "./helpers/browser"
import { renderWithApp } from "./helpers/render"
import { seedDialogStore, seedUIStore } from "./helpers/stores"

let deviceIsMobile = false

vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: deviceIsMobile, isTablet: false, deviceType: deviceIsMobile ? "mobile" : "desktop" }),
  getDeviceInfo: () => ({ isMobile: deviceIsMobile, isTablet: false, deviceType: deviceIsMobile ? "mobile" : "desktop" }),
}))

vi.mock("motion/react", async () => {
  const React = await import("react")
  const makeMotion = (tag: string) =>
    React.forwardRef<HTMLElement, Record<string, unknown> & { children?: ReactNode }>(function MotionMock(
      { children, ...props },
      ref,
    ) {
      return React.createElement(tag, { ...props, ref }, children)
    })

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    animate: vi.fn(() => ({ stop: vi.fn() })),
    motion: {
      aside: makeMotion("aside"),
      button: makeMotion("button"),
      div: makeMotion("div"),
      main: makeMotion("main"),
    },
    useMotionValue: (initial: number) => ({ get: () => initial, set: vi.fn() }),
    useTransform: () => 0,
  }
})

vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/workspace/openchamber" }))
vi.mock("@/contexts/DiffWorkerProvider", () => ({ DiffWorkerProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/components/layout/Header", () => ({ Header: () => <header><button type="button">Open left drawer</button><div role="tablist" aria-label="Main tabs"><button type="button">Chat</button></div></header> }))
vi.mock("@/components/session/SessionSidebar", () => ({ SessionSidebar: ({ mobileVariant = false }: { mobileVariant?: boolean }) => <nav aria-label={mobileVariant ? "Mobile sessions" : "Sessions"}><button type="button">Build component tests</button></nav> }))
vi.mock("@/components/session/SessionDialogs", () => ({ SessionDialogs: () => <div data-testid="session-dialogs" /> }))
vi.mock("@/components/views/ChatView", () => ({ ChatView: () => <main aria-label="Chat content">Chat content</main> }))
vi.mock("@/components/views/GitView", () => ({ GitView: () => <section aria-label="Git view">Git view</section> }))
vi.mock("@/components/views/DiffView", () => ({ DiffView: () => <section aria-label="Diff view">Diff view</section> }))
vi.mock("@/components/views/TerminalView", () => ({ TerminalView: () => <section aria-label="Terminal view">Terminal view</section> }))
vi.mock("@/components/views/FilesView", () => ({ FilesView: () => <section aria-label="Files view">Files view</section> }))
vi.mock("@/components/views/SettingsWindow", () => ({ SettingsWindow: ({ open }: { open: boolean }) => (open ? <section aria-label="Settings window">Settings window</section> : null) }))
vi.mock("@/components/multirun/MultiRunWindow", () => ({ MultiRunWindow: ({ open }: { open: boolean }) => (open ? <section aria-label="Multi run window">Multi run window</section> : null) }))
vi.mock("@/components/ui/CommandPalette", () => ({ CommandPalette: () => <div data-testid="command-palette" /> }))
vi.mock("@/components/ui/HelpDialog", () => ({ HelpDialog: () => <div data-testid="help-dialog" /> }))
vi.mock("@/components/ui/OpenCodeStatusDialog", () => ({ OpenCodeStatusDialog: () => <div data-testid="opencode-status-dialog" /> }))
vi.mock("@/components/ui/OfflineIndicator", () => ({ OfflineIndicator: () => <div data-testid="offline-indicator" /> }))
vi.mock("@/components/layout/RightSidebarTabs", () => ({ RightSidebarTabs: () => <section aria-label="Right sidebar tabs">Right sidebar tabs</section> }))
vi.mock("@/components/layout/ContextPanel", () => ({ ContextPanel: () => <section aria-label="Context panel">Context panel</section> }))
vi.mock("@/stores/useUpdateStore", () => ({ useUpdateStore: (selector: (state: { checkForUpdates: () => Promise<null> }) => unknown) => selector({ checkForUpdates: async () => null }) }))

import { MainLayout } from "@/components/layout/MainLayout"
import { Sidebar } from "@/components/layout/Sidebar"
import { useUIStore } from "@/stores/useUIStore"

describe("Sidebar", () => {
  beforeEach(() => {
    deviceIsMobile = false
    seedUIStore({ isSidebarOpen: true, sidebarWidth: 300 })
  })

  test("renders desktop children and resize handle when open", () => {
    renderWithApp(<Sidebar isOpen isMobile={false}><nav aria-label="Sessions">Sessions content</nav></Sidebar>, { resetStores: false })

    expect(screen.getByLabelText("Sessions")).toBeTruthy()
    expect(screen.getByRole("separator", { name: "Resize left panel" })).toBeTruthy()
  })

  test("returns null on mobile", () => {
    renderWithApp(<Sidebar isOpen isMobile><nav aria-label="Sessions">Sessions content</nav></Sidebar>, { resetStores: false })

    expect(screen.queryByLabelText("Sessions")).toBeNull()
  })
})

describe("MainLayout", () => {
  beforeEach(() => {
    deviceIsMobile = false
    setViewport(1280)
    seedUIStore({
      isSidebarOpen: true,
      sidebarWidth: 300,
      isRightSidebarOpen: true,
      rightSidebarWidth: 400,
      activeMainTab: "chat",
      isBottomTerminalOpen: false,
      isSessionSwitcherOpen: false,
      contextPanelByDirectory: {},
    })
    seedDialogStore({ isSettingsDialogOpen: false, isMultiRunLauncherOpen: false })
  })

  test("renders desktop shell with sessions navigation, chat content, and right sidebar", async () => {
    renderWithApp(<MainLayout />, { resetStores: false })

    expect(await screen.findByLabelText("Sessions")).toBeTruthy()
    expect(screen.getByLabelText("Chat content")).toBeTruthy()
    expect(screen.getByLabelText("Right sidebar tabs")).toBeTruthy()
    expect(screen.getByRole("separator", { name: "Resize left panel" })).toBeTruthy()
  })

  test("hides the desktop sidebar when isSidebarOpen is false", async () => {
    seedUIStore({ isSidebarOpen: false })
    const { container } = renderWithApp(<MainLayout />, { resetStores: false })

    await screen.findByLabelText("Chat content")
    const aside = container.querySelector('aside[aria-hidden="true"]')

    expect(aside).toBeTruthy()
    expect(screen.queryByRole("separator", { name: "Resize left panel" })).toBeNull()
  })

  test("renders mobile shell with mobile sessions when device is mobile", async () => {
    deviceIsMobile = true
    setViewport(390, 844)
    seedUIStore({ isSessionSwitcherOpen: true, isRightSidebarOpen: false })
    renderWithApp(<MainLayout />, { resetStores: false })

    expect(await screen.findByLabelText("Mobile sessions")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Close drawer" })).toBeTruthy()
  })

  test("syncs mobile detection into useUIStore", async () => {
    deviceIsMobile = true
    setViewport(390, 844)
    renderWithApp(<MainLayout />, { resetStores: false })

    await screen.findByLabelText("Chat content")

    expect(useUIStore.getState().isMobile).toBe(true)
  })

  test("renders settings window when the settings dialog store is open", async () => {
    seedDialogStore({ isSettingsDialogOpen: true })
    renderWithApp(<MainLayout />, { resetStores: false })

    expect(await screen.findByLabelText("Settings window")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run layout tests to verify failures are only mechanical**

Run:

```bash
bun run test:react -- layout-shell.test.tsx
```

Expected before fixes: failures may appear from exact child export names, lazy import timing, `framer-motion`/`motion` wrappers, or ARIA placement. Fix only mechanical mismatches by reading the component sources. Do not replace `MainLayout` or `Sidebar` with mocks; these are the units under test.

- [ ] **Step 3: Make layout tests pass**

Run:

```bash
bun run test:react -- layout-shell.test.tsx
```

Expected: PASS with 7 layout/sidebar tests.

- [ ] **Step 4: Inspect and commit layout tests**

Run:

```bash
git diff -- tests/react/layout-shell.test.tsx tests/react/helpers/stores.ts tests/react/helpers/browser.ts
```

Expected: diff only adds layout/sidebar tests and mechanical helper updates.

Commit:

```bash
git add tests/react/layout-shell.test.tsx tests/react/helpers/stores.ts tests/react/helpers/browser.ts
git commit -m "test(react): cover layout shell"
```

---

### Task 3: Full Slice Verification

**Files:**
- No new files expected. Fix only test infra/test code if verification exposes issues.

- [ ] **Step 1: Run the React test suite 3 consecutive times**

Run:

```bash
bun run test:react
bun run test:react
bun run test:react
```

Expected: all three runs pass without flakes. Target test count for this slice is roughly 14 tests: 7 settings tests plus 7 layout/sidebar tests. Exact count can vary by one or two if implementation splits/combines assertions, but it must stay in the spec's Plan 1 range of 12-25 tests.

- [ ] **Step 2: Run related existing tests**

Run:

```bash
bun run test:stores
```

Expected: PASS, 68 store tests. Known console warnings from store tests may still appear; they must not become failures.

- [ ] **Step 3: Run lint and tests workspace type-check**

Run:

```bash
bun run --cwd tests type-check
bun run lint
```

Expected: both pass. If root `bun run lint` reveals unrelated pre-existing files outside this branch, document them and run the narrower `bun run --cwd tests lint` as the authoritative check for this slice.

- [ ] **Step 4: Run forbidden process command audit**

Run:

```bash
git grep -nE "killall|pkill|pgrep" -- tests/react .superpawers/plans/2026-06-27-react-critical-component-tests-slice-1.md
```

Expected: no matches except this command text inside the plan if grep includes the plan itself. If the plan text is matched only because it documents the audit command and AGENTS.md rule, that is acceptable; there must be no matches in `tests/react/`.

- [ ] **Step 5: Inspect final diff and commit verification fixes if any**

Run:

```bash
git status --short
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected: changed files are limited to this spec/plan, tests workspace package/config/helper/test files, and `bun.lock`. Existing untracked `opencode.json` remains untracked and uncommitted.

If verification required fixes after Task 2's commit, commit them:

```bash
git add tests/react tests/package.json tests/tsconfig.json bun.lock
git commit -m "test(react): stabilize component test slice"
```

---

## Expected End State

- `bun run test:react` runs through `tests/react/vitest.config.ts` and passes.
- `tests/react/settings-view.test.tsx` covers `SettingsView` and `SettingsWindow` render, navigation, resize handle, close, mobile drilldown, and dialog behavior.
- `tests/react/layout-shell.test.tsx` covers `Sidebar` desktop/mobile behavior and `MainLayout` desktop/mobile/settings-shell behavior.
- Shared helpers under `tests/react/helpers/` are sufficient for later chat/message chunks.
- `tests/package.json` lint covers `react/**/*.{ts,tsx}`.
- `tests/tsconfig.json` supports JSX.
- No real OpenCode server, Electron/Tauri shell, filesystem endpoint, terminal, GitHub service, or name-based process cleanup command is required.
