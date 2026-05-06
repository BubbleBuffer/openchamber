# VS Code Extension Source Layout

This document describes the source layout under `packages/vscode/src/` and the backend runtime modules used by the VS Code extension bridge (`packages/vscode/src/bridges/bridge.ts`).

## Directory layout

```
packages/vscode/src/
  extension.ts              # Activation entry point
  git.d.ts                  # VS Code git API ambient types
  gitService.ts             # Git operations consumed by bridge runtimes
  sseProxy.ts               # SSE proxy used by webview providers
  sessionActivityWatcher.ts # Global session activity watcher
  quotaProviders.ts         # Quota provider lookup
  shikiThemes.ts            # Shiki theme bridge
  skillsCatalog.ts          # Skills catalog bridge
  theme.ts                  # VS Code theme detection
  bridges/                  # Bridge orchestration + per-domain runtimes
  providers/                # Webview view/panel providers
  github/                   # GitHub API integration (auth, issues, PRs)
  opencode/                 # OpenCode runtime: manager, auth, config, ready gate
  webview-host/             # Webview HTML composition + dev server resolution
```

## bridges/

Keep `bridges/bridge.ts` as a thin orchestration layer that delegates message handling to cohesive domain runtimes while preserving API behavior.

- `bridge.ts`
  - Entry orchestration layer for bridge messages.
  - Delegates to specialized runtimes in order and handles only unmatched fallthrough cases.

- `bridge-git-runtime.ts`
  - Standard Git message handlers.

- `bridge-git-special-runtime.ts`
  - Specialized Git flows (`pr-description`, `conflict-details`) and generation helpers.

- `bridge-git-process-runtime.ts`
  - Git process execution and environment setup (`execGit`), including SSH agent socket resolution.

- `bridge-fs-runtime.ts`
  - Bridge handlers for filesystem-related message routes.
  - Uses shared FS helpers via injected dependencies.

- `bridge-fs-helpers-runtime.ts`
  - Filesystem/path/search helper functions:
    - path normalization and resolution
    - directory listing
    - file search
    - file read path safety checks
    - dropped-file parsing and attachment reading
    - models metadata fetch helper

- `bridge-localfs-proxy-runtime.ts`
  - Local `/api/fs/read` and `/api/fs/raw` proxy helpers and shared proxy utility helpers.

- `bridge-proxy-runtime.ts`
  - Proxy route handlers (`api:proxy`, `api:session:message`) with injected helper dependencies.

- `bridge-config-runtime.ts`
  - Config and skills message handlers (`api:config/*`).
  - Includes OpenCode resolution diagnostics parity handler used by shared UI (`/api/config/opencode-resolution`).

- `bridge-settings-runtime.ts`
  - Settings read/write and OpenCode skills discovery via API for bridge consumers.

- `bridge-system-runtime.ts`
  - System/editor/provider/quota/notification/update-check message handlers.
  - Includes session activity snapshot bridge handler used by webview parity routes (`/api/session-activity`).
  - Includes Zen utility model parity handler used by shared notification settings (`/api/zen/models`).

## providers/

`ChatViewProvider`, `SessionEditorPanelProvider`, `AgentManagerPanelProvider` — webview view/panel providers wired up in `extension.ts`.

## github/

`githubAuth.ts`, `githubIssues.ts`, `githubPr.ts`, `githubPulls.ts` — GitHub API integration consumed via bridge handlers.

## opencode/

`opencode.ts` (the `OpenCodeManager`), `opencodeAuth.ts`, `opencodeConfig.ts`, `opencode-ready.ts` (API-readiness gate).

## webview-host/

`webviewHtml.ts`, `webviewDevServer.ts` — HTML composition for webviews and dev-server URL resolution.

## Extension guideline

When adding new bridge route families:

1. Prefer creating or extending a domain runtime module under `packages/vscode/src/bridges/bridge-*-runtime.ts`.
2. Keep `bridges/bridge.ts` focused on delegation order and minimal fallthrough behavior.
3. Inject dependencies into runtimes instead of reaching into unrelated modules directly.
