import { describe, it, expect, beforeEach } from "bun:test";
import { useMagicPromptsStore } from "./useMagicPromptsStore";

describe("useMagicPromptsStore", () => {
  beforeEach(() => {
    useMagicPromptsStore.setState(
      { selectedPromptId: "git.commit.generate" },
      false,
    );
  });

  it("defaults to git.commit.generate", () => {
    expect(useMagicPromptsStore.getState().selectedPromptId).toBe(
      "git.commit.generate",
    );
  });

  it("setSelectedPromptId updates the id", () => {
    useMagicPromptsStore.getState().setSelectedPromptId("custom.prompt");
    expect(useMagicPromptsStore.getState().selectedPromptId).toBe("custom.prompt");
  });

  it("setSelectedPromptId with same id is a no-op (no re-render)", () => {
    useMagicPromptsStore.getState().setSelectedPromptId("git.commit.generate");
    const refBefore = useMagicPromptsStore.getState();
    useMagicPromptsStore.getState().setSelectedPromptId("git.commit.generate");
    const refAfter = useMagicPromptsStore.getState();
    expect(refAfter).toBe(refBefore);
  });
});
