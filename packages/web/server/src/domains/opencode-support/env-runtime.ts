/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EnvRuntimeDeps, OpenCodeEnvRuntime } from "./types.js";

export async function createOpenCodeEnvRuntime(deps: EnvRuntimeDeps): Promise<OpenCodeEnvRuntime> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // @ts-expect-error - lib/ path resolution in TS
  const mod = await import("../../../lib/opencode/env/env-runtime.js") as any;
  return mod.createOpenCodeEnvRuntime(deps) as OpenCodeEnvRuntime;
}