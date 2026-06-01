/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LifecycleDeps, OpenCodeLifecycleRuntime } from "./types.js";

export async function createOpenCodeLifecycleRuntime(deps: LifecycleDeps): Promise<OpenCodeLifecycleRuntime> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("../../../lib/opencode/bootstrap/lifecycle.js") as any;
  return mod.createOpenCodeLifecycleRuntime(deps) as OpenCodeLifecycleRuntime;
}