# Performance Benchmarks

Run the React render benchmarks from the repository root:

```bash
bun run test:perf
```

This delegates to `bun run --cwd tests bench`, which runs `vitest bench perf --config perf/vitest.config.ts`.

## Benchmark Types

### `chat-input.bench.tsx`

`chat-input.bench.tsx` uses a custom JSON snapshot at `tests/perf/__snapshots__/chat-input.bench.snap.json`.

The snapshot has a `frozen` flag:

- `frozen: false` means runs record samples but do not enforce them.
- `frozen: true` means committed samples are the baseline and any drift throws during the benchmark.

Freeze a snapshot only after a stable baseline has been reviewed and committed. To intentionally reset the baseline, delete the snapshot file, rerun `bun run test:perf`, review the generated samples, then commit the new snapshot.

### `chat-view.bench.tsx`

`chat-view.bench.tsx` does not use a JSON snapshot. It uses inline commit-count thresholds because the mocked session/view setup is more synthetic than `ChatInput` and the useful signal is an upper bound, not exact sample equality.

Current expectations:

- Session id change: at most 1 update commit.
- 60-message streaming burst: at most 60 update commits.

## Standalone Sync Benchmark

`packages/ui/src/sync/__tests__/event-pipeline.bench.js` is not part of `bun run test:perf`.

Run it directly when investigating sync pipeline throughput:

```bash
bun packages/ui/src/sync/__tests__/event-pipeline.bench.js
```

It is intentionally standalone for now. It uses hand-rolled synthetic workloads and prints its own report instead of using `vitest bench`.

## Maintenance Rules

- Do not loosen benchmark thresholds or snapshot samples without documenting the reason in the commit message.
- Prefer adding a new focused benchmark over broadening an existing one.
- Keep mocks at process boundaries; do not import Electron or real OpenCode processes from perf tests.
