import { describe, expect, it } from "vitest";

import { createProjectIdFromPath } from "./project-id.js";

describe("createProjectIdFromPath", () => {
  it("normalizes trailing separators and Windows separators consistently", () => {
    expect(createProjectIdFromPath("/workspace/project/"))
      .toBe(createProjectIdFromPath("\\workspace\\project\\"));
  });

  it("keeps distinct paths distinct", () => {
    expect(createProjectIdFromPath("/workspace/project-a"))
      .not.toBe(createProjectIdFromPath("/workspace/project-b"));
  });

  it("returns an empty ID for blank input", () => {
    expect(createProjectIdFromPath("   ")).toBe("");
  });
});
