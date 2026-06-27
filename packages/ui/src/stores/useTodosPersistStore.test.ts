import "happy-dom";
import { ensureDom } from "./utils/setupDom";
ensureDom();

import { describe, it, expect, beforeEach } from "bun:test";

const { useTodosPersistStore } = await import("./useTodosPersistStore");
const { Todo } = await import("@/lib/opencode/client");

const makeTodo = (id: string): InstanceType<typeof Todo> | any => ({
  id,
  content: `task ${id}`,
  status: "pending",
  priority: "medium",
});

describe("useTodosPersistStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTodosPersistStore.setState({ sessions: {} }, false);
  });

  it("setSessionTodos + getSessionTodos roundtrips via state", () => {
    const todos = [makeTodo("t1"), makeTodo("t2")];
    useTodosPersistStore.getState().setSessionTodos("sess-1", todos);
    expect(useTodosPersistStore.getState().getSessionTodos("sess-1")).toEqual(
      todos,
    );
  });

  it("setSessionTodos with empty array deletes the session key", () => {
    useTodosPersistStore
      .getState()
      .setSessionTodos("sess-1", [makeTodo("t1")]);
    expect(
      useTodosPersistStore.getState().getSessionTodos("sess-1"),
    ).toHaveLength(1);
    useTodosPersistStore.getState().setSessionTodos("sess-1", []);
    expect(
      useTodosPersistStore.getState().getSessionTodos("sess-1"),
    ).toBeUndefined();
  });

  it("evicts oldest session when exceeding MAX_SESSIONS (50)", () => {
    const store = useTodosPersistStore.getState();
    for (let i = 0; i < 51; i++) {
      store.setSessionTodos(`sess-${i}`, [makeTodo(`t-${i}`)]);
    }
    const state = useTodosPersistStore.getState();
    expect(Object.keys(state.sessions)).toHaveLength(50);
    expect(state.getSessionTodos("sess-0")).toBeUndefined();
    expect(state.getSessionTodos("sess-50")).toBeDefined();
  });

  it("touchedAt updates on subsequent sets", async () => {
    useTodosPersistStore.getState().setSessionTodos("sess-1", [makeTodo("t1")]);
    const firstTouch =
      useTodosPersistStore.getState().sessions["sess-1"]!.touchedAt;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        useTodosPersistStore
          .getState()
          .setSessionTodos("sess-1", [makeTodo("t1"), makeTodo("t2")]);
        const secondTouch =
          useTodosPersistStore.getState().sessions["sess-1"]!.touchedAt;
        expect(secondTouch).toBeGreaterThanOrEqual(firstTouch);
        resolve();
      }, 5);
    });
  });
});
