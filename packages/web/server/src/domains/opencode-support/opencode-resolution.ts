/* eslint-disable @typescript-eslint/no-explicit-any */
import type { OpenCodeResolutionDeps, OpenCodeResolutionRuntime } from "./types.js";

export function createOpenCodeResolutionRuntime(deps: OpenCodeResolutionDeps): OpenCodeResolutionRuntime {
  const {
    path,
    resolveOpencodeCliPath,
    applyOpencodeBinaryFromSettings,
    ensureOpencodeCliEnv,
    resolveManagedOpenCodeLaunchSpec,
    getResolvedState,
    setResolvedOpencodeBinarySource,
  } = deps;

  const getOpenCodeResolutionSnapshot = async (settings: object): Promise<object> => {
    const configured = typeof (settings as any)?.opencodeBinary === "string" ? (settings as any).opencodeBinary : null;

    const { resolvedOpencodeBinarySource: previousSource } = getResolvedState();
    const detectedNow = resolveOpencodeCliPath();
    const { resolvedOpencodeBinarySource: rawDetectedSourceNow } = getResolvedState();
    if (previousSource) {
      setResolvedOpencodeBinarySource(previousSource);
    }

    await applyOpencodeBinaryFromSettings();
    ensureOpencodeCliEnv();

    const {
      resolvedOpencodeBinary,
      resolvedOpencodeBinarySource,
      useWslForOpencode,
      resolvedWslBinary,
      resolvedWslOpencodePath,
      resolvedWslDistro,
      resolvedNodeBinary,
      resolvedBunBinary,
    } = getResolvedState();

    const resolved = resolvedOpencodeBinary || null;
    const source = resolvedOpencodeBinarySource || null;
    const detectedSourceNow =
      detectedNow &&
      resolved &&
      detectedNow === resolved &&
      rawDetectedSourceNow === "env" &&
      source &&
      source !== "env"
        ? source
        : rawDetectedSourceNow;
    const launchSpec = resolved && !useWslForOpencode
      ? resolveManagedOpenCodeLaunchSpec(resolved)
      : null;

    return {
      configured,
      resolved,
      resolvedDir: resolved ? path.dirname(resolved) : null,
      source,
      detectedNow,
      detectedSourceNow,
      launchBinary: (launchSpec as any)?.binary || null,
      launchArgs: (launchSpec as any)?.args || [],
      launchWrapperType: (launchSpec as any)?.wrapperType || null,
      viaWsl: useWslForOpencode,
      wslBinary: resolvedWslBinary || null,
      wslPath: resolvedWslOpencodePath || null,
      wslDistro: resolvedWslDistro || null,
      node: resolvedNodeBinary || null,
      bun: resolvedBunBinary || null,
    };
  };

  return {
    getOpenCodeResolutionSnapshot,
  };
}