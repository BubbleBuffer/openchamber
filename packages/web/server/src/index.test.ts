import { describe, expect, it, vi } from "vitest";

import { runZenModelValidationAtStartup } from "./index.js";

describe("Zen startup validation seam", () => {
  it("does not invoke the external validator for the explicit browser-test opt-out", () => {
    const validate = vi.fn(async () => undefined);

    expect(runZenModelValidationAtStartup({ OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION: "true" }, validate)).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  });

  it("keeps validation enabled by default", async () => {
    const validate = vi.fn(async () => undefined);

    expect(runZenModelValidationAtStartup({}, validate)).toBe(true);
    await Promise.resolve();
    expect(validate).toHaveBeenCalledOnce();
  });
});
