# React Critical Component Tests

> **For agentic workers:** This is a design document. It is approved and frozen. Implementation follows in chunked plans, beginning with infrastructure plus the first planning slice.

**Goal:** Add deep DOM-rendering React coverage for the 10 highest-risk UI components without attempting to cover all `packages/ui/src/components/` in one branch.

**Architecture:** React component tests live in the existing empty `tests/react/` workspace path and run through the existing root `test:react` script. Tests use Vitest, happy-dom, Testing Library, real React components, real Zustand stores where practical, and focused mocks only at process boundaries.

**Tech Stack:** Vitest 4, Vite React plugin, happy-dom, `@testing-library/react`, `@testing-library/user-event`, React 19, existing UI package source aliases.

---

## Why this slice

The project now has store-level coverage for top-level singleton stores, but it still has zero DOM-rendering React component tests. Existing component-adjacent tests under `packages/ui/src/components/` are pure logic, xstate, utility, or class-lifecycle tests. They do not mount JSX, exercise user interactions, or prove that store state and component DOM output stay wired together.

The component tree is too large for a single implementation plan: roughly 314 component files, with `chat/`, `ui/`, settings sections, session management, layout, and views all acting as separate domains. This spec covers the 10 critical components only, with deep target coverage for each. Implementation is intentionally chunked into smaller plans so each branch of work is reviewable and testable.

---

## Scope

This spec covers deep DOM-render tests for these 10 critical components:

| Component | Path | Why it is critical |
|---|---|---|
| `ChatInput` | `packages/ui/src/components/chat/ChatInput.tsx` | Primary user input, submit gating, attachments, slash/autocomplete, model and agent controls |
| `ChatMessage` | `packages/ui/src/components/chat/ChatMessage.tsx` | Single-message renderer for user, assistant, tool, error, and metadata paths |
| `MessageListEntry` / `MessageListEntries` | `packages/ui/src/components/chat/message-list/` | Core per-message rendering pipeline and message collection rendering |
| `ChatSessionView` | `packages/ui/src/components/chat/ChatSessionView.tsx` | Full active session surface: message list, input, status, permissions, session state |
| `MainLayout` | `packages/ui/src/components/layout/MainLayout.tsx` | App shell, desktop/mobile chrome, sidebars, main content, terminal dock |
| `Sidebar` | `packages/ui/src/components/layout/Sidebar.tsx` | Main navigation and session/project access surface |
| `SessionSidebar` | `packages/ui/src/components/session/SessionSidebar.tsx` | Session list management, folders, selection, session actions |
| `ChatView` | `packages/ui/src/components/views/ChatView.tsx` | Top-level chat route/view wrapper and active-session mounting |
| `SettingsView` / `SettingsWindow` | `packages/ui/src/components/views/SettingsView.tsx`, `packages/ui/src/components/views/SettingsWindow.tsx` | Settings route/window shell and settings section navigation |
| `VirtualizedMessageList` | `packages/ui/src/components/chat/VirtualizedMessageList.tsx` | Long-conversation rendering, virtualizer integration, scroll behavior |

The spec targets deep coverage for all 10, but implementation plans pick them off in chunks. Each chunk must leave `bun run test:react` passing and must not require unfinished future chunks.

---

## Test Runner Architecture

React DOM tests use the existing scripts:

- Root: `bun run test:react`
- Tests workspace: `vitest run react --config react/vitest.config.ts`

The first implementation slice creates:

| File | Responsibility |
|---|---|
| `tests/react/vitest.config.ts` | Vitest config for React DOM tests, `happy-dom` environment, React plugin, aliases for `@/` and UI source imports |
| `tests/react/setup.ts` | Shared DOM shims and Testing Library cleanup hooks |
| `tests/react/helpers/render.tsx` | Project render helper with common providers and optional seeded stores |
| `tests/react/helpers/stores.ts` | Store reset/seed helpers for top-level stores touched by component tests |
| `tests/react/helpers/fixtures.ts` | Shared session/message/model/project fixtures |
| `tests/react/helpers/browser.ts` | ResizeObserver, IntersectionObserver, matchMedia, scroll/geometry helpers |
| `tests/react/helpers/mocks.ts` | Focused mocks for process boundaries when a component would otherwise call OpenCode, fetch, shell APIs, or virtualizer internals |

`tests/package.json` gets React test dependencies needed by this workspace:

- `@testing-library/react`
- `@testing-library/user-event`
- `happy-dom`

The config should reuse existing root/workspace dependencies for React, React DOM, Vite, and `@vitejs/plugin-react` rather than duplicating them unless the package manager requires an explicit local dependency during implementation.

---

## Testing Principles

1. Prefer user-visible assertions: roles, labels, text, accessible names, focus behavior, and stable region/query anchors.
2. Use real components by default. Do not shallow render.
3. Use real Zustand stores where practical. Seed stores with helpers and reset them between tests.
4. Mock process boundaries only: OpenCode SDK/client calls, fetch/network, filesystem endpoints, shell/Tauri/Electron APIs, virtualizer geometry, ResizeObserver, IntersectionObserver, and browser APIs not implemented by happy-dom.
5. Keep mocks local to the test file unless at least two component chunks need the same mock.
6. Do not assert Tailwind class strings or theme-token implementation details. Assert behavior and accessible output.
7. Mobile coverage is required for components with responsive branches or paired mobile components.
8. Avoid snapshot-first testing. Snapshots may be used only for small static fallback surfaces where semantic assertions would be weaker.
9. Tests must run deterministically under `bun run test:react` without a real OpenCode server.

---

## Coverage Model

Each critical component should receive tests across these categories when the component owns the behavior:

| Category | What to cover |
|---|---|
| Render contract | Empty/loading/ready/error states, required landmarks/buttons/regions, stable labels |
| User interactions | Typing, clicking, keyboard navigation, open/close flows, selection, toggles, submit paths |
| Store integration | Seeded store state produces expected DOM; user actions update the expected store state where practical |
| Async boundaries | Success, failure, pending, retry, dismiss, or disabled states around mocked async calls |
| Responsive/mobile | Mobile branch or paired mobile component behavior where applicable |
| Regression guard | At least one test per component pins a fragile behavior that has high user impact |

Deep coverage does not mean testing every conditional branch. It means each component has enough behavior-level tests to fail on meaningful regressions in its main responsibilities.

---

## Component Targets

### `MainLayout`

Target coverage:

- Renders desktop shell with sidebar/main content regions from seeded UI state.
- Responds to sidebar open/closed state and exposes a usable navigation layout.
- Renders mobile shell/bottom-tabs path when mobile state or viewport helper indicates mobile.
- Handles right-sidebar/context-panel visibility without crashing when related stores are empty.
- Regression guard: changing `useUIStore.isMobile` or sidebar state changes the rendered shell as expected.

### `Sidebar`

Target coverage:

- Renders project/session navigation shell with empty and populated session fixtures.
- Supports selecting/opening a session through the visible controls.
- Shows loading or empty state when no sessions/projects are seeded.
- Handles mobile/compact behavior if the component has a responsive branch.
- Regression guard: seeded active session is visually/semantically indicated and does not disappear during rerender.

### `SettingsView` / `SettingsWindow`

Target coverage:

- Renders the settings shell with section navigation.
- Opens the configured default/current settings page from `useUIStore.settingsPage`.
- Switching sections changes the visible settings panel and updates the store where applicable.
- Window/dialog shell open/close behavior works for `SettingsWindow` without requiring the full app.
- Regression guard: settings navigation remains accessible by role/name and not only by visual class.

### `ChatInput`

Target coverage:

- Renders composer textarea, primary submit control, and key controls with empty state.
- Typing updates the composer and enables/disables submit according to current send constraints.
- Enter/keyboard submit and button submit call the expected mocked send path once.
- Attachments and queued/draft state render when seeded, without requiring real file uploads initially.
- Slash/autocomplete surface can open from user input and select an item if practical in the chunk.
- Mobile controls render in mobile mode.
- Regression guard: empty/whitespace submit remains blocked.

### `ChatSessionView`

Target coverage:

- Renders active-session happy path with message list and composer.
- Handles no active session / loading / errored session states.
- Shows permission/status surfaces when seeded session state requires attention.
- Wires composer submission or visible disabled state to mocked session actions.
- Mobile session status bar path is covered when mobile mode is enabled.
- Regression guard: changing active session fixture changes the rendered session content without stale DOM.

### `ChatView`

Target coverage:

- Mounts the correct chat/session surface for active route/session state.
- Handles missing session, initial loading, and ready states.
- Does not call real OpenCode/network APIs during render.
- Regression guard: view-level shell survives empty stores and still renders a recoverable empty state.

### `ChatMessage`

Target coverage:

- Renders user and assistant messages with expected content and accessible structure.
- Renders tool/error/status variants from representative fixtures.
- Handles markdown/plain rendering choices if the component owns that branch.
- Handles missing/partial message parts without crashing.
- Regression guard: assistant/tool content boundaries stay distinct and do not collapse into one unlabeled blob.

### `MessageListEntry` / `MessageListEntries`

Target coverage:

- Renders a representative sequence of user/assistant/tool messages.
- Preserves ordering and stable keys across rerender with added messages.
- Renders empty/fallback state for unsupported or partial entries.
- Handles selected/focused/active entry behavior if owned by these components.
- Regression guard: appending a streamed/partial message does not reorder previous entries.

### `VirtualizedMessageList`

Target coverage:

- Renders visible items from a long message list using deterministic geometry helpers.
- Handles empty list and short list without virtualizer errors.
- Supports scroll-to-bottom or initial anchor behavior if exposed by props/state.
- Handles appended messages without losing visible content.
- Regression guard: long lists render only the expected visible window while still exposing the latest message when requested.

### `SessionSidebar`

Target coverage:

- Renders session list fixtures, empty state, and folder/grouping state.
- Selecting a session triggers the expected mocked navigation/store action.
- Supports visible session actions such as create/rename/archive/delete only where the component owns them.
- Handles multi-select/drag-drop affordances at smoke level if full drag simulation is unstable.
- Regression guard: active session remains indicated after list refresh/rerender.

---

## Chunking Strategy

The spec is broad, but plans are intentionally smaller.

### Initial Planning Slice

Plan 1 starts with infrastructure plus the lower-dependency shell/settings components:

1. `tests/react/` infrastructure and helpers.
2. `MainLayout` tests.
3. `Sidebar` tests.
4. `SettingsView` / `SettingsWindow` tests.

This slice proves the runner, DOM setup, aliases, store seeding, responsive helpers, and basic shell mocking before touching chat's heavier streaming/message dependencies.

Expected Plan 1 size: 12-25 React DOM tests, depending on how many shell branches can be covered cleanly without over-mocking.

### Later Planning Chunks

Likely follow-up chunks:

| Chunk | Components | Notes |
|---|---|---|
| Chat input/view | `ChatInput`, `ChatSessionView`, `ChatView` | Composer, active session state, send gating, mobile status |
| Message rendering | `ChatMessage`, `MessageListEntry` / `MessageListEntries`, `VirtualizedMessageList` | Message fixtures, ordering, virtualizer geometry, long-list behavior |
| Session navigation | `SessionSidebar` | Can move earlier if `Sidebar` needs its internals covered in Plan 1, otherwise keep separate |

Chunk boundaries may shift during planning if code dependencies show a cleaner split. The invariant is that each plan must be independently runnable, reviewed, and merged.

---

## Acceptance Criteria

This spec is complete when all planned chunks are implemented:

1. `tests/react/vitest.config.ts` exists and `bun run test:react` runs React DOM tests in happy-dom.
2. Shared helpers exist under `tests/react/helpers/` and are used by at least two component test files where appropriate.
3. All 10 critical components have deep behavior-level tests matching their target coverage above.
4. Mobile/responsive behavior is tested for components with mobile branches or paired mobile variants.
5. Tests do not require a real OpenCode server, Electron shell, browser window, or filesystem endpoint.
6. Tests avoid broad implementation-detail assertions such as Tailwind class strings.
7. `bun run test:react` passes 3 consecutive runs after each implementation chunk.
8. `bun run lint` and the relevant type/build checks pass, or pre-existing unrelated failures are documented without widening.
9. No process-cleanup commands such as `pgrep`, `pkill`, or `killall` are added to tests, scripts, or prompts.

Plan 1 acceptance is narrower: infrastructure plus `MainLayout`, `Sidebar`, and `SettingsView` / `SettingsWindow` tests pass through `bun run test:react`, with helper patterns documented enough for later chunks.

---

## Out of Scope

- Broad coverage for all ~314 component files.
- Browser E2E tests, Playwright/Cypress, or screenshot visual regression.
- Refactoring component structure for testability unless a tiny extraction is required to avoid impossible mocking.
- Rewriting `useUIStore` or other stores.
- Adding React DOM tests colocated under `packages/ui/src/components/` with `bun:test`.
- Running real OpenCode, shell, terminal, filesystem, or GitHub services.
- Deep drag-and-drop fidelity where a smoke-level accessible interaction covers the user outcome.
- Adding these tests to `scripts/verify.sh` in the first chunk; full verify integration can be revisited after multiple React chunks are stable.

---

## Verification Commands

Per implementation chunk:

```bash
bun run test:react
bun run test:react
bun run test:react
bun run lint
```

When touching package dependencies or aliases:

```bash
bun install
bun run test:react
```

Before branch completion, run the strongest feasible validation:

```bash
bun run test:react
bun run test:stores
bun run lint
bun run type-check
```

If `bun run type-check` still reports the known pre-existing Node globals/type errors from the prior baseline, document that they remain unchanged rather than fixing them in this component-testing slice.

---

## Durable Decisions

- React DOM tests belong in `tests/react/`, not colocated with source.
- The first component testing branch should prove infrastructure and lower-dependency app-shell components before chat/message virtualization.
- The full spec covers 10 critical components, but implementation plans stay chunked.
- Testing Library is the query/user-interaction layer; Vitest is the runner; happy-dom is the DOM environment.
