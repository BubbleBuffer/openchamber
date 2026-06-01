import { describe, expect, it, vi } from "vitest";
import { createEffectExecutor } from "./effect-executor.js";
import type { SessionMachineEffect } from "@openchamber/session-state";

describe("effect executor", () => {
  it("handles sendPrompt effect", async () => {
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { sendPrompt } });

    const effect: SessionMachineEffect = {
      type: "sendPrompt",
      directory: "dir",
      sessionId: "sid",
      prompt: "hello",
      provider: "openai",
      model: "gpt-4",
      agent: "default",
    };

    await executor.execute(effect);
    expect(sendPrompt).toHaveBeenCalledWith("dir", "sid", "hello", "openai", "gpt-4", "default");
  });

  it("handles abort effect with signal", async () => {
    const abort = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { abort } });

    const effect: SessionMachineEffect = {
      type: "abort",
      directory: "dir",
      sessionId: "sid",
    };

    await executor.execute(effect);
    expect(abort).toHaveBeenCalledWith("dir", "sid", expect.any(AbortSignal));
  });

  it("handles retry effect", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { retry } });

    const effect: SessionMachineEffect = {
      type: "retry",
      directory: "dir",
      sessionId: "sid",
      retryCount: 2,
      retryMessage: "try again",
    };

    await executor.execute(effect);
    expect(retry).toHaveBeenCalledWith("dir", "sid", 2, "try again");
  });

  it("handles loadOlder effect", async () => {
    const loadOlder = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { loadOlder } });

    const effect: SessionMachineEffect = {
      type: "loadOlder",
      directory: "dir",
      sessionId: "sid",
    };

    await executor.execute(effect);
    expect(loadOlder).toHaveBeenCalledWith("dir", "sid");
  });

  it("no-ops for effects with no callback", async () => {
    const executor = createEffectExecutor({});
    const effect: SessionMachineEffect = {
      type: "sendPrompt",
      directory: "dir",
      sessionId: "sid",
      prompt: "test",
      provider: "",
      model: "",
      agent: "",
    };
    await expect(executor.execute(effect)).resolves.toBeUndefined();
  });

  it("dispose clears all timers", () => {
    const executor = createEffectExecutor({});
    executor.dispose();
    // No error expected
  });
});
