# OpenChamber — Agent Reference

OpenChamber is a mobile-first UI for an OpenCode server. The UI talks to OpenCode over HTTP + SSE/WebSocket via `@opencode-ai/sdk`.

## Runtime map

| Surface          | Path                | Status                                                                                |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Shared UI        | `packages/ui`       | Active. Mobile-first.                                                                 |
| Web app + server | `packages/web`      | Active. All backend logic lives here.                                                 |
| Desktop (Electron) | `packages/electron` | **Active — all new desktop work goes here.** Boots the web server in-process.       |
| VS Code          | `packages/vscode`   | Active. Extension + webview.                                                          |

Electron imports the web server via `@openchamber/web/server/index.js` and calls `startWebUiServer({...})`. The native shell is for menu, dialogs, notifications, updater, deep-links, and quit only — never feature logic. `packages/electron/preload.mjs` exposes a `__TAURI__` IPC shim so renderer code stays shell-agnostic.

## Principles

- Smallest correct change. Preserve working behaviour before improving structure.
- Follow local precedent — read nearby code before introducing a new pattern.
- Live state > historical state. Derive live UI from live channels (sync stores, SSE), not persisted history.
- Enforce policy in core logic, not only in UI/prompts.
- Make partial failure, fallbacks, and data loss explicit in code.
- Finish work end-to-end: implement, verify, clean up.
- No new dependencies, secrets, or `git`/GitHub commands without being asked.
- Do not modify the sibling `../opencode` repo.

## Skill gates

Skills live in `.opencode/skills/<name>/SKILL.md`. Load the matching skill before writing code in its domain.

| Trigger                                                                                | Skill                              |
| -------------------------------------------------------------------------------------- | ---------------------------------- |
| Any UI / styling / colour change                                                       | `theme-system`                     |
| Any UI that may run on mobile/PWA (layouts, panels, chat chrome, drawers, keyboard)    | `mobile-first-ui`                  |
| Zustand stores, SSE/event handlers, polling, scroll/DOM, optimistic updates, hot-path React | `performance-rules`           |

## Where new code goes

- New shared component → `packages/ui/src/components/`. Mobile variant if applicable (`Mobile<Name>` paired with the desktop one).
- New zustand store → `packages/ui/src/stores/`. Split by change frequency and subscriber set; do not bolt onto an existing broad store.
- New sync-layer state (live session/message/streaming) → `packages/ui/src/sync/`. Read `packages/ui/src/sync/DOCUMENTATION.md` first.
- New server route or server-side module → `packages/web/server/lib/<domain>/` with a `DOCUMENTATION.md`.
- New desktop IPC handler → `packages/electron/main.mjs` + `preload.mjs` (preserve the `__TAURI__` shim).
- New VS Code bridge → `packages/vscode/src/bridge-*-runtime.ts`.

## Tech stack

- Bun (`packageManager`), Node ≥20 (`engines`)
- React + TypeScript + Vite + Tailwind v4
- State: Zustand (`packages/ui/src/stores/` and sync child stores in `packages/ui/src/sync/`)
- UI primitives: **Base UI** (`@base-ui/react`) — wrappers in `packages/ui/src/components/ui/`. Radix UI and HeroUI are legacy; do not use for new code. Icons: Remixicon.
- Server: Express
- Desktop: Electron 41 (forward)
- PWA: `vite-plugin-pwa`

## Entry points

- Web bootstrap: `packages/web/src/main.tsx`
- Web server: `packages/web/server/index.js`
- Web CLI: `packages/web/bin/cli.js`
- Electron main: `packages/electron/main.mjs` (preload: `packages/electron/preload.mjs`)
- VS Code extension host: `packages/vscode/src/extension.ts`
- VS Code webview bootstrap: `packages/vscode/webview/main.tsx`

## OpenCode integration

- UI client wrapper: `packages/ui/src/lib/opencode/client.ts` (imports `@opencode-ai/sdk/v2`)
- Live event stream: `packages/ui/src/hooks/useEventStream.ts`
- Server boot: `createOpencodeServer` in `packages/web/server/index.js`
- Filesystem endpoints: search `packages/web/server/index.js` for `/api/fs/`
- External server: set `OPENCODE_HOST` (full base URL) or `OPENCODE_PORT`, plus `OPENCODE_SKIP_START=true`, to connect to an existing OpenCode instance.

## Documentation map

Read the relevant `DOCUMENTATION.md` before modifying that module.

| Module                              | Docs                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| Sync layer (live session / streaming) | `packages/ui/src/sync/DOCUMENTATION.md`                     |
| quota                               | `packages/web/server/lib/quota/DOCUMENTATION.md`              |
| git                                 | `packages/web/server/lib/git/DOCUMENTATION.md`                |
| github                              | `packages/web/server/lib/github/DOCUMENTATION.md`             |
| opencode                            | `packages/web/server/lib/opencode/DOCUMENTATION.md`           |
| notifications                       | `packages/web/server/lib/notifications/DOCUMENTATION.md`      |
| terminal                            | `packages/web/server/lib/terminal/DOCUMENTATION.md`           |
| tts                                 | `packages/web/server/lib/tts/DOCUMENTATION.md`                |
| skills-catalog                      | `packages/web/server/lib/skills-catalog/DOCUMENTATION.md`     |

## Styling rules

- Theme tokens only — no hex, no Tailwind colour classes. Use `useThemeSystem()` hook or CSS variables (`var(--surface-elevated)`).
- Typography via `packages/ui/src/lib/typography.ts`.
- Toasts: import the wrapper from `@/components/ui`. Never import `sonner` directly.

## Architecture patterns

- **Thin entrypoints, focused modules.** Route/domain logic lives in focused modules with clear ownership.
- **Cross-runtime parity.** Shared route/payload contracts must work in web, Electron, and VS Code.
- **Partial-failure-safe flows.** Prefer per-item results, rollback paths, or resumable cleanup over all-or-nothing assumptions.

## CLI parity (terminal CLI — `packages/web/bin/*`)

Validation and safety gates MUST live in core command logic, not in prompts. The same outcome must hold across interactive TTY, piped/non-TTY, `--quiet`, `--json`, and fully-flagged invocations. Invalid operations fail with non-zero exit.

## Build / validate

| Command                       | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `bun run type-check`          | TypeScript validation                |
| `bun run lint`                | ESLint                               |
| `bun run build`               | Build all packages                   |
| `bun run electron:dev`        | Desktop dev (Electron — primary)     |
| `bun run electron:build`      | Desktop build (Electron — primary)   |
| `bun run vscode:build`        | VS Code extension                    |
| `bun run release:test`        | Release smoke (`scripts/test-release-build.sh`) |
| `scripts/verify.sh`           | Full verification (type-check + lint + build)  |

Run `scripts/verify.sh` before finalising any change. At minimum, run `bun run type-check` and `bun run lint`.
