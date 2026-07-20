import { describe, expect, it } from "vitest";
import { decodeModelsDevMetadata } from "./useProviderConfigStore";
import { parseProviderSourceResponse } from "@contracts/opencode";

describe("provider model metadata decoder", () => {
  it("returns no metadata for malformed contract payloads", () => {
    expect(decodeModelsDevMetadata({ zen: { models: "not-a-record" } }).size).toBe(0);
  });

  it("keeps valid provider metadata behavior", () => {
    const metadata = decodeModelsDevMetadata({ zen: { id: "zen", models: { "big-pickle": { name: "Big Pickle" } } } });
    expect(metadata.get("zen/big-pickle")?.name).toBe("Big Pickle");
  });

  it("rejects malformed OpenChamber provider source successes", () => {
    expect(parseProviderSourceResponse({ providerId: "zen", sources: { auth: { exists: true } } }).ok).toBe(false);
  });
});
