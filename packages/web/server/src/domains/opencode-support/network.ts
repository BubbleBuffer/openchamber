/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NetworkRuntimeDeps, OpenCodeNetworkRuntime } from "./types.js";

export async function createOpenCodeNetworkRuntime(deps: NetworkRuntimeDeps): Promise<OpenCodeNetworkRuntime> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // @ts-expect-error - lib/ path resolution in TS
  const mod = await import("../../../lib/opencode/network.js") as any;
  return mod.createOpenCodeNetworkRuntime(deps) as OpenCodeNetworkRuntime;
}