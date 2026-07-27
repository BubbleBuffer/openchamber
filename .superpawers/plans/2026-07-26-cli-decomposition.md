---
kind: plan
status: completed
base_branch: feature/lint-integration-readiness
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - server-cli-decomposition
created: 2026-07-26
updated: 2026-07-27
next_action:
verification:
  - CLI/package/script/packed proof: 16 test files and 83 tests passed; 12 script tests passed; packed help/version/status/tunnel/unknown smoke checks passed
  - Type-check, web-server/full builds, contract audit, documentation validation, web tests, and integration tests passed: 18 passed/2 skipped and 53 passed/2 skipped
  - Targeted CLI ESLint passed with zero errors; git diff --check passed; repository-wide lint remains inherited baseline debt
---

# CLI Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the packaged `openchamber` entrypoint a thin parser/dispatcher over focused, testable command, instance, process, and output services while preserving supported CLI behavior in human, JSON, quiet, piped, daemon, and foreground modes.

**Design Reference:** Approved Web/PWA maintainability design and approved chat direction: keep the OpenChamber backend and CLI, preserve supported capabilities, and complete the CLI half of `server-cli-decomposition` without reopening the completed server-startup extraction.

## Chunk Coverage

This plan covers the remaining CLI portion of `server-cli-decomposition`. The completed `.superpawers/plans/2026-07-26-server-startup-composition.md` covers the server-startup portion. The parent chunk becomes complete only after this plan proves the CLI acceptance criteria.

## Approved Design Summary

- `packages/web/bin/cli.js` remains the package `bin` entrypoint but contains only composition, entry detection, dispatch invocation, and narrowly scoped compatibility exports; command bodies and persistence/process policy move to focused owners.
- Supported commands remain `serve`, `stop`, `restart`, `status`, `logs`, and `update`. The existing removed-tunnel command/flag messages remain explicit, but unreachable tunnel-profile, QR/token, and desktop-shell internals are not extracted into new modules.
- Validation and safety rules execute in reusable core services before prompts or rendering, so interactive, piped, `--plain`, `--quiet`, `--json`, and fully flagged invocations produce the same operational decision and exit status.
- Foreground serving stays in-process. Daemon serving uses a CLI-owned bootstrap child that emits readiness only after `startWebUiServer` succeeds; it remains detached after that verified IPC handoff. Stop/restart/update remain PID- and instance-record-scoped and never use process-name matching.
- Commands receive explicit dependencies. `restart` and `update` receive the `serve`/`stop` operations they coordinate instead of importing a global command registry or relying on method `this`.
- No new dependencies, compatibility facade, command framework, service locator, or TypeScript rewrite is introduced.

### Task 1: Characterize CLI parsing, dispatch, and output contracts

- [x] **Outcome:** The existing package-bin behavior has executable characterization coverage for parsing, dispatch, output modes, exit codes, and removed-feature messaging before command code moves.

**Files and anchors:**
- Modify: `packages/web/bin/cli.test.js` — retain `cli-entry.js` and compiled-entry coverage, and add subprocess characterization for `--help`, `--version`, unknown commands, `status` with an isolated empty data directory, the removed `tunnel` command, and removed tunnel flags.
- Create: `packages/web/bin/cli-args.test.js` — exercise `parseArgs`, `splitOptionToken`, port/range checks, aliases, defaults, removed flags, and fully flagged invocations.
- Create: `packages/web/bin/cli-output.test.js` — characterize human/TTY eligibility, piped/plain behavior, JSON envelope normalization, quiet suppression, prompting gates, and warning/error rendering through bounded stream spies; Task 2 replaces the global stream seam with injection without changing these outcomes.
- Create: `packages/web/bin/cli-dispatch.test.js` — characterize command lookup, closest-command suggestions, help/version early exits, `TunnelCliError` exit codes, and top-level rejection formatting without running a server or updater.
- Modify: `packages/web/vitest.config.ts` and `packages/web/server/src/runner-ownership.test.ts` — assign every `packages/web/bin/**/*.test.js` suite to Vitest exactly once.

**Constraints:**
- Characterization tests assert public stdout/stderr, returned status, exit code, and dependency calls; they do not freeze private function placement or line counts.
- Subprocess tests use a temporary `OPENCHAMBER_DATA_DIR`, deterministic environment, and no real OpenCode server. They must not start, stop, discover, or kill unrelated processes.
- Do not change supported command behavior while establishing the baseline. Newly exposed pure seams may only make existing behavior injectable/testable.

**Dependencies:**
- Completed server-startup composition plan and its post-merge verification.

**Proof:**
- All `packages/web/bin` Vitest suites pass and demonstrate the existing parser/dispatch/output contract in human, JSON, quiet, and piped/plain forms.
- Runner ownership reports no unassigned or multiply owned CLI suites.

### Task 2: Extract argument, output, and entry-runtime foundations

- [x] **Outcome:** Argument parsing, usage/errors, output selection, and top-level process-handler state have focused owners that can be tested without importing or executing command implementations.

**Files and anchors:**
- Create: `packages/web/bin/cli/arguments.js` — own `DEFAULT_PORT`, option tokenization, `parseArgs`, browser-unsafe port validation, command names, removed flag diagnostics, `EXIT_CODE`, and the CLI error class.
- Create: `packages/web/bin/cli/help.js` — render help and completion text from the supported command/option authority without owning command execution.
- Modify: `packages/web/bin/cli-output.js` — expose a production output adapter plus injectable stream/TTY/prompt seams; preserve existing human, JSON, quiet, and prompt eligibility behavior.
- Create: `packages/web/bin/cli/process-handlers.js` — own active-command/cancellation/foreground state and install idempotently disposable SIGINT, rejection, and exception handlers around the dispatcher.
- Modify: `packages/web/bin/cli-entry.js` — retain package entry detection and compiled server paths; do not absorb command or process policy.
- Modify: `packages/web/bin/cli-args.test.js`, `cli-output.test.js`, and `cli-dispatch.test.js` — import the new owners and prove handler attachment/disposal does not accumulate listeners.

**Constraints:**
- Core parsing and validation return values or throw typed CLI errors; they do not call `process.exit`.
- Only the actual package entry seam may set an exit code or terminate after rendering. Imported modules and tests remain side-effect free.
- Preserve exact accepted aliases, environment defaults, removed-option diagnostics, unsafe-port policy, JSON status envelopes, and prompt suppression when stdin or stdout is not a TTY.
- Do not move command-specific validation into prompts or output helpers.

**Dependencies:**
- Task 1.

**Proof:**
- Argument, output, dispatch, and handler suites pass without loading command modules.
- Repeated handler attach/dispose cycles leave process listener counts unchanged.

### Task 3: Extract instance persistence, port, process, and log services

- [x] **Outcome:** Instance discovery and lifecycle primitives are reusable services with explicit filesystem, network, process, clock, and timer dependencies rather than hidden CLI globals.

**Files and anchors:**
- Create: `packages/web/bin/cli/paths.js` — own OpenChamber data, run, log, PID, instance-record, settings, and compiled package paths.
- Create: `packages/web/bin/cli/instance-store.js` — own PID/instance record read/write/remove, stored process-identity fingerprints, stale/reused-PID record pruning, latest-instance selection, and `discoverRunningInstances`.
- Create: `packages/web/bin/cli/process-runtime.js` — own exact-PID liveness and process-identity lookup, PID-scoped termination, Windows process-tree handling, HTTP shutdown request, health/system-info probes, port availability, and available-port resolution. Identity lookup uses exact-PID OS metadata (for example Linux `/proc/<pid>/stat` start time, macOS exact-PID `ps` start metadata, or Windows exact-ProcessId creation metadata), never executable-name matching.
- Create: `packages/web/bin/cli/log-files.js` — own log-directory creation, rotation, tailing, and cancellable file following.
- Create: `packages/web/bin/cli/instance-store.test.js`, `process-runtime.test.js`, and `log-files.test.js` — use temporary directories and injected process/network/timer adapters to cover valid, missing, stale, malformed, partial-stop, timeout, and cleanup behavior.

**Constraints:**
- Never add `pgrep`, `pkill`, `killall`, executable-name matching, or broad port-owner killing. Before every signal/escalation, the exact PID's current process-identity fingerprint must match the fingerprint captured in its OpenChamber instance record.
- A dead PID or fingerprint mismatch is a stale/reused-PID record: remove only the OpenChamber-owned record and never signal the live PID. A legacy record without a fingerprint, an unavailable identity probe, or an unmanaged system-info PID may receive the HTTP shutdown request but must not receive a signal; report `identity-unverified` if graceful shutdown does not complete.
- Stale-record cleanup may remove only OpenChamber-owned PID/instance files proven stale; it must not delete unrelated files or kill a process merely because a port is occupied.
- Preserve Windows and POSIX behavior, shutdown-before-escalation ordering, current timeout semantics, log rotation limits, and partial-failure reporting.
- Do not import command modules from these services and do not introduce a mutable singleton registry.

**Dependencies:**
- Task 2.

**Proof:**
- Focused service tests prove exact-PID plus process-identity safety, PID-reuse and legacy/unverified record handling, port conflict distinctions, timeout/escalation behavior, log rotation, and follower disposal.
- Tests leave no child process, listener, timer, temporary instance record, or log follower active.

### Task 4: Extract serve, stop, and restart command orchestration

- [x] **Outcome:** Server lifecycle commands are independently testable orchestration functions over explicit services while preserving foreground, daemon, stop, and restart semantics.

**Files and anchors:**
- Create: `packages/web/bin/cli/commands/serve.js` — own serve validation/orchestration, OpenCode CLI discovery, foreground in-process startup, daemon detached spawn/IPC readiness, environment propagation, logs, PID/instance records, output result, and startup rollback.
- Create: `packages/web/bin/cli/daemon-entry.js` — CLI-owned daemon bootstrap that parses the internal `--port` and optional `--host` values supplied by serve, reads the forwarded `OPENCHAMBER_UI_PASSWORD`, `OPENCHAMBER_SKIP_OPENCODE_START`/`OPENCODE_SKIP_START`, OpenCode binary/host/port, and data-directory environment unchanged before importing the packaged `server/dist/index.js`, then calls `startWebUiServer({ port, host, uiPassword, attachSignals: true, exitOnShutdown: true })`. It sends `{ type: "openchamber:ready", port: controller.getPort() }` only after successful listening, reports startup failure to the parent/exit status, and leaves signal/shutdown ownership to the started server controller.
- Create: `packages/web/bin/cli/commands/stop.js` — own target selection, HTTP shutdown, exact-PID escalation, per-instance results, record cleanup, and human/JSON/quiet output.
- Create: `packages/web/bin/cli/commands/restart.js` — coordinate injected `stop` and `serve` operations; preserve foreground process-manager behavior and stored daemon options without method `this` or global registry lookup.
- Create: `packages/web/bin/cli/opencode-cli.js` — own OpenCode/Bun executable discovery used by serve, with explicit environment/PATH/process dependencies.
- Create: `packages/web/bin/cli/commands/serve.test.js`, `stop.test.js`, `restart.test.js`, and `packages/web/bin/cli/daemon-entry.test.js` — use fake server imports, spawn/IPC, files, ports, PIDs, process identities, timers, and output adapters. Daemon-entry tests assert exact port/host/password options, skip-start and OpenCode environment preservation before import, `attachSignals: true`, `exitOnShutdown: true`, verified auto-port reporting, and failure before readiness.

**Constraints:**
- Foreground mode must continue to call `startWebUiServer` in the CLI process; do not replace it with child-process orchestration.
- Daemon mode must retain detached execution and dedicated log output, but it may not treat timeout or a still-live child as readiness. The parent records PID/instance state only after the daemon wrapper reports the actual listening port. Child error, early exit, malformed IPC, or readiness timeout cleans only that newly spawned child and partial log/state artifacts, then fails the command.
- `packages/web/server/src/main.ts` remains the direct server entry and is not modified for CLI IPC; `cli-entry.js`/serve resolve the CLI-owned daemon wrapper for packaged CLI launches.
- `--foreground --json` remains a usage error. Quiet foreground mode retains deterministic CLI output while server output goes to its log.
- Stop/restart operate only on OpenChamber instance evidence and preserve current exit semantics across interactive and non-interactive modes: usage and total command failures are nonzero, while represented partial per-instance outcomes retain their existing warning/result contract.
- Remove stale desktop-runtime special cases encountered in these commands; Electron is already removed, and unmanaged current web runtimes remain distinguishable through the system-info contract.

**Dependencies:**
- Task 3.

**Proof:**
- Serve tests cover explicit/auto/unsafe/busy ports, missing OpenCode CLI, foreground success/failure, verified daemon ready/timeout/early-exit/malformed-message cases, actual auto-port persistence, and rollback.
- Stop tests cover none/one/all/explicit/unmanaged instances, graceful shutdown, matching-identity escalation, PID reuse, legacy/unverified identity refusal, partial failures, and all output modes.
- Restart tests prove injected stop/serve sequencing, stored options, foreground process-manager behavior, and no command-registry cycle.

### Task 5: Extract status, logs, and update command orchestration

- [x] **Outcome:** Read/status, log streaming, and update workflows have focused command owners with deterministic output and cleanup in every supported mode.

**Files and anchors:**
- Create: `packages/web/bin/cli/commands/status.js` — report current CLI/web instances from the instance service in human, JSON, and quiet formats.
- Create: `packages/web/bin/cli/commands/logs.js` — select one/all/latest instance logs, enforce deterministic `--json --no-follow`, and dispose file/signal followers.
- Create: `packages/web/bin/cli/commands/update.js` — coordinate the packaged server package-manager API with injected instance stop and serve operations, preserving current update/no-update/error/restart results.
- Create: `packages/web/bin/cli/commands/status.test.js`, `logs.test.js`, and `update.test.js` — cover empty/multiple instances, malformed records, all output modes, follow cancellation, update unavailable/failure/success, partial stop, and restart behavior.

**Constraints:**
- Status reports only maintained CLI/web runtimes; remove stale desktop-settings discovery and desktop labels rather than extracting a removed product surface.
- Logs must not leak followers or SIGINT/SIGTERM listeners after normal completion, cancellation, or failure.
- Update imports the package-manager service through one explicit adapter, does not duplicate package-manager policy, and receives lifecycle operations as dependencies.
- Interactive prompts/spinners may change presentation only; all validation, update, stop, and restart decisions must match JSON/quiet/non-TTY execution.

**Dependencies:**
- Task 4.

**Proof:**
- Focused command tests pass for human, JSON, quiet, and non-TTY modes with no real package installation, server process, or network dependency.
- Cancellation/failure tests demonstrate follower, listener, timer, and temporary-state cleanup.

### Task 6: Compose the thin package entrypoint and close CLI ownership

- [x] **Outcome:** `packages/web/bin/cli.js` visibly composes adapters/services/commands and invokes the dispatcher, with no embedded command, persistence, process, or removed-shell implementation.

**Files and anchors:**
- Create: `packages/web/bin/cli/create-commands.js` — construct commands in dependency order and inject `serve`/`stop` into restart/update without circular imports.
- Create: `packages/web/bin/cli/dispatch.js` — own parse-to-command dispatch, help/version/unknown handling, typed exit mapping, and rendering through supplied adapters.
- Modify: `packages/web/bin/cli.js` — reduce the package bin to metadata/path setup, production adapter composition, process-handler installation, `runCli` invocation, and narrow exports needed by package tests.
- Delete from `packages/web/bin/cli.js`: unreachable tunnel-profile migration/token/QR/read helpers, unused tunnel attach resolution, stale desktop-settings discovery, inline command bodies, and broad helper exports with no repository or declared package consumer. Modify `packages/web/bin/cli-output.js` to delete the tunnel-only provider icon/formatter after its final dead caller is removed. Retain only the small explicit removed-tunnel response and removed-flag diagnostics.
- Create: `packages/web/bin/DOCUMENTATION.md` — document entrypoint ownership, module map, command dependencies, foreground/daemon distinction, output modes, instance files, PID safety, and testing seams.
- Modify: `AGENTS.md`, `packages/web/vitest.config.ts`, and `packages/web/server/src/runner-ownership.test.ts` — point CLI work to the new boundary and keep test-runner ownership executable.
- Modify: `scripts/docker-entrypoint.sh` only as needed to preserve its current default CLI invocation, `UI_PASSWORD` forwarding, explicit-command passthrough, and subsequent `logs` execution through the unchanged package-bin path.
- Create: `scripts/docker-entrypoint.test.mjs` — use a temporary HOME and fake `bun`/command adapters to exercise explicit-argument passthrough plus default serve, password forwarding, and logs invocation without starting a server, installing packages, writing outside the sandbox, or requiring Docker.
- Modify: root `package.json` — add `test:scripts` as the documented Node test-runner owner for `scripts/*.test.mjs`, including the new Docker entrypoint contract.
- Modify: all `packages/web/bin/**/*.test.js` suites and `packages/web/package-manifest.test.js` — verify direct source entry, built/packed bin, exports, help/version, and package file inclusion.

**Constraints:**
- Do not change `packages/web/server/src/index.ts`, `server/src/main.ts`, server composition, route behavior, or OpenCode process ownership established by the completed server plan. Daemon IPC is owned by `packages/web/bin/cli/daemon-entry.js`; any newly discovered need to modify server behavior requires a bounded PLAN_GAP.
- Do not add a compatibility barrel that recreates the monolith. `cli.js` may re-export only the narrow parser/error/run surface needed by documented package tests; owner-specific helpers are imported from their owner modules.
- Do not extract unreachable tunnel/desktop code into preserved modules. Dependency/lockfile cleanup for now-unused packages remains in `dependency-documentation-convergence` unless required for the CLI build to pass.
- Preserve the package bin path, `npm pack` behavior, Docker entrypoint invocation, foreground compiled server path, supported command names, output contracts, and exit codes. Replace only the CLI daemon target from the non-signaling server entry to the CLI-owned readiness wrapper.

**Dependencies:**
- Task 5.

**Proof:**
- CLI source contains only composition/entry responsibilities; a repository-wide import/reference audit finds no duplicate command or process-policy owner, no stale desktop discovery, and no tunnel implementation/provider formatter beyond removed-command/flag diagnostics.
- All CLI/unit/subprocess/package tests, runner ownership, type-check, web-server/full build, contract audit, docs validation, and diff checks pass.
- Packed-package proof runs `openchamber --help`, `--version`, unknown-command, JSON, quiet status, and removed-tunnel cases from the tarball without starting OpenCode.
- `PATH="/home/breadcat/.bun/bin:$PATH" bun run test:scripts` and `sh -n scripts/docker-entrypoint.sh` pass, proving the Docker command-routing test is part of an executable root gate.

## Verification Ladder

- Focused CLI suites: `PATH="/home/breadcat/.bun/bin:$PATH" bun run --cwd packages/web test -- bin`.
- Package ownership/proof: `PATH="/home/breadcat/.bun/bin:$PATH" bun run --cwd packages/web test -- package-manifest.test.js bin` followed by the existing pack/import/CLI proof using a temporary output directory; the proof includes the packaged daemon wrapper and a fake-start readiness handshake.
- Static/build checks: `PATH="/home/breadcat/.bun/bin:$PATH" bun run type-check`, `PATH="/home/breadcat/.bun/bin:$PATH" bun run build:web-server`, `PATH="/home/breadcat/.bun/bin:$PATH" bun run build`, `PATH="/home/breadcat/.bun/bin:$PATH" bun run check:contracts`, and `PATH="/home/breadcat/.bun/bin:$PATH" bun run docs:validate`.
- Boundary tests: `PATH="/home/breadcat/.bun/bin:$PATH" bun run test:web` and `PATH="/home/breadcat/.bun/bin:$PATH" bun run test:integration`; all OpenCode-spawning tests retain PID-file/watchdog cleanup and never use process-name matching.
- Script/Docker entrypoint contract: `PATH="/home/breadcat/.bun/bin:$PATH" bun run test:scripts` plus `sh -n scripts/docker-entrypoint.sh`; `test:scripts` runs `node --test scripts/*.test.mjs`, and no Docker daemon is required for this non-mutating command-routing proof.
- Repository gate: `scripts/verify.sh`, lint comparison against the inherited baseline, `git diff --check`, and clean-status inspection. This plan does not absorb unrelated lint debt.
- After final verification, mark this plan completed and transition `server-cli-decomposition` from `active` to `completed` only if both this plan and the completed server-startup plan jointly satisfy every chunk acceptance criterion.

## Review Decision

**Review: yes.** The plan moves destructive and process-lifecycle CLI policy out of a monolith. A fresh integrated reviewer should inspect the final bounded diff for foreground/daemon drift, unsafe process targeting, inconsistent human/JSON/quiet outcomes, listener or file leaks, and command dependency cycles after focused verification.
