# Test Strategy Slice 5 — Tool-call streaming

> **For agentic workers:** This is a design document. It is approved and frozen. Implementation follows via `.superpawers/plans/2026-06-26-test-strategy-slice-5.md` (written next, after this spec is committed).

**Goal:** Cover OpenCode's tool-call lifecycle (registry → tool part lifecycle → event stream) and the OpenChamber web proxy's forwarding of these surfaces.

**Architecture:** Provider-agnostic tests that exercise the real tool SDK methods against a spawned OpenCode instance. Tool-part lifecycle tests use `client.part.update()` to inject synthetic `ToolPart` state transitions (pending → running → completed) — no LLM provider is required, but the wire-format and event semantics are the same as a real tool invocation. Web proxy tests confirm the proxy is payload-transparent for tool-typed payloads.

**Tech Stack:** Vitest, `@opencode-ai/sdk/v2`, `@opencode-ai/sdk/v2/gen/types.gen.d.ts` (referenced for type shapes), `fetch` for raw HTTP, native `ReadableStream` for SSE.

---

## Why this slice

Slices 1–4 covered OpenCode SDK basics, surface expansion, web Tier 1, and live conversation flows. Slice 5 closes the loop on **tool-call infrastructure** — the layer that fans out from a model decision into actual side-effecting work (file edits, bash, web fetches, etc.).

Real tool calls require a configured LLM provider — without one, OpenCode never produces a `ToolPart`. We work around this by injecting synthetic tool parts via `client.part.update()`, which round-trips through the same storage, event stream, and proxy path that a real tool call would. The test surface becomes the *infrastructure*, not the *model* — exactly what we want from a slice that doesn't depend on a model credential.

---

## Out of scope

- Real tool invocations requiring an LLM provider (`bash`, `webfetch`, `edit`, etc. with real model decisions)
- `client.permission.*` (only fires when a tool needs approval; not reachable without a real model)
- Tool-specific routing in the OpenChamber web shell (no `tool.*` routes; web proxies the upstream OpenCode API)
- Cross-runtime parity (deferred to a separate slice; would need Electron + VS Code harnesses)

---

## Test surface (3 files, ~9 tests)

### File 1: `tests/opencode/tool-registry.test.ts` — 3 tests

Validates OpenCode's tool registry. Real OpenCode ships with a non-empty built-in set (`bash`, `read`, `write`, `edit`, `glob`, `grep`, `webfetch`, `task`, etc.). Tests pin the surface; we don't lock exact IDs but verify presence of well-known names and that registry is non-empty + structurally sound.

| # | Test | What it pins |
|---|---|---|
| 1 | `tool.ids()` returns a non-empty list containing common built-ins | Registry has built-in tools; common names are present |
| 2 | `tool.list({provider, model})` returns objects with `id` + `description` + JSON-schema `parameters` | Registry entries are well-formed; tools have parameter schemas |
| 3 | Every ID from `tool.ids()` appears as a key in `tool.list()` | The two APIs are consistent |

**Provider/model:** Use any well-known provider/model ID pair (e.g., `{ providerID: "anthropic", modelID: "claude-sonnet-4-20250514" }`). The provider doesn't need to be configured — `tool.list()` returns the schema registry regardless of provider credentials.

**Anchor reference:** `tests/opencode/session-crud.test.ts` for SDK round-trip + `startOpenCodeInstance()` usage.

### File 2: `tests/opencode/tool-part-lifecycle.test.ts` — 4 tests

Validates that a `ToolPart` persists across state transitions and emits SSE events. We drive transitions with `client.part.update()` because real LLM-driven transitions aren't reproducible without a model.

| # | Test | What it pins |
|---|---|---|
| 1 | Create session + user message + `ToolPart` with pending state; verify via `client.session.messages()` | Pending ToolPart persists with `status: "pending"`, `input`, `callID` |
| 2 | Update `ToolPart` to running state with `title` + `time.start`; verify via messages.list | State transition persists; running state has time.start |
| 3 | Update `ToolPart` to completed state with `output` + `time.end`; verify via messages.list | Completed state has output + time.end; previous fields preserved |
| 4 | SSE stream emits `message.part.updated` events containing ToolPart data for each transition | Event stream surfaces state transitions |

**Synthetic tool shape:** use a fake tool name like `"noop_test_tool"` — OpenCode doesn't validate that the tool exists in registry for `part.update()` (the SDK accepts any `Part2` shape). Document this in inline comment.

**Anchor reference:** `tests/opencode/prompt-async-events.test.ts` for the SSE fetch helper + lifecycle test scaffolding.

### File 3: `tests/web/tool-part-proxy.test.ts` — 2-3 tests

Validates that the OpenChamber web proxy forwards tool-typed payloads without re-shaping them. Tests use the same `startOpenCodeInstance` + inline `import("@openchamber/web")` + `startWebUiServer({port:0})` bootstrap as Slice 4's `prompt-async-proxy.test.ts`.

| # | Test | What it pins |
|---|---|---|
| 1 | Web proxy `POST /api/tool/ids` forwards correctly and returns the same list as upstream | Tool registry proxy is payload-transparent |
| 2 | Web proxy `POST /api/part/update` with a `ToolPart` body persists and is readable via messages.list | Tool-typed part payloads proxy through unmodified |
| 3 | Web proxy `POST /api/part/delete` removes the tool part | Part deletion proxy is payload-transparent |

(If the web proxy mounts the upstream API under `/api/` prefix, this just exercises the proxy; the body shape is identical to direct OpenCode calls.)

**Anchor reference:** `tests/web/prompt-async-proxy.test.ts:1-130` for the bootstrap block.

---

## Cumulative coverage after Slice 5

| Surface | Prior (Slice 4) | Slice 5 new | Total |
|---|---|---|---|
| OpenCode direct | 27 | +7 (3 + 4) | **34** |
| Web proxy | 16 | +2-3 | **18-19** |
| **Grand total** | **43** | **+9-10** | **~52-53** |

---

## Verification (full-surface, Slice 5)

- `bun run --cwd tests type-check` — must exit 0
- `bun run --cwd tests test:opencode` — 34 pass (or with documented environmental skips only)
- `bun run --cwd tests test:web` — 18-19 pass (or with documented environmental skips only)
- `bun run --cwd tests test:opencode -- tool-registry.test.ts tool-part-lifecycle.test.ts` (isolated re-run)
- `bun run --cwd tests test:web -- tool-part-proxy.test.ts` (isolated re-run)
- PID-file inspection (`/tmp/openchamber-opencode-*/pid`): every pid file references a dead PID — no leaks from Slice 5
- No `killall`/`pkill`/`pgrep` anywhere — grep audit
- No name-based process match in subagent prompts; no stoppage-verification subagent (per AGENTS.md hard rule)

---

## Process cleanup

Reuse the existing PID-recording + sibling watchdog + orphan reaper layers from `tests/helpers/opencode-process.ts` and `tests/helpers/opencode-watchdog.cjs`. No new process management. Tests use `opencode.stop()` and the web handle's `stop({exitProcess: false})` (matching Slice 3/4's pattern).