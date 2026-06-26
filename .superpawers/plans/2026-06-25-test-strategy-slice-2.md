# Test Strategy Slice 2 — OpenCode Tier 1 Expansion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the `tests/opencode/` surface with multi-directory session routing, archive + unarchive flows, bad-input error paths, and concurrent session operations. Stays in Tier 1 (no model calls).

**Architecture:** Same harness as Slice 1. Each new test file follows the `session-crud.test.ts` pattern: file-level availability check, file-level `afterAll` cleanup, single `describe` block with a per-suite OpenCode instance via `startOpenCodeInstance({ cwd })`. The `cwd` parameter on `startOpenCodeInstance` already exists and supports per-suite isolation. The `directory` SDK query param is used to scope sessions to sub-directories under the instance cwd.

**Tech Stack:** vitest, `@opencode-ai/sdk/v2`, real `opencode` binary, `startOpenCodeInstance()` helper.

**Spec:** `.superpawers/specs/2026-06-25-test-strategy-design.md` §1.7.1 (rows beyond Slice 1), §1.13 exit criteria extended, §5 Plan 2.

---

## File Structure

New test files only. No new helpers — `startOpenCodeInstance({ cwd })` already supports per-suite directory isolation, and `session-crud.test.ts` provides the template for each new file.

```text
tests/opencode/
├── multi-directory.test.ts        # NEW — directory isolation + concurrent ops
├── session-archive.test.ts        # NEW — archive / unarchive / archived list filter
└── session-errors.test.ts         # NEW — 404 + bad-input paths
```

Modify:
```text
tests/README.md                    # Document new coverage
```

No root or package.json changes required — vitest config already includes `tests/opencode/**/*.test.ts`.

---

## SDK surface used (anchors)

These exist in `@opencode-ai/sdk/v2` and are exercised by the new tests. References are to the resolved `@opencode-ai/sdk` types in the local install (`dist/v2/gen/sdk.gen.d.ts` and `dist/v2/gen/types.gen.d.ts`).

**`client.session` (`Session2` class, line 480 of `sdk.gen.d.ts`) — non-experimental. Uses flat parameter objects, NOT `{ body, query, path }` nesting. The HeyAPI-generated `buildClientParams` maps each key to body / path / query by name.**

- `client.session.create({ title, directory, parentID, workspace, permission, workspaceID })` → `SessionCreateResponses[200]` (`Session`). 400 on bad body.
- `client.session.list({ directory, workspace, roots, start, search, limit })` → `Session[]`. **Does not accept `archived`.** Archived sessions are excluded by default (filtered server-side).
- `client.session.get({ sessionID, directory, workspace })` → `Session`. 404 when not found.
- `client.session.delete({ sessionID, directory, workspace })` → `boolean`. 404 when not found.
- `client.session.update({ sessionID, directory, title, permission, time: { archived } })` → `Session`. Setting `time.archived: 0` unarchives; setting it to a positive number archives. Matches `packages/ui/src/sync/session-actions.ts:258` (`archiveSession` uses exactly this call).
- `Session` shape: `{ id, title, directory, time: { created, updated, archived? }, ... }` (`types.gen.d.ts:1575`).

**`client.experimental.session` (`Session` class, line 226 of `sdk.gen.d.ts`) — experimental endpoint at `/experimental/session`. Accepts `archived` in the query.**

- `client.experimental.session.list({ directory, archived, workspace, roots, start, cursor, search, limit })` → `ExperimentalSessionListResponses`. `archived: true` returns archived sessions; `archived: false` (default) excludes them.

The implementer must use the flat-key parameter format shown above — the nested `{ body, query, path }` style is a type-only artifact and is silently dropped by the runtime SDK. The existing `tests/opencode/session-crud.test.ts` uses the flat format throughout and is the reference template.

---

## Task 1: `tests/opencode/multi-directory.test.ts` — directory isolation

**Files:**
- Create: `tests/opencode/multi-directory.test.ts`

This file verifies that sessions in different `directory` query params do not bleed into each other, and that `session.list` filters correctly by directory. The instance is spawned with a fresh tempdir as cwd; tests then create two project sub-directories under it and exercise routing through the SDK.

- [ ] **Step 1: Write the test file**

Create `tests/opencode/multi-directory.test.ts` with this complete content:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

const availability = await checkOpenCodeAvailable()

let opencode: StartedOpenCode | undefined
let dirA = ""
let dirB = ""

afterAll(async () => {
  await opencode?.stop()
})

const describeWhenOpenCode = availability.available ? describe : describe.skip

describeWhenOpenCode("OpenCode multi-directory routing", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
    dirA = path.join(opencode.cwd, "project-a")
    dirB = path.join(opencode.cwd, "project-b")
    await fs.mkdir(dirA, { recursive: true })
    await fs.mkdir(dirB, { recursive: true })
  }, 20_000)

  test("sessions in different directories are isolated", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })

    const inA = await client.session.create({ title: "session-a", directory: dirA })
    const inB = await client.session.create({ title: "session-b", directory: dirB })
    expect(inA.data?.id).toBeTruthy()
    expect(inB.data?.id).toBeTruthy()
    expect(inA.data?.id).not.toEqual(inB.data?.id)

    const listA = await client.session.list({ directory: dirA })
    const listB = await client.session.list({ directory: dirB })
    const idsA = (listA.data ?? []).map((s) => s.id)
    const idsB = (listB.data ?? []).map((s) => s.id)
    expect(idsA).toContain(inA.data!.id)
    expect(idsA).not.toContain(inB.data!.id)
    expect(idsB).toContain(inB.data!.id)
    expect(idsB).not.toContain(inA.data!.id)

    await client.session.delete({ sessionID: inA.data!.id, directory: dirA })
    await client.session.delete({ sessionID: inB.data!.id, directory: dirB })
  })

  test("session.get scoped to wrong directory returns 404", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })

    const created = await client.session.create({ title: "scope-check", directory: dirA })
    const id = created.data!.id

    const wrongDir = await client.session.get({ sessionID: id, directory: dirB })
    expect(wrongDir.response.status).toBe(404)

    const rightDir = await client.session.get({ sessionID: id, directory: dirA })
    expect(rightDir.response.status).toBe(200)
    expect(rightDir.data?.id).toBe(id)

    await client.session.delete({ sessionID: id, directory: dirA })
  })
})
```

- [ ] **Step 2: Run the new test file to verify it passes**

Run: `bun run --cwd tests test:opencode -- multi-directory.test.ts`
Expected: 2 tests pass (in `<30s`).

If `session.list` in the running OpenCode version returns archived sessions by default, narrow the assertions with `{ directory, archived: false }` (via `client.experimental.session.list`). If the SDK returns `{ data: [], error: ... }` shape differently, mirror what `session-crud.test.ts` already does at `tests/opencode/session-crud.test.ts:36` (`(listResult.data ?? [])`).

- [ ] **Step 3: Inspect the diff**

Run: `git status` and `git diff -- tests/opencode/multi-directory.test.ts`
Expected: only the new file appears; no other changes.

- [ ] **Step 4: Commit**

```bash
git add tests/opencode/multi-directory.test.ts
git commit -m "test(opencode): add multi-directory session routing tests"
```

---

## Task 2: `tests/opencode/session-archive.test.ts` — archive + unarchive flows

**Files:**
- Create: `tests/opencode/session-archive.test.ts`

Verifies that `session.update` with `time.archived: <ms>` moves a session into the archived list, that the default `session.list` excludes it, that `session.get` still returns it (archive is not delete), and that setting `time.archived: 0` returns it to the active list.

- [ ] **Step 1: Write the test file**

Create `tests/opencode/session-archive.test.ts` with this complete content:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

const availability = await checkOpenCodeAvailable()

let opencode: StartedOpenCode | undefined
const archivedAt = Date.now()

afterAll(async () => {
  await opencode?.stop()
})

const describeWhenOpenCode = availability.available ? describe : describe.skip

describeWhenOpenCode("OpenCode session archive", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
  }, 20_000)

  test("archive moves a session out of the default list and into the archived list", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })

    const created = await client.session.create({ title: "to-archive", directory: opencode!.cwd })
    const id = created.data!.id

    const beforeDefault = await client.session.list({ directory: opencode!.cwd })
    expect((beforeDefault.data ?? []).some((s) => s.id === id)).toBe(true)

    const archived = await client.session.update({ sessionID: id, time: { archived: archivedAt } })
    expect(archived.data?.id).toBe(id)
    expect(archived.data?.time?.archived).toBe(archivedAt)

    const afterDefault = await client.session.list({ directory: opencode!.cwd })
    expect((afterDefault.data ?? []).some((s) => s.id === id)).toBe(false)

    const archivedList = await client.experimental.session.list({
      directory: opencode!.cwd,
      archived: true,
    })
    expect((archivedList.data ?? []).some((s) => s.id === id)).toBe(true)

    const fetched = await client.session.get({ sessionID: id })
    expect(fetched.data?.id).toBe(id)
    expect(fetched.data?.time?.archived).toBe(archivedAt)
  })

  test("archive is reversible by setting time.archived to 0", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })

    const created = await client.session.create({ title: "to-unarchive", directory: opencode!.cwd })
    const id = created.data!.id

    await client.session.update({ sessionID: id, time: { archived: archivedAt + 1 } })

    const archived = await client.experimental.session.list({
      directory: opencode!.cwd,
      archived: true,
    })
    expect((archived.data ?? []).some((s) => s.id === id)).toBe(true)

    const unarchived = await client.session.update({ sessionID: id, time: { archived: 0 } })
    expect(unarchived.data?.time?.archived).toBe(0)

    const defaultList = await client.session.list({ directory: opencode!.cwd })
    expect((defaultList.data ?? []).some((s) => s.id === id)).toBe(true)

    const archivedAfter = await client.experimental.session.list({
      directory: opencode!.cwd,
      archived: true,
    })
    expect((archivedAfter.data ?? []).some((s) => s.id === id)).toBe(false)
  })

  test("archived session is still deletable", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })

    const created = await client.session.create({ title: "archived-then-deleted", directory: opencode!.cwd })
    const id = created.data!.id

    await client.session.update({ sessionID: id, time: { archived: archivedAt + 2 } })

    const deleted = await client.session.delete({ sessionID: id })
    expect(deleted.data).toBe(true)

    const after = await client.session.get({ sessionID: id })
    expect(after.response.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run the new test file to verify it passes**

Run: `bun run --cwd tests test:opencode -- session-archive.test.ts`
Expected: 3 tests pass (in `<30s`).

If the running OpenCode version surfaces archive/unarchive via a different field (e.g. `archived: boolean`), adjust the assertions to match — the test must encode the actual on-the-wire behaviour, not the inferred type.

- [ ] **Step 3: Inspect the diff**

Run: `git status` and `git diff -- tests/opencode/session-archive.test.ts`
Expected: only the new file appears; no other changes.

- [ ] **Step 4: Commit**

```bash
git add tests/opencode/session-archive.test.ts
git commit -m "test(opencode): add session archive and unarchive tests"
```

---

## Task 3: `tests/opencode/session-errors.test.ts` — bad-input paths

**Files:**
- Create: `tests/opencode/session-errors.test.ts`

Verifies that invalid sessionIDs, deletes on nonexistent IDs, and lookups with an explicit wrong directory all surface as 404s rather than crashing the server or returning corrupt data.

- [ ] **Step 1: Write the test file**

Create `tests/opencode/session-errors.test.ts` with this complete content:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

const availability = await checkOpenCodeAvailable()

let opencode: StartedOpenCode | undefined

afterAll(async () => {
  await opencode?.stop()
})

const describeWhenOpenCode = availability.available ? describe : describe.skip

describeWhenOpenCode("OpenCode session error paths", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
  }, 20_000)

  test("session.get with an unknown id returns 404", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.get({ sessionID: "ses_does_not_exist" })
    expect(result.response.status).toBe(404)
  })

  test("session.delete with an unknown id returns 404", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.delete({ sessionID: "ses_does_not_exist" })
    expect(result.response.status).toBe(404)
  })

  test("session.update with an unknown id returns 404", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.update({
      sessionID: "ses_does_not_exist",
      time: { archived: Date.now() },
    })
    expect(result.response.status).toBe(404)
  })

  test("session.get with garbage-shaped id returns 4xx", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.get({ sessionID: "!!not a session id!!" })
    expect(result.response.status).toBeGreaterThanOrEqual(400)
    expect(result.response.status).toBeLessThan(500)
  })

  test("session.create with empty body succeeds with a generated id", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.create({})
    expect(result.response.status).toBe(200)
    expect(result.data?.id).toBeTruthy()
    await client.session.delete({ sessionID: result.data!.id })
  })
})
```

- [ ] **Step 2: Run the new test file to verify it passes**

Run: `bun run --cwd tests test:opencode -- session-errors.test.ts`
Expected: 5 tests pass (in `<30s`).

If the running OpenCode binary returns a different status (e.g. 400 on garbage id instead of 404), update the assertion accordingly. The intent is "4xx, not 5xx, not 200" — a successful crash-free rejection.

- [ ] **Step 3: Inspect the diff**

Run: `git status` and `git diff -- tests/opencode/session-errors.test.ts`
Expected: only the new file appears; no other changes.

- [ ] **Step 4: Commit**

```bash
git add tests/opencode/session-errors.test.ts
git commit -m "test(opencode): add session error-path tests"
```

---

## Task 4: `tests/opencode/concurrent-sessions.test.ts` — concurrent operations

**Files:**
- Create: `tests/opencode/concurrent-sessions.test.ts`

Verifies that parallel session creates, parallel lists, and parallel get-after-create all complete without races. This is a smoke test for the storage layer's concurrency model. Tier 1 (no model calls).

- [ ] **Step 1: Write the test file**

Create `tests/opencode/concurrent-sessions.test.ts` with this complete content:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

const availability = await checkOpenCodeAvailable()

let opencode: StartedOpenCode | undefined
const created: string[] = []

afterAll(async () => {
  if (opencode) {
    const client = createOpencodeClient({ baseUrl: opencode.baseUrl })
    await Promise.all(created.map((id) => client.session.delete({ sessionID: id }).catch(() => {})))
  }
  await opencode?.stop()
})

const describeWhenOpenCode = availability.available ? describe : describe.skip

describeWhenOpenCode("OpenCode concurrent session operations", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
  }, 20_000)

  test("10 parallel session.create calls produce 10 distinct sessions", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        client.session.create({ title: `concurrent-${i}` }),
      ),
    )

    const ids = results.map((r) => r.data?.id).filter((id): id is string => Boolean(id))
    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(10)
    created.push(...ids)
  })

  test("parallel session.get on existing ids all return 200", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const seeded = await client.session.create({ title: "concurrent-get-seed" })
    const seedId = seeded.data!.id
    created.push(seedId)

    const results = await Promise.all(
      Array.from({ length: 8 }, () => client.session.get({ sessionID: seedId })),
    )
    for (const result of results) {
      expect(result.response.status).toBe(200)
      expect(result.data?.id).toBe(seedId)
    }
  })

  test("parallel session.list calls all succeed and return consistent shape", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const lists = await Promise.all(
      Array.from({ length: 5 }, () => client.session.list()),
    )
    for (const list of lists) {
      expect(list.response.status).toBe(200)
      expect(Array.isArray(list.data ?? [])).toBe(true)
    }
    const firstIds = (lists[0].data ?? []).map((s) => s.id).sort()
    for (const list of lists.slice(1)) {
      const ids = (list.data ?? []).map((s) => s.id).sort()
      expect(ids).toEqual(firstIds)
    }
  })
})
```

- [ ] **Step 2: Run the new test file to verify it passes**

Run: `bun run --cwd tests test:opencode -- concurrent-sessions.test.ts`
Expected: 3 tests pass (in `<30s`).

If the running OpenCode binary rejects the first request in a burst with 429 or 5xx under real load, drop the parallel count from 10 to 5 and re-run. The intent is "parallel calls work without races or server crashes", not a load test.

- [ ] **Step 3: Inspect the diff**

Run: `git status` and `git diff -- tests/opencode/concurrent-sessions.test.ts`
Expected: only the new file appears; no other changes.

- [ ] **Step 4: Commit**

```bash
git add tests/opencode/concurrent-sessions.test.ts
git commit -m "test(opencode): add concurrent session operations tests"
```

---

## Task 5: Update `tests/README.md` and run the full opencode surface

**Files:**
- Modify: `tests/README.md` — extend the Slice 1 coverage table with rows for each new file

- [ ] **Step 1: Update the Slice 1 coverage table**

In `tests/README.md`, the "Slice 1 coverage" section (starts at line 18 with `## Slice 1 coverage`). Extend the table by adding rows for the four new files. Anchor on the existing row for `session-crud.test.ts` (line 24) — insert the new rows directly below it.

```text
| `opencode/session-crud.test.ts` | Create, list, get, and delete a session via the OpenCode SDK |
| `opencode/multi-directory.test.ts` | Sessions in different `directory` query params are isolated; `session.get` scoped to wrong directory returns 404 |
| `opencode/session-archive.test.ts` | Archive moves a session out of the default list and into the archived list; archive is reversible by setting `time.archived: 0`; archived sessions are deletable |
| `opencode/session-errors.test.ts` | 404 on unknown session ID for get / delete / update; 4xx on malformed IDs; empty-body create succeeds |
| `opencode/concurrent-sessions.test.ts` | 10 parallel `session.create` produce 10 distinct IDs; parallel `session.get` / `session.list` complete without races |
```

Also restructure the section header from `## Slice 1 coverage` to `## Coverage` with `### Slice 1` and `### Slice 2` sub-sections, so future slices extend without breaking the section name.

- [ ] **Step 2: Run the entire opencode surface to verify everything still passes**

Run: `bun run --cwd tests test:opencode`
Expected: all 22 tests (9 from Slice 1 + 13 new) pass in `<60s`. No orphans. No timeouts.

- [ ] **Step 3: Run the full integration surface to verify no cross-file regressions**

Run: `bun run --cwd tests test:integration`
Expected: all 22 opencode + 2 web tests pass in `<60s`.

- [ ] **Step 4: Run type-check on the tests workspace**

Run: `bun run --cwd tests type-check`
Expected: 0 errors.

- [ ] **Step 5: Inspect the diff**

Run: `git status` and `git diff -- tests/README.md`
Expected: only the README and the four new test files appear. No other modifications.

- [ ] **Step 6: Commit**

```bash
git add tests/opencode/multi-directory.test.ts tests/opencode/session-archive.test.ts tests/opencode/session-errors.test.ts tests/opencode/concurrent-sessions.test.ts tests/README.md
git commit -m "test(opencode): cover multi-dir, archive, errors, and concurrency (slice 2)"
```

---

## Exit criteria

- All 13 new tests pass on the fast lane (no `RUN_SLOW_TESTS`).
- Full opencode surface (22 tests) passes in `<60s`.
- Full integration surface (24 tests) passes in `<60s`.
- `bun run --cwd tests type-check` is clean.
- No orphan `opencode` processes after the run.
- No new helpers introduced — Slice 1 harness is sufficient.
- `tests/README.md` documents the new coverage.

## Out of scope (deferred)

- Cross-version OpenCode matrix — spec §1.4 explicitly opts out.
- Tier 2 `@slow` tests (live prompts, undo/redo races, MCP, config persistence) — Plans 4–7.
- Web-surface tests beyond Slice 1's two files — Plan 3.
- React + DOM tests — Plan 8+.
- Performance benchmarks — Plan 15.
- Production binary resolver parity test (`~/.opencode/bin/opencode` etc.) — tracked in the handoff spec's "spec coverage gap"; lives in `packages/web/server/src/domains/opencode-support/env-runtime.ts:351` and is exercised indirectly by `tests/web/connection-lifecycle.test.ts`.

## Notes

- **Branch:** Plan follows Slice 1 precedent and lands directly on `main`. If a feature branch is preferred, the implementer should run `git checkout -b feature/integration-tests-slice-2` from `main` before Task 1 and merge back via PR at the end.
- **Lint:** The repo currently has pre-existing lint errors in `@openchamber/ui` (per handoff §4). The new test files do not touch `packages/ui`, so they should not introduce new lint failures. `bun run --cwd tests type-check` is the right gate for this slice.
- **Concurrency caveat:** If the running OpenCode binary is the upstream `1.14.x` build, parallel creates should work. If a future build rate-limits, drop counts as noted in Task 4 Step 2.