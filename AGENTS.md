# OpenChamber — Agent Reference

OpenChamber is a mobile-first UI for an OpenCode server. The UI talks to OpenCode over HTTP + SSE/WebSocket via `@opencode-ai/sdk`.

## Runtime map

| Surface          | Path                         | Status                                              |
| ---------------- | ---------------------------- | --------------------------------------------------- |
| Web app + server | `packages/web`               | Active. All backend logic lives here.               |
| Browser UI       | `packages/web/src/ui`        | Active. Presentation and browser state owner.       |

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

- New shared component → `packages/web/src/ui/components/`. Mobile variant if applicable (`Mobile<Name>` paired with the desktop one).
- New zustand store → `packages/web/src/ui/stores/`. Split by change frequency and subscriber set; do not bolt onto an existing broad store.
- New sync-layer state (live session/message/streaming) → `packages/web/src/ui/sync/`. Read `packages/web/src/ui/sync/DOCUMENTATION.md` first.
- New server route or server-side module → `packages/web/server/src/domains/<domain>/` with a `DOCUMENTATION.md`.

## Tech stack

- Bun (`packageManager`), Node ≥20 (`engines`)
- React + TypeScript + Vite + Tailwind v4
- State: Zustand (`packages/web/src/ui/stores/` and sync child stores in `packages/web/src/ui/sync/`)
- UI primitives: **Base UI** (`@base-ui/react`) — wrappers in `packages/web/src/ui/components/ui/`. Radix UI and HeroUI are legacy; do not use for new code. Icons: Remixicon.
- Server: Express
- PWA: `vite-plugin-pwa`

## Entry points

- Web bootstrap: `packages/web/src/ui/main.tsx`
- Web server: `packages/web/server/index.js`
- Web CLI: `packages/web/bin/cli.js`

## OpenCode integration

- UI client wrapper: `packages/web/src/ui/lib/opencode/client.ts` (imports `@opencode-ai/sdk/v2`)
- Live event stream: `SyncProvider` in `packages/web/src/ui/sync/sync-context.tsx`
- Server boot: `createOpencodeServer` in `packages/web/server/index.js`
- Filesystem endpoints: search `packages/web/server/index.js` for `/api/fs/`
- External server: set `OPENCODE_HOST` (full base URL) or `OPENCODE_PORT`, plus `OPENCODE_SKIP_START=true`, to connect to an existing OpenCode instance.

## Documentation map

Read the relevant `DOCUMENTATION.md` before modifying that module.

| Module                              | Docs                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| Sync layer (live session / streaming) | `packages/web/src/ui/sync/DOCUMENTATION.md`                 |
| quota                               | `packages/web/server/src/domains/quota/DOCUMENTATION.md`      |
| git                                 | `packages/web/server/src/domains/git/DOCUMENTATION.md`        |
| github                              | `packages/web/server/src/domains/github/DOCUMENTATION.md`     |
| opencode                            | `packages/web/server/src/domains/opencode/DOCUMENTATION.md`   |
| fs                                  | `packages/web/server/src/domains/fs/DOCUMENTATION.md`         |
| ui-auth                             | `packages/web/server/src/domains/ui-auth/DOCUMENTATION.md`    |
| skills-catalog                      | `packages/web/server/src/domains/skills-catalog/DOCUMENTATION.md` |

## Styling rules

- Theme tokens only — no hex, no Tailwind colour classes. Use `useThemeSystem()` hook or CSS variables (`var(--surface-elevated)`).
- Typography via `packages/web/src/ui/lib/typography.ts`.
- Toasts: import the wrapper from `@/components/ui`. Never import `sonner` directly.

## Architecture patterns

- **Thin entrypoints, focused modules.** Route/domain logic lives in focused modules with clear ownership.
- **Partial-failure-safe flows.** Prefer per-item results, rollback paths, or resumable cleanup over all-or-nothing assumptions.

## CLI parity (terminal CLI — `packages/web/bin/*`)

Validation and safety gates MUST live in core command logic, not in prompts. The same outcome must hold across interactive TTY, piped/non-TTY, `--quiet`, `--json`, and fully-flagged invocations. Invalid operations fail with non-zero exit.

## Build / validate

| Command                       | Purpose                              |
| ----------------------------- | ------------------------------------ |
| `bun run dev`                 | Web development watchers             |
| `bun run build`               | Build session state, web, and server |
| `bun run start:web`           | Build and start the web product      |
| `bun run pack:session-state`  | Pack the session-state package       |
| `bun run pack:web`            | Pack the web package                 |
| `bun run type-check`          | TypeScript validation                |
| `bun run lint`                | ESLint                               |
| `bun run test:stores`         | Browser store tests                  |
| `bun run test:web`            | Web integration tests                |
| `bun run test:react`          | React component tests                |
| `bun run test:integration`    | End-to-end integration tests         |
| `bun run test:opencode`       | OpenCode integration tests           |
| `bun run test:perf`           | Performance benchmarks               |
| `scripts/verify.sh`           | Full verification (type-check + lint + build)  |

Run `scripts/verify.sh` before finalising any change. At minimum, run `bun run type-check` and `bun run lint`.

## Test process safety (HARD RULES)

The test harness spawns `opencode serve` instances. Cleanup is **already handled by two layers** in `tests/helpers/opencode-process.ts` and `tests/helpers/opencode-watchdog.cjs`:

1. **PID recording** — every spawn writes `child.pid` to `<tempdir>/pid`.
2. **Sibling watchdog** — a tiny Node child of the test process polls `process.ppid`; on parent death (including SIGKILL), it SIGKILLs the recorded opencode PID.
3. **Orphan reaper** — `startOpenCodeInstance()` scans `/tmp/openchamber-opencode-*/pid` and kills any recorded PID that is still alive.

**Therefore:**

- **NEVER** add a "verify stoppage" step that runs `pgrep`, `killall`, `pkill`, or any name-based process match. The two layers above are sufficient and self-healing; a third layer cannot distinguish test-spawned from user-spawned processes and will kill the user's own `opencode` sessions.
- **NEVER** include `pgrep`/`killall`/`pkill` in subagent prompts (verifier, reviewer, implementer, researcher). Subagents follow instructions literally and will match the user's opencode.
- **NEVER** dispatch a subagent to "check for orphan opencode processes" or "verify cleanup." Cleanup verification is pid-file-based only: every `pid` file under `/tmp/openchamber-opencode-*/` must reference a dead PID.

If a test leak is suspected, debug by reading the pid files and checking `process.kill(pid, 0)` for liveness — never by name.

# VAULT

This project has a private Obsidian vault mounted via the `vault` MCP server. The vault root is `Projects/openchamber/` inside the user's Obsidian vault, and all vault paths are sandboxed to that subtree.

Use the vault for durable project memory and high-level roadmap context:

- long-term direction and product/architecture principles
- high-level roadmap notes, not step-by-step implementation plans
- architectural rationale, tradeoffs, and decisions worth remembering
- constraints, invariants, and non-obvious project/domain context
- general progress summaries and milestone notes
- follow-up ideas worth preserving across sessions

Do not use the vault for active execution planning. Concrete specs, implementation plans, task breakdowns, TDD notes, verification checklists, and session scratchpads belong in `.superpawers/`.

When meaningful work completes, do a quick vault hygiene pass:

- skim relevant vault notes with `vault.search` / `vault.get_context`
- decide whether the completed work changed durable project memory
- if yes, update a short note in `summaries/`, `roadmap.md`, `direction.md`, `decisions/`, or `context/`
- if no durable memory changed, do nothing

A small completion-update agent may be dispatched for this pass. Its job is only to check whether the vault needs a durable-memory update, not to create execution plans. Prefer `vault.edit` over `vault.write` for existing files. `vault.delete` is destructive and irreversible — confirm paths first.
