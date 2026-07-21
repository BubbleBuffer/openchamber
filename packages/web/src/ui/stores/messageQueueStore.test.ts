import "happy-dom";
import { ensureDom } from "./utils/setupDom";
ensureDom();

import { describe, it, expect, beforeEach } from "bun:test";

const { useMessageQueueStore } = await import("./messageQueueStore");

describe("messageQueueStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useMessageQueueStore.setState(
      { queuedMessages: {}, queueModeEnabled: true },
      false,
    );
  });

  it("addToQueue generates id + createdAt and stores under sessionId", () => {
    useMessageQueueStore.getState().addToQueue("sess-1", {
      content: "hello",
    });
    const queue = useMessageQueueStore.getState().getQueueForSession("sess-1");
    expect(queue).toHaveLength(1);
    expect(queue[0]?.content).toBe("hello");
    expect(typeof queue[0]?.id).toBe("string");
    expect(typeof queue[0]?.createdAt).toBe("number");
  });

  it("removeFromQueue drops a queued message by id", () => {
    const { addToQueue, removeFromQueue, getQueueForSession } =
      useMessageQueueStore.getState();
    addToQueue("sess-1", { content: "first" });
    const id = getQueueForSession("sess-1")[0]!.id;
    addToQueue("sess-1", { content: "second" });
    removeFromQueue("sess-1", id);
    const queue = getQueueForSession("sess-1");
    expect(queue).toHaveLength(1);
    expect(queue[0]?.content).toBe("second");
  });

  it("popToInput returns the message and removes it from the queue", () => {
    useMessageQueueStore.getState().addToQueue("sess-1", {
      content: "draft",
    });
    const id = useMessageQueueStore.getState().getQueueForSession("sess-1")[0]!
      .id;
    const popped = useMessageQueueStore.getState().popToInput("sess-1", id);
    expect(popped?.content).toBe("draft");
    expect(useMessageQueueStore.getState().getQueueForSession("sess-1")).toEqual(
      [],
    );
  });
});
