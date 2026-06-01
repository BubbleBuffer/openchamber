/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuthStateRuntimeDeps, OpenCodeAuthStateRuntime } from "./types.js";

export async function createOpenCodeAuthStateRuntime(deps: AuthStateRuntimeDeps): Promise<OpenCodeAuthStateRuntime> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // @ts-expect-error - lib/ path resolution in TS
  const mod = await import("../../../lib/opencode/auth.js") as any;
  return mod.createOpenCodeAuthStateRuntime(deps) as OpenCodeAuthStateRuntime;
}