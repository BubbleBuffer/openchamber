import { describe, expect, test } from "vitest";

import { createSkillDiscoveryCache } from "./skill-discovery-cache.js";

describe("createSkillDiscoveryCache", () => {
  test("reuses directory-scoped discovery during a request burst", () => {
    let timestamp = 1_000;
    let loads = 0;
    const cache = createSkillDiscoveryCache(
      (directory) => ({ directory, load: ++loads }),
      5_000,
      () => timestamp,
    );

    expect(cache.get("/project")).toEqual({ directory: "/project", load: 1 });
    expect(cache.get("/project")).toEqual({ directory: "/project", load: 1 });
    expect(cache.get("/other")).toEqual({ directory: "/other", load: 2 });

    timestamp += 5_001;
    expect(cache.get("/project")).toEqual({ directory: "/project", load: 3 });
  });

  test("supports targeted and complete invalidation", () => {
    let loads = 0;
    const cache = createSkillDiscoveryCache(
      (directory) => `${directory}:${++loads}`,
      5_000,
      () => 1_000,
    );

    expect(cache.get(null)).toBe("null:1");
    expect(cache.get("/project")).toBe("/project:2");
    cache.clear(null);
    expect(cache.get(null)).toBe("null:3");
    expect(cache.get("/project")).toBe("/project:2");
    cache.clear();
    expect(cache.get("/project")).toBe("/project:4");
  });
});
