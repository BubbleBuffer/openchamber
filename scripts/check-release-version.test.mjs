import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseVersion } from "./check-release-version.mjs";

const manifestsFor = (version) => ({
  root: { version },
  sessionState: { version },
  web: {
    version,
    dependencies: { "@openchamber/session-state": version },
  },
});

test("accepts a matching SemVer across all publishable manifests", () => {
  assert.doesNotThrow(() => validateReleaseVersion("1.9.11", manifestsFor("1.9.11")));
  assert.doesNotThrow(() =>
    validateReleaseVersion("2.0.0-rc.1", manifestsFor("2.0.0-rc.1")),
  );
});

test("rejects invalid or mismatched release versions", () => {
  assert.throws(
    () => validateReleaseVersion("1.9.11; echo unsafe", manifestsFor("1.9.11")),
    /not valid SemVer/,
  );

  const mismatched = manifestsFor("1.9.11");
  mismatched.web.dependencies["@openchamber/session-state"] = "1.9.10";
  assert.throws(
    () => validateReleaseVersion("1.9.11", mismatched),
    /webSessionStateDependency/,
  );
});
