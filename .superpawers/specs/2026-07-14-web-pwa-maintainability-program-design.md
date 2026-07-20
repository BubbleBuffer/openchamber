---
kind: spec
status: active
id: web-pwa-maintainability-program
created: 2026-07-14
updated: 2026-07-20
---

# Web/PWA Maintainability Program

## Implementation Chunks

### Chunk: electron-removal
Status: completed
Goal: Remove the Electron product, native-shell behavior, SSH management, and all desktop-specific maintenance surfaces.
Acceptance:
- `packages/electron` and Electron-only UI, stores, globals, IPC shims, tests, scripts, dependencies, release jobs, assets, documentation, and configuration are deleted.
- SSH Remote Instances, desktop host switching, native update/deep-link/menu/window/filesystem behavior, and Tauri compatibility paths have no surviving product code.
- Browser/PWA builds and tests do not define or mock desktop capability globals.
- Root verification no longer invokes or describes Electron.

### Chunk: vscode-removal
Status: completed
Goal: Remove the VS Code extension and its duplicated runtime implementations without weakening the web product.
Acceptance:
- `packages/vscode` and VS Code-only bridges, webview bootstraps, tests, scripts, dependencies, workflows, docs, and release configuration are deleted.
- Git, GitHub, quota, filesystem, and OpenCode behavior has exactly one maintained server implementation.
- Root verification no longer invokes or describes VS Code.
- No compatibility facade remains solely to make a future extension easier.

### Chunk: scheduled-tasks-removal
Status: completed
Goal: Remove scheduled tasks as a product capability because background task orchestration is outside the OpenCode workspace scope.
Acceptance:
- Scheduled-task server domains, routes, settings, event types, client stores, UI, tests, prompts, and documentation are deleted.
- No background-task quit guard, notification path, or compatibility field remains.
- Session prompting and ordinary foreground tool execution continue to work.

### Chunk: web-product-consolidation
Status: completed
Goal: Give the browser application, server, CLI, and network contracts one obvious product owner and remove shell-era package boundaries.
Acceptance:
- The maintained runtime topology is the web/PWA client plus one OpenChamber server and CLI.
- `packages/ui` is folded into the web product unless a written dependency audit demonstrates that the package boundary has a current independent responsibility.
- The final workspace topology contains no package justified only by a hypothetical future consumer.
- Local loopback and remote/self-hosted deployments run the same application and domain behavior.
- Development, build, package, and start commands are direct and documented from the repository root.

### Chunk: domain-network-contracts
Status: active
Goal: Replace ad hoc cross-layer types and compatibility globals with explicit domain-oriented HTTP, SSE, and WebSocket contracts.
Acceptance:
- Requests, responses, events, and stable error codes are grouped by domain rather than accumulated in a bulk API types file.
- Untrusted network and persisted inputs are validated at runtime boundaries; internal code receives typed values.
- Browser features depend on network contracts, not Express, server services, filesystem types, or shell globals.
- The supported protocol and authentication expectations are documented well enough for a future shell to integrate without retaining current shell code.
- Contract tests cover success, invalid input, authorization failure, and representative partial-failure behavior.

### Chunk: server-cli-decomposition
Status: planned
Goal: Make server startup and CLI dispatch thin, explicit composition layers over focused domain services.
Acceptance:
- `startWebUiServer()` visibly composes configuration, infrastructure, domains, transports, startup order, and cleanup without owning domain behavior.
- The CLI entrypoint parses and dispatches; validation and safety policy live in reusable command or domain logic for interactive and non-interactive modes.
- Express request/response objects do not leak into core domain services.
- Cross-domain coordination uses explicit dependencies or focused orchestration services, not hidden imports or shared mutable singletons.
- Startup, partial startup failure, shutdown, external OpenCode connection, and authentication boundaries have focused tests.
- Every active server domain has concise ownership and invariant documentation.

### Chunk: state-authority-convergence
Status: planned
Goal: Finish the documented live-state architecture so every client concern has one authoritative owner.
Acceptance:
- `@openchamber/session-state` remains the authority for session lifecycle, streaming, retry, interruption, history, and machine invariants.
- Directory stores remain authoritative for current live data; global session coverage cannot overwrite fresher live state.
- Presentation stores are split by update frequency and subscriber set and contain no server or session-machine truth.
- Deprecated streaming exports, obsolete adapters, redundant mirrors, and broad-store fields have no consumers and are deleted.
- High-frequency event handlers clone only collections touched by each event and avoid broad React subscriptions.
- Reconnect, replay/gap recovery, directory switching, cold-session discovery, and optimistic rollback have regression tests.

### Chunk: component-design-system-convergence
Status: planned
Goal: Reduce oversized client surfaces into understandable feature components using one mobile-first design system.
Acceptance:
- Large components are split at state-ownership, interaction, or reusable-behavior seams rather than by arbitrary line count.
- Base UI wrappers are the sole primitive layer; HeroUI and Radix production imports and dependencies are removed.
- Theme tokens and typography helpers are used consistently with no hardcoded color system.
- Desktop/VS Code navigation and settings affordances are removed, and remaining navigation is coherent on phone and desktop browser widths.
- Touched surfaces include loading, empty, error, keyboard, focus, and accessibility behavior in their tests.
- Reproducible adjacent defects found while establishing a component boundary are fixed and tested.

### Chunk: protected-domain-hardening
Status: planned
Goal: Preserve and make independently maintainable the workspace capabilities that define OpenChamber.
Acceptance:
- Sessions/chat, projects/files, terminal, Git/worktrees, GitHub, quota, models, tools/permissions, and settings each have a documented owner and focused public interface.
- Git, GitHub, quota, filesystem, and terminal logic has no duplicated runtime implementation.
- Remaining unsafe type escapes and lint errors in protected domains are replaced by concrete contracts or `unknown` narrowing without blanket suppressions.
- Each protected domain has focused success, failure, and boundary tests proportional to its risk.
- Removal or refactoring does not reduce the observable protected feature set except where this spec explicitly permits a clean break.

### Chunk: pwa-auth-runtime
Status: planned
Goal: Make browser installation and single-owner local/remote operation a first-class runtime rather than a desktop fallback.
Acceptance:
- The application is installable as a PWA and implements the update and offline invariants in Section 6.
- Browser notifications, permissions, clipboard, and file-picker capability failures have understandable UI states.
- Direct loopback operation may be frictionless; a non-loopback bind or trusted-proxy mode refuses to start until an owner bootstrap credential is configured.
- Owner sessions use protected cookies, expire and revoke consistently, and require reauthentication without losing recoverable live-stream position.
- HTTP mutations, SSE, and WebSocket upgrades enforce the origin, CSRF, cookie, and proxy-trust invariants in Section 5.
- Password bootstrap, logout, expiry, credential reset, and lost-credential recovery are documented and tested without introducing multi-user tenancy.

### Chunk: quality-gates-and-test-architecture
Status: planned
Goal: Turn the surviving product's maintainability rules into reliable automated feedback.
Acceptance:
- `scripts/verify.sh` passes and applies the workspace-specific checks in Section 9; production builds are required only for workspaces that publish or deploy an artifact.
- Surviving first-party TypeScript and TSX lint errors and warnings are reduced to zero before warning rules become CI-blocking; no blanket or file-wide suppression hides debt.
- Complexity and file-size fixes follow real responsibility seams and do not create pass-through modules solely to satisfy metrics.
- Root commands provide one documented interface for unit, store, React, server, integration, and performance tests even if specialized runners remain justified underneath.
- CI runs the deterministic test layers appropriate for pull requests; environment-dependent integration tests have an explicit reliable lane.
- OpenCode process tests retain PID-file/watchdog cleanup and never use process-name matching.
- Performance protections for hot chat and sync paths remain measured and enforceable.

### Chunk: dependency-documentation-convergence
Status: planned
Goal: Remove residual dead code and leave repository metadata, dependencies, and documentation describing only the maintained product.
Acceptance:
- Workspace manifests, lockfile, patches, scripts, assets, CI, release workflows, environment variables, and dependencies contain no unused shell or removed-feature entries.
- Unused production dependencies and legacy compatibility utilities are deleted; remaining patches and overrides have current rationale.
- Stale planning documents are marked historical, superseded, completed, or removed so exactly one active program source of truth remains.
- Architecture documentation describes package ownership, state authority, network contracts, local/remote security, tests, and contribution rules without contradicted paths.
- A final dead-reference audit finds no Electron, VS Code, scheduled-task, Tauri compatibility, SSH Remote Instance, HeroUI, or Radix production path.
- Full verification and protected-workflow smoke tests pass from a fresh install.

## 1. Decision Summary

OpenChamber will become one web-native, single-owner OpenCode workspace. The same product supports local browser use, installation as a PWA, and remote/self-hosted access. Electron and VS Code are not lower-priority runtimes; they are removed. Network contracts, rather than shared shell implementation code, are the extension point for any future shell.

This program deliberately permits a clean compatibility break. Existing local-storage layouts, undocumented APIs, shell settings, and deprecated exports do not constrain the end state. The work preserves the valuable behavior and engineering knowledge in the current web client, session machine, server domains, and tests rather than attempting a wholesale rewrite.

## 2. Product Scope

### Protected capabilities

- OpenCode sessions, chat, messages, models, tools, permissions, retries, and recovery
- Projects and file browsing/editing
- Terminal
- Git and worktrees
- GitHub integration
- Quota integrations
- Settings needed by the protected capabilities
- Local and remote/self-hosted browser operation
- PWA installation, updates, notifications, and reconnect behavior

### Protected workflow matrix

The clean compatibility break permits storage and internal API changes, not accidental loss of these user outcomes:

| Capability | Minimum protected workflows |
|------------|-----------------------------|
| Sessions and chat | List, create, open, rename/archive when supported, prompt, stream incremental output, recover after reconnect, restore history, cancel, retry, and handle tool/permission requests. |
| Models, tools, and permissions | Discover available choices, select them, submit their configuration with a prompt, render tool progress/results, approve or deny requests, and surface unsupported or failed operations. |
| Projects and files | Discover and switch projects/directories, browse and search files, read content, save edits, and report conflicts or filesystem failures without silent data loss. |
| Terminal | Create a terminal, stream output, send input, resize, reconnect where supported, and close/clean up the process. |
| Git and worktrees | Read status/diff/history, stage and unstage, commit, manage branches, perform the currently supported stash/rebase/conflict flows, create/manage worktrees, and return explicit partial failures. |
| GitHub | Authenticate, load repository and pull-request state, perform the currently exposed pull-request actions, refresh status, and isolate provider/API failures from local Git behavior. |
| Quota | Load configured providers, refresh usage, preserve successful provider results when another provider fails, and expose credential/rate-limit errors safely. |
| Settings | Load, change, validate, and reset settings used by protected capabilities; invalid settings cannot partially corrupt the persisted configuration. |
| Local web/PWA | Start through the documented CLI, load on loopback, install as a PWA, reconnect after server interruption, and update without losing an unsent draft silently. |
| Remote web/PWA | Refuse insecure unconfigured exposure, authenticate the owner, protect HTTP/SSE/WebSocket access, survive session expiry through reauthentication, and operate behind a documented trusted reverse proxy. |

Plans may add more focused acceptance tests, but they may not narrow this matrix without changing the spec.

### Removed capabilities and runtimes

- Electron and all native desktop behavior
- VS Code extension and webview
- SSH-managed Remote Instances and desktop host switching
- Scheduled tasks and background-task lifecycle
- WebAuthn/passkey enrollment unless a later approved design demonstrates value beyond the single-owner password/session model
- Native updater, custom deep links, menus, multi-window behavior, arbitrary local-path integration, app discovery, and reveal/open-in-IDE behavior
- Tauri compatibility shims and cross-runtime parity infrastructure

### Explicit non-goals

- Multi-user accounts, tenancy, per-user filesystem isolation, or role-based authorization
- A visual redesign unrelated to removed navigation or touched component boundaries
- Preserving old persistence, internal API, or shell compatibility contracts
- Building speculative abstractions for a future Electron, VS Code, or other shell
- Replacing the application wholesale when a tested current subsystem already has clear ownership

## 3. End-State Architecture

### Runtime topology

```text
installed PWA / browser
        |
        | HTTP + SSE + WebSocket
        v
OpenChamber server and CLI
        |
        +-- OpenCode SDK / OpenCode process
        +-- filesystem and projects
        +-- terminal processes
        +-- Git and GitHub
        +-- quota providers
```

The server is the sole privileged runtime. Browser code does not perform privileged work through injected globals or shell bridges. Local and remote deployments use the same contracts and behavior.

### Dependency direction

```text
browser feature -> domain contract -> transport adapter -> domain service -> external system
```

- Composition creates dependencies and controls lifecycle.
- Domains own business behavior and policy.
- Transports validate and translate network input.
- Browser features own presentation and interaction, not server policy.
- Runtime-specific external systems are behind narrow adapters.

Dependencies point inward toward contracts and domain logic. Express, browser APIs, SDK clients, and process handles stay at boundaries.

### Package direction

The expected maintained workspaces are the web product, `@openchamber/session-state`, documentation, and tests. `packages/ui` should normally be folded into the web workspace after its only additional consumers are removed. A plan may retain it only if it identifies a concrete present-day responsibility that benefits from separate versioning, dependency ownership, or build isolation. "A future shell might use it" is not sufficient.

`@openchamber/session-state` remains separate because it is a runtime-independent model with meaningful invariants and focused tests. It must continue to exclude React, DOM, Express, filesystem, SDK client, and server runtime dependencies.

## 4. State And Data Flow

The current documented state authority model is preserved and completed:

- The session machine owns session lifecycle and streaming semantics.
- Directory child stores own live per-directory server data.
- The global sessions cache owns cold and cross-directory coverage only.
- Presentation stores own user-interface state grouped by change frequency and subscriber set.
- Request-driven server data is not copied into broad global stores without a demonstrated synchronization need.

Live state wins over historical or persisted state. Optimistic changes identify rollback behavior. Event handlers update only the collections each event can affect. No cleanup task may merge stores merely to reduce store count; it must improve authority, update frequency, or subscriber isolation.

## 5. Error, Authentication, And Failure Model

- Network boundaries return stable domain error codes plus safe user messages.
- Unknown exceptions are logged with diagnostic context but do not expose secrets or raw credentials.
- Batch operations report per-item outcomes where partial success is possible.
- Startup is staged, with explicit cleanup when a later stage fails.
- Streaming defines connection, authentication expiry, replay/gap recovery, stall, reconnect, and terminal-failure states.
- PWA update and offline behavior must not silently strand the user on an incompatible client/server pair.
- Unsupported browser capabilities degrade explicitly rather than invoking deleted desktop paths.

Single-owner authentication follows these invariants:

- Frictionless loopback access is permitted only when the server itself is bound exclusively to loopback and proxy trust is disabled. Any non-loopback bind or trusted-proxy mode requires normal owner authentication even when the immediate proxy peer is loopback.
- A direct loopback client receives an automatically issued local-owner session and CSRF token, so state-changing requests follow the same origin and CSRF checks as authenticated remote requests. Host headers and untrusted forwarded headers cannot grant local trust.
- A non-loopback bind or trusted-proxy mode fails closed unless an owner bootstrap credential is explicitly supplied or initialized by the CLI. There is no default remote password.
- The bootstrap password is the owner login and recovery credential. It is never returned by an API or persisted in browser-readable storage.
- Authenticated sessions use random server-verifiable tokens in `HttpOnly`, `SameSite=Lax` cookies. `Secure` is required whenever the public origin is HTTPS. Logout, owner reset, and expiry invalidate server-side session state.
- State-changing HTTP requests require an allowed `Origin` plus a per-session CSRF token. SSE requests authenticate the session cookie. WebSocket upgrades authenticate the cookie and validate `Origin` before accepting the upgrade.
- Reverse-proxy trust is disabled by default. When enabled, trusted proxy addresses and the public origin are explicit; forwarded host, protocol, and client addresses are ignored from untrusted peers.
- Expiry produces a stable authentication error. The client stops mutations, closes or rejects live transports, prompts for authentication, and resumes SSE/WS from the last valid event position after successful login when replay is available.
- CLI owner reset is the lost-credential recovery path. It invalidates all sessions and requires physical/server access; there is no email or multi-user recovery system.

## 6. PWA Update And Offline Model

OpenChamber is installable and resilient to connection loss, but it is not an offline editor or an offline command queue.

- The service worker caches only versioned application-shell and immutable static assets. Authenticated API responses, session/message payloads, file contents, terminal data, Git/GitHub data, quota responses, and credentials are not persisted in shared HTTP caches.
- Already-rendered in-memory data may remain visible while disconnected, clearly marked stale. Server-backed mutations, prompts, terminal input, file writes, and Git/GitHub actions are disabled until reconnection; they are never silently queued for later replay.
- Draft text remains local to the active client state. An update or reconnect cannot silently discard a non-empty draft.
- A newly downloaded compatible service worker waits while the current client is active. The UI announces the update and allows the user to activate/reload at a safe boundary; it does not replace the running application mid-stream or during an active mutation.
- Compatible update download or installation failure leaves the current worker and application usable and presents a retry action.
- The server exposes a protocol/build compatibility value. An incompatible client immediately enters a blocking read-only update state and makes no further mutations. Once the replacement worker is available, activation/reload occurs automatically only at a safe boundary: no active mutation or prompt stream is running and any non-empty draft has been preserved. Obsolete application-shell caches are then purged.
- If an incompatible replacement cannot be downloaded or activated, the current application remains read-only and presents retry plus network-reload recovery. It never resumes mutations against the incompatible server contract.
- If no cached shell exists, offline navigation returns an explicit unavailable response. If a cached shell exists, it opens into the disconnected read-only state described above.

## 7. Adjacent Improvement Policy

Cleanup is allowed to round off the code it makes authoritative. A chunk may fix a nearby issue when all of the following are true:

- The issue is reproducible or directly visible in the touched flow.
- The fix belongs to the boundary currently being established.
- The behavior is covered by a regression test or a clear automated contract check.
- The change does not introduce an unrelated capability or visual redesign.
- The plan records the issue and why fixing it now reduces future maintenance.

Examples include stale loading state, missing empty/error handling, keyboard or focus defects, broken mobile layout, unsafe optimistic rollback, misleading labels after feature removal, and accessibility defects in a component being decomposed.

## 8. Deletion Standard

A removed runtime or feature is complete only when all of its maintenance surface is gone:

- Source and tests
- Public types, events, routes, settings, and persisted fields
- Dependencies, lockfile entries where no longer transitive, and patches
- Root and package scripts
- Build, release, and CI workflows
- Assets, icons, entitlements, and packaging configuration
- Documentation, screenshots, environment variables, and agent instructions
- Compatibility branches, feature detection, mocks, and dead fallbacks

Temporary compatibility code is prohibited unless a specific active plan demonstrates that it is needed between two already-scheduled tasks. It must name its deletion task.

## 9. Quality And Testing Strategy

Every implementation plan uses the smallest relevant test first and preserves a green focused loop. Behavior changes and bug fixes follow red-green-refactor. Pure deletion must be protected by build, type, lint, import/reference, and affected integration checks.

Verification expands with risk:

1. Focused unit or contract tests for the touched behavior.
2. Affected package type-check and lint.
3. Store and React tests for client state or component work.
4. Server and integration tests for transport, lifecycle, OpenCode, terminal, Git, or filesystem work.
5. Performance checks for hot rendering, event, sync, scroll, or store paths.
6. `scripts/verify.sh` and all protected-workflow smoke tests at chunk boundaries and final convergence.

Tests that spawn OpenCode retain the repository's PID-file, watchdog, and orphan-reaper safeguards. No command, test, plan, or agent prompt may use `pgrep`, `pkill`, `killall`, or another process-name match.

The program begins from a known-bad baseline on 2026-07-14: type-check passes; lint reports 463 errors across the current web, UI, and tests workspaces; and the VS Code webview build exceeds the baseline verifier timeout. These are inherited debts, not acceptable final exceptions.

Final verification applies checks by responsibility:

| Workspace/surface | Required final checks |
|-------------------|-----------------------|
| Browser application | Strict type-check, ESLint, production Vite/PWA build, component/store tests, and protected browser-workflow tests. |
| Server and CLI | Strict server type-check, ESLint, production compile/package check, domain tests, CLI-mode tests, and integration tests. |
| `@openchamber/session-state` | Strict type-check, ESLint, machine/fixture tests, and package build or export validation if it remains a published artifact. |
| Documentation | Link/frontmatter validation and documentation build when the docs site is deployed; no artificial TypeScript build requirement. |
| Test workspace | Strict type-check, ESLint, test discovery/config validation, and execution through the appropriate root test commands; no production bundle. |

The final lint gate is zero errors and zero warnings in maintained first-party TypeScript/TSX under the centrally configured rules. Production code is limited to cyclomatic complexity 10 and 600 lines per file. Generated files, vendored code, static data, and test fixtures may be excluded only through a narrow central configuration entry with written rationale. Tests may use separately calibrated limits when readability is improved by complete scenarios. Once the surviving code reaches zero warnings, CI runs ESLint with `--max-warnings 0`; thresholds cannot be weakened merely to land a change.

## 10. Execution And Sequencing

The program uses contraction-first sequencing:

1. Remove Electron, VS Code, and scheduled tasks so later architecture serves only the real product.
2. Consolidate the web product and establish domain network contracts.
3. Decompose server/CLI composition and converge client state authority.
4. Refine components and harden protected domains while fixing qualifying adjacent defects.
5. Complete PWA/auth behavior, quality gates, dependency cleanup, and documentation convergence.

Chunks are durable scope labels, not mandatory one-plan units. A chunk may require several plans; a plan may cover tightly coupled portions of more than one chunk when doing so avoids temporary compatibility code. Each plan must declare `parent_spec` and `covers_chunks`, identify observable acceptance, include verification, and leave a concrete next action.

The controller is authorized to select the next uncovered or partially covered chunk, write and review its plan, implement it through isolated tasks, request code review, run independent verification, update chunk and plan status, and continue without a user checkpoint. It must stop only for a destructive action outside this spec, missing credentials or external access, an architectural contradiction that changes protected scope, or an irreconcilable conflict with concurrent user changes.

## 11. Completion Criteria

The program is complete when:

- Every implementation chunk is marked complete with acceptance evidence.
- Only the web/PWA product, server/CLI, session-state package, docs, and tests remain as justified workspaces.
- All protected capabilities pass focused and cross-layer tests in local and remote-authenticated modes.
- `scripts/verify.sh` and the documented full test ladder pass from a fresh install.
- CI blocks type, lint, build, deterministic test, and calibrated complexity regressions for every maintained package.
- No deleted runtime, scheduled-task, SSH Remote Instance, shell compatibility, HeroUI, or Radix production path remains.
- State ownership, domain contracts, package boundaries, and security expectations are documented and match the code.
- The active planning graph has no uncovered chunks, broken references, contradictory statuses, or stale active plans.

Completion is defined by the smaller coherent product and its enforced boundaries, not by a target line-count reduction.
