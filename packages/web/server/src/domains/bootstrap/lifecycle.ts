import type { LifecycleDeps, OpenCodeLifecycleRuntime } from "./types.js";

import { createOpenCodeLifecycleRuntime as createLifecycleImpl } from "../opencode/lifecycle.js";

export async function createOpenCodeLifecycleRuntime(deps: LifecycleDeps): Promise<OpenCodeLifecycleRuntime> {
  return createLifecycleImpl(deps) as OpenCodeLifecycleRuntime;
}