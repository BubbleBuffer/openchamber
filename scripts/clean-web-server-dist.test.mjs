import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveServerDist } from "./clean-web-server-dist.mjs";

test("server build cleanup resolves only the compiled server directory", () => {
  const target = resolveServerDist();

  assert.equal(
    target.endsWith(path.join("packages", "web", "server", "dist")),
    true,
  );
});
