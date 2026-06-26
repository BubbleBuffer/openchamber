# Slice 4 — Live Conversation Flow Tests

**Date:** 2026-06-26
**Branch:** `feature/integration-tests-slice-4`
**Status:** Design — pending user approval
**Spec source:** Continuation after Slice 3 full Tier 1 web coverage

---

## Context

| Slice | Status | Opencode tests | Web tests | Total |
|---|---|---:|---:|---:|
| 1 | shipped | 9 | 2 | 11 |
| 2 | shipped | 13 | 0 | 24 |
| 3 | shipped | 0 | 12 | 36 |
| **4 (this)** | design | **5** | **2** | **43** |

Slice 3 proved the core web transport surfaces exist: HTTP proxy CRUD, SSE, and WS. Slice 4 verifies the next layer up: real prompt submission and prompt-related event delivery. The UI path does not call the SDK's blocking `session.prompt`; it posts to OpenCode's async endpoint and receives updates over the event stream.

## Goal

Add provider-agnostic live conversation flow coverage. The tests should prove `prompt_async` accepts prompts, emits message/status events, validates malformed input, and works through the OpenChamber proxy route used by the UI. The slice intentionally does **not** require a configured LLM provider or a completed model response.

## Chosen approach

Use both surfaces, weighted direct:

```
tests/opencode/
└── prompt-async-events.test.ts      — 5 tests (direct OpenCode prompt_async + event stream)

tests/web/
└── prompt-async-proxy.test.ts       — 2 tests (OpenChamber proxy forwarding + error passthrough)
```

Direct OpenCode tests give precise failure signals for prompt/event behavior. Proxy tests cover the real UI route (`/api/session/:id/prompt_async`) without duplicating every direct assertion through the proxy.

## Architectural anchors

| Concern | File | Anchor |
|---|---|---|
| UI prompt submission | `packages/ui/src/lib/opencode/client.ts` | `sendMessage()` posts to `${baseUrl}/session/${id}/prompt_async` |
| Prompt body shape | `packages/ui/src/lib/opencode/client.ts` | `{ model, agent, variant, messageID, format, parts }` |
| Scheduled-task direct prompt call | `packages/web/server/src/domains/scheduled-tasks/runtime.ts` | `fetch(baseUrl + "/session/.../prompt_async", ...)` |
| Event types expected during prompt | `packages/ui/src/sync/DOCUMENTATION.md` | `message.*`, `message.part.*`, `session.status` |
| Existing OpenCode test setup | `tests/opencode/session-crud.test.ts` | `startOpenCodeInstance()` + SDK client pattern |
| Existing web proxy setup | `tests/web/api-session-crud.test.ts` | shared OpenCode + OpenChamber lifecycle pattern |

## Provider constraint

Real model completion requires a configured provider and model. These tests must be deterministic on a clean development machine, so they verify infrastructure signals that do not require a completed assistant response:

- `prompt_async` returns promptly.
- The user message appears in the event stream.
- Prompt-related message/status events are emitted.
- Malformed payloads return structured 4xx/5xx behavior matching the current OpenCode binary.

If the current OpenCode binary emits fewer prompt events without a provider, tests adapt to observed on-the-wire behavior and document the gap inline. Do not add live-provider dependencies in this slice.

## File 1: `tests/opencode/prompt-async-events.test.ts`

Per-suite OpenCode direct setup. Uses `startOpenCodeInstance()` and the generated SDK only for session creation/list/get. Prompt submission uses `fetch()` because `prompt_async` is not exposed by the SDK wrapper used in existing tests. Event capture can use fetch against OpenCode's SSE endpoint (`/event` or `/event?directory=<cwd>`) and parse raw SSE chunks, following the Slice 3 SSE helper pattern.

| # | Test | Verifies |
|---|---|---|
| 1 | `prompt_async` accepts a text prompt and returns promptly | Async endpoint exists, accepts the UI-shaped body, and does not block on model completion |
| 2 | prompt submission emits a message event containing the prompt text | Prompt data reaches OpenCode's event stream |
| 3 | prompt submission emits a `session.status` or equivalent lifecycle event | Conversation lifecycle is visible to live clients |
| 4 | two parallel prompts in different sessions do not cross-contaminate observed session IDs | Event stream carries enough identifiers to isolate sessions |
| 5 | malformed prompt body returns a structured error status | Validation/failure path is deterministic and documented |

Test 3 should accept the current OpenCode binary's exact lifecycle naming. If it emits `session.updated` instead of `session.status`, or only message updates, encode that observed behavior rather than inventing a contract.

## File 2: `tests/web/prompt-async-proxy.test.ts`

Per-suite Mode A setup with OpenCode plus OpenChamber, following `tests/web/api-session-crud.test.ts`. The route under test is OpenChamber's proxied API path:

```
POST /api/session/:sessionID/prompt_async
```

| # | Test | Verifies |
|---|---|---|
| 1 | proxy forwards a valid `prompt_async` request and returns promptly | UI route can submit prompts through OpenChamber |
| 2 | proxy preserves malformed prompt error behavior | Proxy error passthrough stays transparent |

The proxy tests should not assert model output. They only prove that the web route forwards request shape and status/body behavior consistently with direct OpenCode.

## Helpers

Prefer file-local helpers. No new npm dependencies.

Likely local helpers:

- `openSse(baseUrl, path, onChunk)` — fetches an SSE stream and buffers text chunks.
- `waitForEventText(buffer, predicate, timeoutMs)` — polls the buffered stream for expected event text.
- `postPromptAsync(baseUrl, sessionID, body)` — thin fetch wrapper that posts JSON.

Avoid shared helper extraction unless both new files need identical logic after implementation. Small duplication is acceptable in tests if it keeps each file understandable.

## Process safety

The AGENTS.md hard rule applies: no name-based process matching, no stoppage verification subagents, and no commands that enumerate or kill by process name. The existing PID recording, sibling watchdog, and orphan reaper in `tests/helpers/opencode-process.ts` are the cleanup mechanism. If debugging a leak is unavoidable, inspect only harness-owned pid files under `/tmp/openchamber-opencode-*/pid` and use `process.kill(pid, 0)` for liveness.

## Verification

| Step | Command | Expected |
|---|---|---|
| Direct prompt file | `bun run --cwd tests test:opencode -- prompt-async-events.test.ts` | 5 tests collected; all pass unless an unavoidable provider-constraint skip is documented inline |
| Proxy prompt file | `bun run --cwd tests test:web -- prompt-async-proxy.test.ts` | 2 tests pass |
| Opencode surface | `bun run --cwd tests test:opencode` | 27 opencode tests pass |
| Web surface | `bun run --cwd tests test:web` | 16 web tests collected; pass with only existing documented environmental skips |
| Type-check | `bun run --cwd tests type-check` | clean |

Do not include a process-name leak scan in verification. Cleanup is owned by the harness layers described above.

## README update

Append a `### Slice 4` subsection to the Coverage section in `tests/README.md`:

```
| File | Tests |
|---|---|
| `opencode/prompt-async-events.test.ts` | 5 |
| `web/prompt-async-proxy.test.ts` | 2 |
| **Slice 4 total** | **7** |
| **OpenCode total** | **27** |
| **Web total** | **16** |
| **Total** | **43** |
```

## Out of scope

- Real provider/model completion assertions.
- Token/cost accounting from completed assistant messages.
- UI React sync store assertions.
- Tool-call execution and permission request flows.
- Electron or VS Code runtime parity.
- Additional proxy route coverage beyond `prompt_async`.

## Risks

1. **No-provider behavior may be sparse.** If OpenCode queues the prompt but emits only a subset of expected events before failing provider resolution, encode the actual emitted events and document the limitation.
2. **SSE timing.** Prompt events can arrive quickly or after a short delay. Use bounded polling (5-10s) and clear timeout errors containing buffered event text.
3. **Event shape drift.** Event names may differ across OpenCode versions. Tests should assert durable fields (session id, prompt text, event category) rather than brittle full payload equality.
4. **Proxy prefix behavior.** OpenChamber proxies `/api/session/:id/prompt_async` to OpenCode's `/session/:id/prompt_async`. If the proxy rewrites differently, tests adapt to observed route behavior and document it.

## Acceptance criteria

- 7 new Slice 4 tests added across 2 files.
- New tests are provider-agnostic and do not require model credentials.
- Direct OpenCode prompt/event behavior and OpenChamber proxy forwarding are both covered.
- README coverage totals updated to 43.
- No new dependencies.
- Process cleanup remains PID-file based; no process-name stoppage verification.
- Plan, implementation, review, and verification complete on `feature/integration-tests-slice-4` before merging.
