import { describe, it, expect, beforeEach } from "bun:test";
import { useChatRenderingStore } from "./useChatRenderingStore";

// ---------------------------------------------------------------------------
// Defaults — mirror the shape declared in useChatRenderingStore
// ---------------------------------------------------------------------------
const DEFAULTS = {
  showReasoningTraces: true,
  chatRenderMode: "live" as const,
  activityRenderMode: "summary" as const,
  showDeletionDialog: true,
  showToolFileIcons: true,
  showExpandedBashTools: false,
  showExpandedEditTools: false,
  mermaidRenderingMode: "svg" as const,
  userMessageRenderingMode: "markdown" as const,
  stickyUserHeader: true,
};

// ---------------------------------------------------------------------------
// Reset helper — replaces setState without notifying subscribers
// ---------------------------------------------------------------------------
function resetStore(): void {
  useChatRenderingStore.setState({ ...DEFAULTS }, false);
}

// ===========================================================================
// Store tests
// ===========================================================================
describe("useChatRenderingStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("sets showReasoningTraces", () => {
    useChatRenderingStore.getState().setShowReasoningTraces(false);
    expect(useChatRenderingStore.getState().showReasoningTraces).toBe(false);
  });

  it("sets chatRenderMode", () => {
    useChatRenderingStore.getState().setChatRenderMode("sorted");
    expect(useChatRenderingStore.getState().chatRenderMode).toBe("sorted");
  });

  it("sets activityRenderMode", () => {
    useChatRenderingStore.getState().setActivityRenderMode("collapsed");
    expect(useChatRenderingStore.getState().activityRenderMode).toBe("collapsed");
  });

  it("sets showDeletionDialog", () => {
    useChatRenderingStore.getState().setShowDeletionDialog(false);
    expect(useChatRenderingStore.getState().showDeletionDialog).toBe(false);
  });

  it("sets showToolFileIcons", () => {
    useChatRenderingStore.getState().setShowToolFileIcons(false);
    expect(useChatRenderingStore.getState().showToolFileIcons).toBe(false);
  });

  it("sets showExpandedBashTools", () => {
    useChatRenderingStore.getState().setShowExpandedBashTools(true);
    expect(useChatRenderingStore.getState().showExpandedBashTools).toBe(true);
  });

  it("sets showExpandedEditTools", () => {
    useChatRenderingStore.getState().setShowExpandedEditTools(true);
    expect(useChatRenderingStore.getState().showExpandedEditTools).toBe(true);
  });

  it("sets mermaidRenderingMode", () => {
    useChatRenderingStore.getState().setMermaidRenderingMode("ascii");
    expect(useChatRenderingStore.getState().mermaidRenderingMode).toBe("ascii");
  });

  it("sets userMessageRenderingMode", () => {
    useChatRenderingStore.getState().setUserMessageRenderingMode("plain");
    expect(useChatRenderingStore.getState().userMessageRenderingMode).toBe("plain");
  });

  it("sets stickyUserHeader", () => {
    useChatRenderingStore.getState().setStickyUserHeader(false);
    expect(useChatRenderingStore.getState().stickyUserHeader).toBe(false);
  });
});
