import "happy-dom";
import { ensureDom } from "./utils/setupDom";
ensureDom();

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const { useFileStore } = await import("./fileStore");

describe("fileStore (string-based APIs only)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useFileStore.setState({ attachedFiles: [] }, false);
  });

  afterEach(() => {
    // best-effort fetch restoration
  });

  it("removeAttachedFile filters by id", () => {
    useFileStore.setState({
      attachedFiles: [
        {
          id: "a",
          file: null as never,
          dataUrl: "",
          mimeType: "image/png",
          filename: "a.png",
          size: 1,
          source: "server",
        },
        {
          id: "b",
          file: null as never,
          dataUrl: "",
          mimeType: "image/png",
          filename: "b.png",
          size: 1,
          source: "server",
        },
      ],
    });
    useFileStore.getState().removeAttachedFile("a");
    const remaining = useFileStore.getState().attachedFiles;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe("b");
  });

  it("clearAttachedFiles empties the array", () => {
    useFileStore.setState({
      attachedFiles: [
        {
          id: "x",
          file: null as never,
          dataUrl: "",
          mimeType: "image/png",
          filename: "x.png",
          size: 1,
          source: "server",
        },
      ],
    });
    useFileStore.getState().clearAttachedFiles();
    expect(useFileStore.getState().attachedFiles).toEqual([]);
  });

  it("addServerFile dedupes by serverPath", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => "stub-content",
    })) as never;

    try {
      await useFileStore.getState().addServerFile("/repo/foo.ts", "foo.ts");
      const files = useFileStore.getState().attachedFiles;
      expect(files).toHaveLength(1);
      expect(files[0]?.filename).toBe("foo.ts");
      expect(files[0]?.source).toBe("server");
      expect(files[0]?.serverPath).toBe("/repo/foo.ts");

      // Second add with same serverPath is a no-op.
      await useFileStore.getState().addServerFile("/repo/foo.ts", "foo.ts");
      expect(useFileStore.getState().attachedFiles).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
