import { describe, expect, it } from "vitest";
import {
  parseFileListResponse,
  parseFsWriteRequest,
  parseStatResponse,
} from "./files.js";

describe("files contract", () => {
  it("accepts owned file responses and rejects malformed successful payloads", () => {
    expect(parseFileListResponse({ directory: "/work", entries: [{ name: "a.ts", path: "/work/a.ts", isDirectory: false }] })).toEqual({
      ok: true,
      value: { directory: "/work", entries: [{ name: "a.ts", path: "/work/a.ts", isDirectory: false }] },
    });
    expect(parseFileListResponse({ directory: "/work", entries: [{}] }).ok).toBe(false);
    expect(parseStatResponse({ path: "/work/a.ts", isFile: true, size: "1" }).ok).toBe(false);
  });

  it("rejects missing, wrong, and array write bodies", () => {
    expect(parseFsWriteRequest({ path: "/work/a.ts", content: "ok" }).ok).toBe(true);
    expect(parseFsWriteRequest({ content: "ok" }).ok).toBe(false);
    expect(parseFsWriteRequest({ path: "/work/a.ts", content: 1 }).ok).toBe(false);
    expect(parseFsWriteRequest([]).ok).toBe(false);
  });
});
