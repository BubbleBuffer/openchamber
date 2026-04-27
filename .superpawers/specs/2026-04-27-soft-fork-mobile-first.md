# Soft Fork: Mobile-First PWA

Date: 2026-04-27

## Overview

Soft-fork OpenChamber into a mobile-first PWA for OpenCode. Pull upstream SDK/server fixes; diverge on UI and stores where opinionated changes are needed.

## Architecture Decision

**Soft fork, not hard fork.** The SDK integration layer (months of work) is the irreplaceable asset. We keep it flowing from upstream. We diverge surgically on the frontend stack — stores, components, PWA — where the changes are opinionated and wouldn't fit upstream PRs.

### Keep (pull from upstream)

Everything not listed below — server, all features, all runtimes (VS Code, Electron, Tauri), SDK client wrapper, scheduled tasks, the works.

### Replace (our divergence)

| Module | Rationale |
|--------|-----------|
| `useConfigStore.ts` (2,139 lines) | 8+ concerns in one file, 300-line functions, blind casts, localStorage in Zustand init. Split into `useProviderConfigStore` (~400), `useAgentConfigStore` (~400), `useVoiceSettingsStore` (~200). |
| `useUIStore.ts` (1,946 lines) | DOM side-effects in Zustand actions, ~15 dialog booleans mixed with unrelated state. Move DOM effects to React. Extract `useDialogStore`. |
| `session-ui-store.ts` (1,173 lines) | Hub store consumed by 40-60 files. Extract `sendMessage` (185 lines) → `send-message.ts`. Extract session CRUD → `session-ops.ts`. Store becomes thin orchestration. |
| `useAgentsStore` / `useDirectoryStore` | Documented circular dependency. Break by making directory a parameter, not an import. |
| `ChatContainer.tsx` (812 lines) + `MessageList.tsx` (1,666 lines) | Desktop-first layout built for large viewports. Rewrite as mobile-first with clean component boundaries. |
| `ChatView.tsx` | Add mobile shell with bottom navigation, drawer-based panel management. |

### Centralize

Re-export all SDK types through `packages/ui/src/lib/opencode/client.ts` so the 28 files that import from `@opencode-ai/sdk/v2` directly go through a single mediated point.

### Add new

- PWA runtime caching in the service worker (`packages/web/src/sw.ts`)
- Offline fallback page
- Mobile-first navigation patterns (bottom tabs, drawer panels)

### Delete

Nothing. We keep everything from upstream and layer our changes on top.

## Store Refactoring Plan

### Principles

- One store = one concern. Split by change frequency and subscriber set.
- No cross-store ES module imports. Use `.getState()` at call time.
- No DOM side-effects in Zustand actions.
- No localStorage reads in initial state (use `persist` middleware or explicit hydration).
- All provider/agent operations go through the SDK client wrapper, not direct SDK imports.

### Target State

| Old | New | Target Lines | Responsibility |
|-----|-----|-------------|----------------|
| `useConfigStore` | `useProviderConfigStore` | ~400 | Provider list loading, model metadata, default provider selection |
| | `useAgentConfigStore` | ~400 | Agent loading, model resolution per agent, variant selection |
| | `useVoiceSettingsStore` | ~200 | TTS/STT preferences, summarization settings |
| `useUIStore` | Keep, stripped | ~1,200 | Remove DOM side-effects, extract dialog booleans |
| | `useDialogStore` | ~200 | All dialog open/close state |
| `useAgentsStore` | Keep, refactored | ~800 | Break circular dep, parameterize directory |
| `session-ui-store` | `send-message.ts` | ~200 | Message sending, routing, optimistic updates |
| | `session-ops.ts` | ~200 | Session CRUD (create, delete, archive, rename) |
| | Keep, thin | ~400 | Current session selection, draft state (orchestration only) |

## PWA Enhancement Plan

### Current State

- Manifest and service worker registration exist
- SW is push-only — no offline caching
- UI is per-component mobile adaptations on a desktop-first layout

### Target

- SW caches app shell and critical assets for offline capability
- Offline fallback page when network is unavailable
- Mobile-first layout: bottom tab navigation, drawer-based panels, touch-optimized controls
- Installable with project-aware naming (existing feature, keep)

## Out of Scope

- Upstream feature additions (agents, providers, tunnels, GitHub, git, terminal, skills)
- Desktop shell changes (Electron, Tauri)
- VS Code extension changes
- Server-side feature work
