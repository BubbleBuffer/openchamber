import { describe, expect, it, vi } from "vitest";
import { waitForUpdateApplied } from "./update-dialog-utils";

describe("waitForUpdateApplied", () => {
  it("ignores malformed polling data before accepting a valid completion", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: "false" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: false, currentVersion: "2.0.0" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForUpdateApplied("1.0.0", 2, 0)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
