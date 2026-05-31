# OpenChamber — Agent Reference

OpenChamber is a mobile-first soft fork of upstream OpenChamber that ships UI runtimes (web / Electron desktop / VS Code) for an OpenCode server. The UI talks to OpenCode over HTTP + SSE/WebSocket via `@opencode-ai/sdk`.

This file is the orientation layer. Deeper rules live in `.opencode/skills/<name>/SKILL.md` and in module `DOCUMENTATION.md` files — load them on demand.

## Runtime map

| Surface          | Path                | Status                                                                                |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------- |
| Shared UI        | `packages/ui`       | Active. Mobile-first.                                                                 |
| Web app + server | `packages/web`      | Active. All backend logic lives here.                                                 |
| Desktop (Electron) | `packages/electron` | **Active — all new desktop work goes here.** Boots the web server in-process.       |
| Desktop (Tauri)  | `packages/desktop`  | **Legacy, maintenance-only** until cutover (`docs/TAURI_TO_ELECTRON_CUTOVER.md`). Do not add features. |
| VS Code          | `packages/vscode`   | Active. Extension + webview.                                                          |

Electron imports the web server via `@openchamber/web/server/index.js` and calls `startWebUiServer({...})`. The native shell is for menu, dialogs, notifications, updater, deep-links, and quit only — never feature logic. `packages/electron/preload.mjs` exposes a `__TAURI__` IPC shim so renderer code stays shell-agnostic.

## Principles (always apply)

- Smallest correct change. Preserve working behaviour before improving structure.
- Follow local precedent — read nearby code before introducing a new pattern.
- Source of truth > heuristics. Live state > historical state. If a fallback is necessary, scope it to the active entity and treat it as temporary.
- Enforce policy in core logic, not only in UI/prompts.
- Make partial failure, fallbacks, and data loss explicit in code.
- Finish work end-to-end: implement, verify, clean up.
- No new dependencies, secrets, or `git`/GitHub commands without being asked.
- Do not modify the sibling `../opencode` repo.

## Regression-prevention checklist

Use this as a thinking framework before and during changes.

- Fallback logic — can stale persisted data keep this path active forever?
- UI state — is this live, historical, or inferred? Use the right channel.
- New store field — who reads it, how often does it change, does it belong elsewhere?
- Polling — can a lighter payload erase richer existing data?
- Optimistic update — where is rollback, reconciliation, dedupe?
- Shared contract — does this break web, Electron, *and* VS Code?
- Mobile — what does this look like on mobile? Does the keyboard / safe-area still work?
- Bug fix via heuristic — narrow the heuristic, don't widen it.

## Skill gates (MANDATORY — load before starting matching work)

Skills live in `.opencode/skills/<name>/SKILL.md` and are loaded on demand. Read the matching skill **before** writing code in its domain.

| Trigger                                                                                | Skill                              |
| -------------------------------------------------------------------------------------- | ---------------------------------- |
| Any UI / styling / colour change                                                       | `theme-system`                     |
| Any UI that may run on mobile/PWA (layouts, panels, chat chrome, drawers, keyboard)    | `mobile-first-ui`                  |
| Settings sections / settings shell work                                                | `settings-ui-patterns`             |
| Terminal CLI work in `packages/web/bin/*`                                              | `clack-cli-patterns`               |
| Zustand stores, SSE/event handlers, polling, scroll/DOM, optimistic updates, hot-path React | `performance-rules`         |

Invoke with: `skill({ name: "<name>" })`.

## Where new code goes

- New shared component → `packages/ui/src/components/`. Mobile variant if applicable (`Mobile<Name>` paired with the desktop one).
- New zustand store → `packages/ui/src/stores/`. Split by change frequency and subscriber set; do not bolt onto an existing broad store.
- New sync-layer state (live session/message/streaming) → `packages/ui/src/sync/`. Read `packages/ui/src/sync/DOCUMENTATION.md` first.
- New server route or server-side module → `packages/web/server/lib/<domain>/` with a `DOCUMENTATION.md`.
- New desktop IPC handler → `packages/electron/main.mjs` + `preload.mjs` (preserve the `__TAURI__` shim).
- New VS Code bridge → `packages/vscode/src/bridge-*-runtime.ts`.

## Tech stack (verified — `package.json`, `bun.lock`)

- Bun (`packageManager`), Node ≥20 (`engines`)
- React + TypeScript + Vite + Tailwind v4
- State: Zustand (`packages/ui/src/stores/` and the sync child stores in `packages/ui/src/sync/`)
- UI primitives: **Base UI** (`@base-ui/react`) is the primary source — wrappers live in `packages/ui/src/components/ui/`. Radix UI and HeroUI are present but legacy; do not use for new code. Icons: Remixicon.
- Server: Express
- Desktop: Electron 41 (forward), Tauri v2 (legacy)
- PWA: `vite-plugin-pwa`

## Entry points

- Web bootstrap: `packages/web/src/main.tsx`
- Web server: `packages/web/server/index.js`
- Web CLI: `packages/web/bin/cli.js`
- Electron main: `packages/electron/main.mjs` (preload: `packages/electron/preload.mjs`)
- Tauri main (legacy): `packages/desktop/src-tauri/src/main.rs`
- VS Code extension host: `packages/vscode/src/extension.ts`
- VS Code webview bootstrap: `packages/vscode/webview/main.tsx`

## OpenCode integration

- UI client wrapper: `packages/ui/src/lib/opencode/client.ts` (imports `@opencode-ai/sdk/v2`)
- Live event stream: `packages/ui/src/hooks/useEventStream.ts`
- Server boot: `createOpencodeServer` in `packages/web/server/index.js`
- Filesystem endpoints: search `packages/web/server/index.js` for `/api/fs/`
- External server: set `OPENCODE_HOST` (full base URL, e.g. `http://hostname:4096`) or `OPENCODE_PORT`, plus `OPENCODE_SKIP_START=true`, to connect to an existing OpenCode instance.

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

## Coding rules

- Keep diffs tight; avoid drive-by refactors.
- TypeScript: no `any`, no blind casts, no shape guessing.
- React: function components + hooks. Early returns over nested ternaries.
- Styling: Tailwind v4. Typography via `packages/ui/src/lib/typography.ts`. Theme tokens only — no hex, no Tailwind colour classes. (Detail: `theme-system` skill.)
- Toasts: import the wrapper from `@/components/ui`. Never import `sonner` directly in feature code.
- Cross-runtime parity: shared route/payload contracts must work in web, Electron, and VS Code. Differences must be intentional and visible in code.
- Reuse shared primitives in `packages/ui/src/components/ui/` before introducing feature-local markup patterns.

## Architecture patterns

- **Thin entrypoints, focused modules.** Bridge files, bootstrap files, provider roots, and `index.js` files orchestrate; route/domain logic lives in focused modules with clear ownership. Update module docs when ownership changes.
- **Live vs historical state.** Derive live UI behaviour from live channels (sync stores, SSE), not persisted history. Use historical records to restore context, not to infer that work is still in progress.
- **Cross-runtime parity.** If web defines a route or payload contract that shared UI depends on, keep VS Code and Electron parity. Do not ship a web-only assumption into shared UI.
- **Partial-failure-safe flows.** Cross-directory and multi-entity operations must tolerate partial failure. Prefer per-item results, rollback paths, or resumable cleanup over all-or-nothing assumptions. Never leave optimistic state stranded after failure.

## CLI parity (terminal CLI only — `packages/web/bin/*`)

Validation and safety gates MUST live in core command logic, not in the Clack prompts. The same outcome must hold across interactive TTY, piped/non-TTY, `--quiet`, `--json`, and fully-flagged invocations. Invalid operations fail with non-zero exit and deterministic error semantics. Detail: `clack-cli-patterns` skill.

## Build / validate

| Command                       | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `bun run type-check`          | TypeScript validation                |
| `bun run lint`                | ESLint                               |
| `bun run build`               | Build all packages                   |
| `bun run electron:dev`        | Desktop dev (Electron — primary)     |
| `bun run electron:build`      | Desktop build (Electron — primary)   |
| `bun run desktop:build`       | Desktop build (Tauri — legacy)       |
| `bun run vscode:build`        | VS Code extension                    |
| `bun run release:test`        | Release smoke (`scripts/test-release-build.sh`) |
| `scripts/verify.sh`           | Full verification (type-check + lint + build)  |

Run `scripts/verify.sh` before finalising any change. At minimum, run `bun run type-check` and `bun run lint`.

## Verification expectations

- Hot-path changes (stores, SSE, scroll): verify under streaming, not static render.
- Sync/startup changes: verify fresh load, retry/failure, restart.
- Session changes: verify create, stream, abort, permission, archive/delete, revisit.
- UI changes: verify both desktop **and** mobile layouts, including soft-keyboard behaviour.
