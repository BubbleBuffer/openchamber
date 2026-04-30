# Sync Pipeline Bugfixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix four bugs in the sync pipeline discovered during systematic debugging: VS Code webview crash, SSE silent stream death, misleading indentation in event-reducer, and session_status idle fallback not running on unchanged messages.

**Architecture:** Four independent bugfixes, ordered by priority. Bug #1 (VS Code crash) is a definite crash — fix the import path first. Bug #3 (stream death) is high-confidence — add stream-end detection to the SSE attempt loop. Bugs #2 and #4 are minor cleanup in event-reducer.ts. Each fix has its own test, implementation, and commit.

**Tech Stack:** TypeScript, Bun, Zustand, `@opencode-ai/sdk`, React, Electron

---

## File Changes

| File | Change |
|------|--------|
| `packages/ui/src/sync/event-reducer.test.ts` | Create — tests for session_status fallback and message.updated behavior |
| `packages/ui/src/sync/event-pipeline.test.ts` | Create — tests for SSE silent stream end detection |
| `packages/vscode/webview/main.tsx` | Fix — replace `useConfigStore` import with `useProviderConfigStore` + `useAgentConfigStore` |
| `packages/ui/src/sync/event-reducer.ts` | Fix — re-indent message.updated case; move session_status fallback before unchanged check |
| `packages/ui/src/sync/event-pipeline.ts` | Fix — detect silent SSE stream end and trigger reconnect |

---

## Task Ordering Notes

- **Bug #1 first** — definite crash blocking VS Code users.
- **Bug #3 second** — high confidence, active data loss (UI freeze, no reconnect).
- **Bug #2 + Bug #4 third** — same file, independent functional and cleanup changes.

---

### Task 1: Fix VS Code webview crash — wrong store import

**Files:**
- Modify: `packages/vscode/webview/main.tsx:1162-1196`
- Create: `packages/ui/src/sync/vscode-store-imports.test.ts`

- [ ] **Step 1: Write test verifying correct store import pattern**

```typescript
// packages/ui/src/sync/vscode-store-imports.test.ts
import { describe, expect, test } from "bun:test"

describe("VS Code webview store imports", () => {
  test("useProviderConfigStore exports getState with currentProviderId and currentModelId", async () => {
    const { useProviderConfigStore } = await import("@/stores/useProviderConfigStore")
    const store = useProviderConfigStore
    expect(store).toBeDefined()
    expect(typeof store.getState).toBe("function")
    const state = store.getState()
    // These fields exist on the store state — may be empty strings at test time,
    // but the property must exist
    expect(state).toHaveProperty("currentProviderId")
    expect(state).toHaveProperty("currentModelId")
  })

  test("useAgentConfigStore exports getState with currentAgentName", async () => {
    const { useAgentConfigStore } = await import("@/stores/useAgentConfigStore")
    const store = useAgentConfigStore
    expect(store).toBeDefined()
    expect(typeof store.getState).toBe("function")
    const state = store.getState()
    expect(state).toHaveProperty("currentAgentName")
  })

  test("useConfigStore facade does NOT export useConfigStore as a named export", async () => {
    // This verifies the root cause of Bug #1 — the old import pattern crashes
    const configStoreModule = await import("@/stores/useConfigStore")
    expect((configStoreModule as Record<string, unknown>).useConfigStore).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails for the wrong import pattern**

```bash
bun test packages/ui/src/sync/vscode-store-imports.test.ts -v
```
Expected output: Tests 1 and 2 pass (correct imports work). Test 3 passes (`useConfigStore` is undefined as expected — this validates the crash root cause exists).

**Important:** Tests 1 and 2 depend on Zustand stores being importable in bun test. If the store's persist middleware throws (no localStorage), the test module may fail to load. In that case, we simplify the test to only check module exports:

```typescript
test("useProviderConfigStore module has named export", async () => {
  const mod = await import("@/stores/useProviderConfigStore")
  expect(mod).toHaveProperty("useProviderConfigStore")
})
```

- [ ] **Step 3: Fix VS Code webview to import from correct stores**

Replace the dynamic import block in `packages/vscode/webview/main.tsx` lines 1162-1197:

```typescript
// Listen for createSessionWithPrompt command from extension (Explain, Improve Code)
onCommand('createSessionWithPrompt', (payload) => {
  const { prompt } = payload as { prompt: string };

  Promise.all([
    import('@/sync/session-ui-store'),
    import('@/stores/useProviderConfigStore'),
    import('@/stores/useAgentConfigStore'),
    import('@/sync/input-store'),
  ]).then(([{ useSessionUIStore }, { useProviderConfigStore }, { useAgentConfigStore }, { useInputStore }]) => {
    const sessionStore = useSessionUIStore.getState();
    const providerConfig = useProviderConfigStore.getState();
    const agentConfig = useAgentConfigStore.getState();

    // Open a new session draft first
    sessionStore.openNewSessionDraft();

    // Get current provider/model/agent configuration
    const { currentProviderId, currentModelId } = providerConfig;
    const { currentAgentName } = agentConfig;

    if (currentProviderId && currentModelId) {
      // Send the message - this will create the session from the draft and send
      sessionStore.sendMessage(
        prompt,
        currentProviderId,
        currentModelId,
        currentAgentName ?? undefined,
        undefined, // attachments
        undefined, // agentMentionName
        undefined  // additionalParts
      ).catch((error: unknown) => {
        console.error('[OpenChamber] Failed to send prompt:', error);
      });
    } else {
      // If no provider/model configured, just set the text and let user send manually
      useInputStore.getState().setPendingInputText(prompt);
    }
  });
});
```

- [ ] **Step 4: Verify fix with type-check**

```bash
bun run type-check
```
Expected: No type errors. The `packages/vscode/` directory should compile cleanly.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/sync/vscode-store-imports.test.ts packages/vscode/webview/main.tsx
git commit -m "fix: VS Code webview crash — replace useConfigStore import with correct stores

useConfigStore facade no longer exports a named 'useConfigStore' export
after store refactoring. The VS Code webview's dynamic import destructured
{ useConfigStore } which resolved to undefined, causing TypeError on
.getState() call.

Fix by importing useProviderConfigStore for currentProviderId/currentModelId
and useAgentConfigStore for currentAgentName directly."
```

---

### Task 2: SSE stream death — detect silent stream end

**Files:**
- Modify: `packages/ui/src/sync/event-pipeline.ts:369`
- Create: `packages/ui/src/sync/event-pipeline.test.ts`

- [ ] **Step 1: Write test for SSE silent stream end detection**

```typescript
// packages/ui/src/sync/event-pipeline.test.ts
import { describe, expect, test } from "bun:test"
import { createEventPipeline } from "./event-pipeline"

/**
 * Creates a mock SDK whose global.event() returns an empty SSE stream
 * that ends immediately — simulating a silent connection drop.
 */
function createEmptyStreamSdk() {
  return {
    global: {
      event: async () => ({
        stream: (async function* () {
          // Yield nothing — stream ends immediately
          return
        })(),
      }),
    },
  }
}

/**
 * Creates a mock SDK whose global.event() returns a stream that
 * produces one event then ends — simulating a normal brief connection.
 */
function createSingleEventSdk() {
  let called = false
  return {
    global: {
      event: async () => ({
        stream: (async function* () {
          if (called) return
          called = true
          yield { payload: { type: "server.connected", properties: {} } }
          return
        })(),
      }),
    },
  }
}

describe("SSE silent stream end detection", () => {
  test("calls onDisconnect when SSE stream ends without error (empty stream)", async () => {
    const sdk = createEmptyStreamSdk()
    let disconnectReason: string | undefined
    const disconnectResolved = new Promise<void>((resolve) => {
      const pipeline = createEventPipeline({
        sdk: sdk as any,
        onEvent: () => {},
        onDisconnect: (reason: string) => {
          disconnectReason = reason
          pipeline.cleanup()
          resolve()
        },
        // Speed up test by using minimal reconnect delay
        reconnectDelayMs: 10,
        heartbeatTimeoutMs: 5000,
      })
    })

    await Promise.race([
      disconnectResolved,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for onDisconnect")), 2000)),
    ])

    expect(disconnectReason).toBeDefined()
    // The reason should mention the stream ended
    expect(disconnectReason).toContain("sse")
  })

  test("calls onDisconnect when SSE stream ends after producing events", async () => {
    const sdk = createSingleEventSdk()
    let disconnectReason: string | undefined
    const disconnectResolved = new Promise<void>((resolve) => {
      const pipeline = createEventPipeline({
        sdk: sdk as any,
        onEvent: () => {},
        onDisconnect: (reason: string) => {
          disconnectReason = reason
          pipeline.cleanup()
          resolve()
        },
        reconnectDelayMs: 10,
        heartbeatTimeoutMs: 5000,
      })
    })

    await Promise.race([
      disconnectResolved,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for onDisconnect")), 2000)),
    ])

    expect(disconnectReason).toBeDefined()
    expect(disconnectReason).toContain("sse")
  })
})
```

- [ ] **Step 2: Run test to verify it fails (no stream-end detection yet)**

```bash
bun test packages/ui/src/sync/event-pipeline.test.ts -v
```
Expected: Both tests FAIL with "Timed out waiting for onDisconnect" — the empty stream and the single-event stream both end without triggering `onDisconnect`, because `runSseAttempt` returns normally without detecting the end.

- [ ] **Step 3: Implement silent stream end detection**

Add stream-end detection after the `for await` loop in `runSseAttempt`. At line 369 of `packages/ui/src/sync/event-pipeline.ts`, right after the closing brace of the `for await` loop, add:

```typescript
      // Detect silent stream death: if the stream ended without being aborted,
      // the connection dropped unexpectedly. Throw so the caller's catch block
      // fires notifyDisconnected and triggers reconnect.
      if (!signal.aborted) {
        throw new Error("SSE stream ended unexpectedly")
      }
```

The exact insertion point is after line 369 (after `}` that closes the `for await` block and before `}` that closes `runSseAttempt`). The full `runSseAttempt` function will be:

```typescript
  const runSseAttempt = async (signal: AbortSignal) => {
    const events = await sdk.global.event({
      signal,
      ...(lastEventId && lastEventId.length > 0 ? { headers: { "Last-Event-ID": lastEventId } } : {}),
      onSseError: (error: unknown) => {
        if (isAbortError(error)) return
        if (streamErrorLogged) return
        streamErrorLogged = true
        console.error("[event-pipeline] SSE stream error", error)
      },
    })

    markConnected()

    let yielded = Date.now()
    resetHeartbeat()

    for await (const event of events.stream) {
      resetHeartbeat()
      streamErrorLogged = false
      const payload = resolveEventPayload((event as { payload?: Event }).payload ?? event)
      if (!payload) {
        continue
      }
      const directory = resolveEventDirectory(event, payload)
      enqueueEvent(directory, payload)

      if (Date.now() - yielded < STREAM_YIELD_MS) continue
      yielded = Date.now()
      await wait(0)
    }

    // Detect silent stream death: if the stream ended without being aborted,
    // the connection dropped unexpectedly. Throw so the caller's catch block
    // fires notifyDisconnected and triggers reconnect.
    if (!signal.aborted) {
      throw new Error("SSE stream ended unexpectedly")
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test packages/ui/src/sync/event-pipeline.test.ts -v
```
Expected: Both tests PASS. Test 1: `onDisconnect` is called with a reason containing "sse" after empty stream ends. Test 2: `onDisconnect` is called with a reason containing "sse" after single-event stream ends.

- [ ] **Step 5: Run broader sync tests to check no regressions**

```bash
bun test packages/ui/src/sync/ -v
```
Expected: All existing tests + new tests pass.

- [ ] **Step 6: Run type-check**

```bash
bun run type-check
```
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/sync/event-pipeline.test.ts packages/ui/src/sync/event-pipeline.ts
git commit -m "fix: detect silent SSE stream end and trigger reconnect

When the SSE stream drops (ERR_CONNECTION_CLOSED), the SDK's async
iterator may end silently (return from for await loop) without throwing.
Previously, runSseAttempt returned normally, the heartbeat was cleared,
and notifyDisconnected never fired — leaving the UI frozen with
isConnected=true and no reconnect attempt.

Fix: after the for await loop completes, check if the signal was aborted.
If not, the stream ended unexpectedly. Throw an error so the existing
catch block fires notifyDisconnected and triggers the reconnect loop."
```

---

### Task 3: Fix event-reducer indentation and session_status idle fallback

**Files:**
- Modify: `packages/ui/src/sync/event-reducer.ts:221-261`
- Create: `packages/ui/src/sync/event-reducer.test.ts`

- [ ] **Step 1: Write tests for session_status idle fallback and message.updated behavior**

```typescript
// packages/ui/src/sync/event-reducer.test.ts
import { describe, expect, test } from "bun:test"
import type { Event, Message } from "@/lib/opencode/client"
import { applyDirectoryEvent } from "./event-reducer"
import type { State } from "./types"

function createMinimalState(overrides: Partial<State> = {}): State {
  return {
    session: [],
    session_status: {},
    session_diff: {},
    message: {},
    part: {},
    todo: {},
    permission: {},
    question: {},
    sessionTotal: 0,
    limit: 100,
    ...overrides,
  } as State
}

function createMessageUpdatedEvent(
  sessionID: string,
  messageID: string,
  role: string,
  finish: string | undefined,
  completed: number | undefined,
): Event {
  return {
    type: "message.updated",
    properties: {
      info: {
        id: messageID,
        sessionID,
        role,
        finish,
        time: completed ? { created: 1, updated: 1, completed } : { created: 1, updated: 1 },
        parts: [],
      } as unknown as Message,
    },
  } as unknown as Event
}

function createSessionStatusEvent(
  sessionID: string,
  statusType: "idle" | "busy",
): Event {
  return {
    type: "session.status",
    properties: {
      sessionID,
      status: { type: statusType },
    },
  } as unknown as Event
}

function addMessageToState(
  state: State,
  sessionID: string,
  messageID: string,
  role: string,
  finish?: string,
  completed?: number,
) {
  const messages = state.message[sessionID] ?? []
  messages.push({
    id: messageID,
    sessionID,
    role,
    finish,
    time: { created: 1, updated: 1, ...(completed ? { completed } : {}) },
    parts: [],
  } as unknown as Message)
  state.message[sessionID] = messages
}

describe("applyDirectoryEvent message.updated", () => {
  test("session_status idle fallback works for changed messages (Bug #4 happy path)", () => {
    const state = createMinimalState()
    const draft = structuredClone(state)
    draft.session_status["session-1"] = { type: "busy" }
    addMessageToState(draft, "session-1", "msg-1", "assistant", "stop", undefined)

    // Send a message.updated where role/finish/completed ARE different
    const event = createMessageUpdatedEvent(
      "session-1",
      "msg-1",
      "assistant",
      "stop",
      12345, // completed time set — different from before
    )

    const result = applyDirectoryEvent(draft, event)

    expect(result).toBe(true)
    // Session status should have transitioned to idle
    expect(draft.session_status["session-1"]?.type).toBe("idle")
  })

  test("session_status idle fallback runs even when message is unchanged (Bug #4)", () => {
    const state = createMinimalState()
    const draft = structuredClone(state)
    draft.session_status["session-1"] = { type: "busy" }
    addMessageToState(draft, "session-1", "msg-1", "assistant", "stop", 12345)

    // Send a message.updated where role/finish/completed match existing
    const event = createMessageUpdatedEvent(
      "session-1",
      "msg-1",
      "assistant",
      "stop",
      12345, // same as existing
    )

    const result = applyDirectoryEvent(draft, event)

    // The fallback should still fire and transition the session to idle
    expect(draft.session_status["session-1"]?.type).toBe("idle")
  })

  test("session_status idle fallback does not fire when session is already idle", () => {
    const state = createMinimalState()
    const draft = structuredClone(state)
    // Session is already idle
    draft.session_status["session-1"] = { type: "idle" }
    addMessageToState(draft, "session-1", "msg-1", "assistant", "stop", 12345)

    const event = createMessageUpdatedEvent(
      "session-1",
      "msg-1",
      "assistant",
      "stop",
      12345,
    )

    const result = applyDirectoryEvent(draft, event)

    // Should still be idle (not a problem, just verifying no regression)
    expect(draft.session_status["session-1"]?.type).toBe("idle")
  })

  test("session_status idle fallback does not fire for non-assistant messages", () => {
    const state = createMinimalState()
    const draft = structuredClone(state)
    draft.session_status["session-1"] = { type: "busy" }
    addMessageToState(draft, "session-1", "msg-1", "user", undefined, undefined)

    const event = createMessageUpdatedEvent(
      "session-1",
      "msg-1",
      "user",
      undefined,
      undefined,
    )

    const result = applyDirectoryEvent(draft, event)

    // Non-assistant messages should not trigger the idle fallback
    expect(draft.session_status["session-1"]?.type).toBe("busy")
  })

  test("new message inserts correctly into existing messages array", () => {
    const state = createMinimalState()
    const draft = structuredClone(state)
    // Session has one message already
    addMessageToState(draft, "session-1", "msg-1", "user")

    // New message with a different ID
    const event = createMessageUpdatedEvent(
      "session-1",
      "msg-2", // different ID — should be inserted
      "assistant",
      "stop",
      12345,
    )

    const result = applyDirectoryEvent(draft, event)

    expect(result).toBe(true)
    expect(draft.message["session-1"]).toHaveLength(2)
    expect(draft.message["session-1"][1].id).toBe("msg-2")
  })
})
```

- [ ] **Step 2: Run test to verify it fails (session_status fallback not running on unchanged messages)**

```bash
bun test packages/ui/src/sync/event-reducer.test.ts -v
```
Expected:
- Test "session_status idle fallback works for changed messages (Bug #4 happy path)" — PASS (this already works)
- Test "session_status idle fallback runs even when message is unchanged (Bug #4)" — FAIL (the fallback is skipped by `return false`)
- Test "session_status idle fallback does not fire when session is already idle" — PASS
- Test "session_status idle fallback does not fire for non-assistant messages" — PASS
- Test "new message inserts correctly into existing messages array" — PASS

- [ ] **Step 3: Fix indentation and session_status fallback in event-reducer.ts**

Replace lines 221-261 of `packages/ui/src/sync/event-reducer.ts` (the entire `case "message.updated"` block) with corrected code:

```typescript
    case "message.updated": {
      const info = (event.properties as { info: Message }).info
      const messages = draft.message[info.sessionID]
      if (!messages) {
        draft.message[info.sessionID] = [info]
        return true
      }
      const result = Binary.search(messages, info.id, (m) => m.id)
      if (result.found) {
        // Skip message replacement if unchanged — preserves reference, avoids re-render
        const existing = messages[result.index]
        const unchanged = existing.role === info.role
          && (existing as { finish?: unknown }).finish === (info as { finish?: unknown }).finish
          && (existing.time as { completed?: number })?.completed === (info.time as { completed?: number })?.completed

        // Fallback: transition session_status to idle when an assistant message
        // completes. OpenCode may not always send a session.status (idle) event
        // after message.updated with finish='stop', leaving the UI stuck in busy.
        // This runs BEFORE the unchanged check so it fires even for deduplicated events.
        if (
          info.role === "assistant" &&
          info.finish === "stop" &&
          typeof info.time?.completed === "number" &&
          draft.session_status?.[info.sessionID]?.type === "busy"
        ) {
          draft.session_status[info.sessionID] = { type: "idle" }
        }

        if (unchanged) {
          syncDebug.reducer.messageUpdatedUnchanged(info.sessionID, info.id, info.role, (info as { finish?: unknown }).finish, (info.time as { completed?: number })?.completed)
          return false
        }

        const next = [...messages]
        next[result.index] = info
        draft.message[info.sessionID] = next
      } else {
        const next = [...messages]
        next.splice(result.index, 0, info)
        draft.message[info.sessionID] = next
      }

      return true
    }
```

**What changed:**
1. **Bug #4 fix:** Moved the session_status idle fallback (the `if (info.role === "assistant"...)` block) BEFORE the `if (unchanged) { return false }` check. Previously it was after, so unchanged messages skipped the fallback.
2. **Bug #2 fix:** Re-indented lines that were at the wrong indentation level:
   - Lines `const next = [...messages]`, `next[result.index] = info`, `draft.message[info.sessionID] = next` — were at 6-space indent (same as `if (result.found)`), now at 8-space indent (inside the `if` block).
   - Lines `const next = [...messages]`, `next.splice(result.index, 0, info)`, `draft.message[info.sessionID] = next` — were at 6-space indent (same as `} else {`), now at 8-space indent (inside the `else` block).
   - The `return true` at the end was at 6-space indent (same level as `if (result.found)`), now at 6-space indent (same level as the case body, which is correct — it's the return for the whole case).

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test packages/ui/src/sync/event-reducer.test.ts -v
```
Expected: All 5 tests PASS, including the previously-failing "session_status idle fallback runs even when message is unchanged (Bug #4)".

- [ ] **Step 5: Run type-check**

```bash
bun run type-check
```
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/sync/event-reducer.test.ts packages/ui/src/sync/event-reducer.ts
git commit -m "fix: re-indent message.updated case and move session_status fallback before unchanged check

Bug #2: The message.updated case had misleading indentation — lines
inside if/else blocks were at the same indent level as the blocks
themselves. While JavaScript ignores indentation, this caused multiple
researchers to misread the brace structure. Fixed indentation to match
actual control flow.

Bug #4: The session_status idle fallback (transitioning from busy to
idle for completed assistant messages) was placed after the unchanged
check's 'return false'. When a duplicate message.updated arrived,
the fallback was skipped, potentially leaving the session stuck in
busy state. Moved the fallback before the unchanged check so it
runs unconditionally for completed assistant messages."
```

---

## Quality Checklist

1. **Spec coverage:** Every bug has at least one task. Bug #1 → Task 1, Bug #3 → Task 2, Bug #2 + Bug #4 → Task 3.
2. **YAGNI:** No tasks implement features not in the spec. No over-engineering.
3. **File structure:** Each file has one clear responsibility. Tests mirror source files. VS Code fix is isolated from UI package changes.
4. **Dead references:** No types/functions used that aren't defined. `applyDirectoryEvent`, `State`, `Event`, `Message` are all exported from existing modules.
5. **Ordering:** Bug #1 (crash) first, Bug #3 (data loss) second, Bug #2+#4 (cleanup) third. No cross-dependencies between tasks.
6. **Placeholder scan:** No TBD, TODO, "implement later", or vague steps.
7. **Code completeness:** All code blocks are complete. No snippets, no "...", no "similar to above."
8. **Command accuracy:** Commands reference correct paths. Test commands match actual test names.
9. **Granularity:** Each step is one action: write test → run failing → implement → run passing → commit.
