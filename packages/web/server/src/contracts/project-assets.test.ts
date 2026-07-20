import { describe, expect, it } from "vitest";
import {
  parseProjectIconDiscoverRequest,
  parseProjectIconErrorResponse,
  parseProjectIconMutationResponse,
  parseProjectIconUploadRequest,
} from "./project-assets.js";

describe("project asset contracts", () => {
  it("accepts valid icon requests including optional discovery force", () => {
    expect(parseProjectIconUploadRequest({ dataUrl: "data:image/png;base64,aGVsbG8=" }).ok).toBe(true);
    expect(parseProjectIconDiscoverRequest({}).ok).toBe(true);
    expect(parseProjectIconDiscoverRequest({ force: true }).ok).toBe(true);
  });

  it("rejects null and malformed icon request payloads", () => {
    expect(parseProjectIconUploadRequest(null).ok).toBe(false);
    expect(parseProjectIconUploadRequest({ dataUrl: "not-a-data-url" }).ok).toBe(false);
    expect(parseProjectIconDiscoverRequest({ force: "yes" }).ok).toBe(false);
  });

  it("accepts coded unsupported-media errors", () => {
    expect(parseProjectIconErrorResponse({ error: "Unsupported favicon format", code: "project_assets_unsupported_media" }).ok).toBe(true);
    expect(parseProjectIconErrorResponse({ error: "Unsupported favicon format", code: "unsupported_media" }).ok).toBe(false);
  });

  it("preserves custom-icon discovery skips that have no settings mutation", () => {
    expect(parseProjectIconMutationResponse({ project: { id: "project", path: "/project" }, skipped: true, reason: "custom-icon-present" }).ok).toBe(true);
    expect(parseProjectIconMutationResponse({ project: { id: "project", path: "/project" } }).ok).toBe(false);
  });
});
