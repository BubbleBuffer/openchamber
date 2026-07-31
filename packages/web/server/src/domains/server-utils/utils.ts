/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerOpenCodeProxy } from "./proxy.js";
import type { ServerUtilsRuntime, ServerUtilsRuntimeDeps } from "./types.js";

export function createServerUtilsRuntime(
  deps: ServerUtilsRuntimeDeps,
): ServerUtilsRuntime {
  const {
    fs,
    os,
    path,
    process: proc,
    openCodeReadyGraceMs,
    getOpenCodeRuntime,
    getLoginShellPath,
  } = deps;

  const pathLooksUserConfigured = (value: string): boolean => {
    if (typeof value !== "string" || !value) {
      return false;
    }

    const home = os.homedir();
    return value.split(path.delimiter).some((segment) => (
      segment.startsWith(home + path.sep)
      || segment === home
      || segment.startsWith("/opt/homebrew/")
      || segment.startsWith("/opt/pkg/")
      || segment.startsWith("/opt/pmk/")
    ));
  };

  function setOpenCodePort(port: number): void {
    if (Number.isFinite(port) && port > 0) {
      console.log(`Detected OpenCode port: ${Math.trunc(port)}`);
    }
  }

  async function waitForOpenCodePort(timeoutMs = 15000): Promise<number> {
    const runtime = getOpenCodeRuntime();
    const port = runtime?.getPort() ?? null;
    if (port !== null) {
      return port;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const updatedPort = getOpenCodeRuntime()?.getPort() ?? null;
      if (updatedPort !== null) {
        return updatedPort;
      }
    }

    throw new Error("Timed out waiting for OpenCode port");
  }

  function buildAugmentedPath(): string {
    const currentPath = proc.env.PATH || "";
    const loginShellPath = getLoginShellPath();
    const currentPathLooksUserConfigured = pathLooksUserConfigured(currentPath);
    const primaryPath = currentPathLooksUserConfigured ? currentPath : (loginShellPath || "");
    const fallbackPath = currentPathLooksUserConfigured ? (loginShellPath || "") : currentPath;
    const seen = new Set<string>();
    const augmented: string[] = [];

    const addSegments = (value: string) => {
      if (typeof value !== "string" || !value) {
        return;
      }
      for (const segment of value.split(path.delimiter)) {
        if (segment && !seen.has(segment)) {
          seen.add(segment);
          augmented.push(segment);
        }
      }
    };

    addSegments(primaryPath);
    addSegments(fallbackPath);

    return augmented.join(path.delimiter);
  }

  function buildManagedOpenCodePath(): string {
    const currentPath = proc.env.PATH || "";
    if (pathLooksUserConfigured(currentPath)) {
      return currentPath;
    }

    return getLoginShellPath() || currentPath;
  }

  function parseSseDataPayload(block: string): object | null {
    if (!block || typeof block !== "string") {
      return null;
    }
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^\s/, ""));

    if (dataLines.length === 0) {
      return null;
    }

    const payloadText = dataLines.join("\n").trim();
    if (!payloadText) {
      return null;
    }

    try {
      const parsed = JSON.parse(payloadText);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.payload === "object" &&
        parsed.payload !== null
      ) {
        return parsed.payload;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  const fetchArraySnapshot = async (route: string, invalidMessage: string): Promise<unknown[]> => {
    const runtime = getOpenCodeRuntime();
    if (!runtime?.getPort()) {
      throw new Error("OpenCode port is not available");
    }

    const response = await fetch(runtime.getUrl(route), {
      method: "GET",
      headers: { Accept: "application/json", ...runtime.getAuthHeaders() },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${invalidMessage} (status ${response.status})`);
    }

    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload)) {
      throw new Error(`Invalid ${invalidMessage} payload from OpenCode`);
    }
    return payload;
  };

  const fetchAgentsSnapshot = (): Promise<unknown[]> => fetchArraySnapshot("/agent", "agents snapshot");
  const fetchProvidersSnapshot = (): Promise<unknown[]> => fetchArraySnapshot("/provider", "providers snapshot");
  const fetchModelsSnapshot = (): Promise<unknown[]> => fetchArraySnapshot("/model", "models snapshot");

  function setupProxy(app: any): void {
    registerOpenCodeProxy(app, {
      fs,
      os,
      path,
      OPEN_CODE_READY_GRACE_MS: openCodeReadyGraceMs,
      openCodeRuntime: getOpenCodeRuntime(),
    });
  }

  return {
    setOpenCodePort,
    waitForOpenCodePort,
    buildAugmentedPath,
    buildManagedOpenCodePath,
    parseSseDataPayload,
    fetchAgentsSnapshot,
    fetchProvidersSnapshot,
    fetchModelsSnapshot,
    setupProxy,
  };
}
