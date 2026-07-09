import "happy-dom";
import { ensureDom } from "./utils/setupDom";
ensureDom();

import { describe, it, expect, beforeEach } from "bun:test";

const { useInlineCommentDraftStore } = await import("./useInlineCommentDraftStore");
import type { InlineCommentDraft } from "./useInlineCommentDraftStore";

const makeDraft = (
  overrides: Partial<Omit<InlineCommentDraft, "id" | "createdAt">> = {},
): Omit<InlineCommentDraft, "id" | "createdAt"> => ({
  sessionKey: "sess-1",
  source: "diff",
  fileLabel: "foo.ts",
  startLine: 1,
  endLine: 2,
  code: "code",
  language: "ts",
  text: "comment text",
  ...overrides,
});

describe("useInlineCommentDraftStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useInlineCommentDraftStore.setState({ drafts: {} }, false);
  });

  it("addDraft stores a draft under sessionKey with generated id + createdAt", () => {
    useInlineCommentDraftStore.getState().addDraft(makeDraft());
    const drafts = useInlineCommentDraftStore.getState().getDrafts("sess-1");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.sessionKey).toBe("sess-1");
    expect(drafts[0]?.source).toBe("diff");
    expect(typeof drafts[0]?.id).toBe("string");
    expect(typeof drafts[0]?.createdAt).toBe("number");
  });

  it("consumeDrafts returns sorted-by-createdAt and clears the session", async () => {
    const { addDraft, consumeDrafts } = useInlineCommentDraftStore.getState();
    addDraft(makeDraft({ text: "first" }));
    await new Promise((r) => setTimeout(r, 2));
    addDraft(makeDraft({ text: "second" }));
    const consumed = consumeDrafts("sess-1");
    expect(consumed).toHaveLength(2);
    expect(consumed[0]?.text).toBe("first");
    expect(consumed[1]?.text).toBe("second");
    expect(useInlineCommentDraftStore.getState().getDrafts("sess-1")).toEqual([]);
  });

  it("clearDrafts removes the sessionKey entirely", () => {
    useInlineCommentDraftStore.getState().addDraft(makeDraft());
    expect(useInlineCommentDraftStore.getState().hasDrafts("sess-1")).toBe(true);
    useInlineCommentDraftStore.getState().clearDrafts("sess-1");
    expect(useInlineCommentDraftStore.getState().hasDrafts("sess-1")).toBe(false);
  });

  it("updateDraft mutates a draft in place by id", () => {
    const { addDraft, updateDraft, getDrafts } =
      useInlineCommentDraftStore.getState();
    addDraft(makeDraft({ text: "original" }));
    const id = getDrafts("sess-1")[0]!.id;
    updateDraft("sess-1", id, { text: "updated" });
    expect(getDrafts("sess-1")[0]?.text).toBe("updated");
    expect(getDrafts("sess-1")[0]?.source).toBe("diff");
    expect(getDrafts("sess-1")[0]?.id).toBe(id);
  });

  it("removeDraft drops the matching draft and removes the sessionKey when last", () => {
    const { addDraft, removeDraft, hasDrafts } =
      useInlineCommentDraftStore.getState();
    addDraft(makeDraft());
    const id = useInlineCommentDraftStore.getState().getDrafts("sess-1")[0]!.id;
    removeDraft("sess-1", id);
    expect(hasDrafts("sess-1")).toBe(false);
    expect(useInlineCommentDraftStore.getState().drafts["sess-1"]).toBeUndefined();
  });

  it("getDraftCount returns the count for a sessionKey", () => {
    const { addDraft } = useInlineCommentDraftStore.getState();
    addDraft(makeDraft());
    addDraft(makeDraft());
    expect(useInlineCommentDraftStore.getState().getDraftCount("sess-1")).toBe(2);
    expect(useInlineCommentDraftStore.getState().getDraftCount("nope")).toBe(0);
  });
});
