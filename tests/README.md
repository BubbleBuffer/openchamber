# OpenChamber Integration Tests

These tests use a real `opencode` binary and/or a real OpenChamber web server. They do not use recorded OpenCode responses or fake OpenCode services.

## Commands

- `bun run --cwd tests test` — fast lane (`tests/opencode`, `tests/web`)
- `bun run --cwd tests test:opencode`
- `bun run --cwd tests test:web`
- `RUN_SLOW_TESTS=1 bun run --cwd tests test` — includes `slowTest` cases when they exist

## Required Environment

- `opencode` must be on `PATH`, or set `TEST_OPENCODE_BINARY` / `OPENCODE_BINARY`.
- Tests allocate dynamic ports.
- Tests write temporary state under OS temp directories and clean up after themselves.

## Instance Modes

- Per-suite: the suite owns an isolated OpenCode process.
- Per-run: a shared OpenCode process can be reused by tests that do not corrupt global state. In Slice 1 this is intra-file only because `isolate: true` gives each test file its own worker. Cross-file Mode B requires a future `globalSetup`.
