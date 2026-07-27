# CLI boundary

`bin/cli.js` is the published `openchamber` package entrypoint. It owns only
package metadata/path setup, production adapter composition, process-handler
installation, and invocation of the dispatcher. It must not own command
bodies, persistence, process signalling, or feature-specific migrations.

## Module map

- `cli/arguments.js` parses options, owns command names, removed-flag
  diagnostics, and typed exit codes.
- `cli/dispatch.js` performs parse-to-command dispatch, help/version and
  unknown-command handling, removed-tunnel responses, and top-level error
  rendering.
- `cli/create-commands.js` composes command factories in dependency order.
- `cli/commands/` owns `serve`, `stop`, `restart`, `status`, `logs`, and
  `update` behavior.
- `cli/paths.js`, `instance-store.js`, `process-runtime.js`, and `log-files.js`
  own filesystem, instance, process, and log seams respectively.
- `cli/daemon-entry.js` is the daemon IPC/readiness wrapper around the compiled
  foreground server entry. The foreground server remains in-process in
  `serve.js`.
- `cli-output.js` is the human/JSON/quiet output adapter.

`restart` and `update` receive the already-created `stop` and `serve`
operations. This keeps lifecycle ownership explicit and avoids circular
command imports.

## Runtime and output contracts

Daemon mode starts `cli/daemon-entry.js` as a detached child. The child sends
`openchamber:ready` only after the compiled server reports its actual port;
only then are PID and instance records persisted. Foreground mode imports the
compiled server directly and remains the process manager's process. It writes
the same instance metadata so status, stop, restart, and logs can discover it.

Human output uses the output adapter when both streams are interactive. JSON
always emits one normalized JSON envelope, and quiet output is deterministic
line-oriented output for scripts. Errors map typed CLI errors to their exit
codes; command implementations do not call `process.exit`.

## Instance files and PID safety

The data directory contains `run/openchamber-<port>.pid`,
`run/openchamber-<port>.json`, and `logs/openchamber-<port>.log`. The instance
store creates the run directory with restrictive permissions and records a
process identity fingerprint. Stop and cleanup operations verify identity
before signalling a PID; stale or unverifiable records are not signalled.

## Testing seams

Command factories accept output, filesystem, process, timers, runtime,
instance-store, log, package-manager, and server-import dependencies. CLI
tests therefore cover dispatch and packaged source behavior without starting
OpenCode. `packages/web/vitest.config.ts` owns the Vitest CLI suites and the
root `test:scripts` command owns `scripts/*.test.mjs`, including the Docker
entrypoint routing contract. Package-bin and tarball checks must exercise
`--help`, `--version`, unknown-command, JSON, quiet status, and removed-tunnel
paths without starting a server.
