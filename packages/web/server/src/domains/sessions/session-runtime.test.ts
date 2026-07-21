import { describe, expect, it } from "vitest";

import { createSessionRuntime } from "./session-runtime.js";

describe("session runtime attention state", () => {
  it("distinguishes known legacy sessions from unknown sessions while retaining viewed state", () => {
    const runtime = createSessionRuntime({});
    runtime.processOpenCodeSsePayload({ session_id: "legacy-session" });

    expect(runtime.getSessionAttentionState("legacy-session")).toBe(true);
    runtime.markSessionViewed("/project", "legacy-session");
    expect(runtime.getSessionAttentionState("legacy-session")).toBe(false);
    expect(runtime.getSessionAttentionState("missing-session")).toBeNull();
  });

  it("returns actor attention for known sessions and null for unknown actors", () => {
    const snapshots = new Map<string, unknown>([
      ["/project::normal", { permissionsById: {}, questionsById: {}, retryMessage: null, fatalError: null }],
      ["/project::blocked", { permissionsById: { permission: {} }, questionsById: {}, retryMessage: null, fatalError: null }],
    ]);
    const runtime = createSessionRuntime({
      actorRegistry: {
        entries: () => [],
        getOrCreate: () => null,
        send: () => {},
        getSnapshot: (key) => snapshots.get(key) as never,
        listKeys: () => Array.from(snapshots.keys()),
        evict: () => {},
        dispose: () => {},
      },
    });

    expect(runtime.getSessionAttentionState("normal")).toBe(false);
    expect(runtime.getSessionAttentionState("blocked")).toBe(true);
    expect(runtime.getSessionAttentionState("missing-session")).toBeNull();
  });
});
