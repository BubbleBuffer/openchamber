import type { StartWebUiServerOptions, WebUiServerController } from "./shared/types.js";
import { buildServerConfig } from "./runtime/config.js";
import { createRuntimeDependencies, createServerRuntime } from "./runtime/dependencies.js";
import { startListening } from "./runtime/server.js";
import { createShutdownHandler } from "./runtime/shutdown.js";

// Legacy module augmentation for the old JS server entry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LegacyModule = any;

let oldRuntime: LegacyModule | null = null;

async function dynamicImport(path: string): Promise<LegacyModule> {
  const module = await import(path);
  return module as LegacyModule;
}

async function getOldRuntime(): Promise<LegacyModule> {
  if (oldRuntime) return oldRuntime;
  oldRuntime = await dynamicImport("../index.js");
  return oldRuntime;
}

export async function startWebUiServer(
  options: StartWebUiServerOptions = {},
): Promise<WebUiServerController> {
  const config = buildServerConfig(options);
  const { lifecycle } = createRuntimeDependencies(config);
  const { httpServer } = createServerRuntime(config, lifecycle);

  let serverInstance: Awaited<ReturnType<typeof startListening>> | null = null;
  let oldController: WebUiServerController | null = null;

  try {
    serverInstance = await startListening(httpServer, config);
  } catch (err) {
    console.error("[server] Failed to start listening:", err);
    throw err;
  }

  try {
    const runtime = await getOldRuntime();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    oldController = await runtime.startWebUiServer({
      port: config.port,
      host: config.host,
      attachSignals: config.attachSignals,
      exitOnShutdown: config.exitOnShutdown,
      uiPassword: config.uiPassword,
      tryCfTunnel: config.tryCfTunnel,
      tunnelMode: config.tunnelMode,
      tunnelProvider: config.tunnelProvider,
      tunnelConfigPath: config.tunnelConfigPath,
      tunnelToken: config.tunnelToken,
      tunnelHostname: config.tunnelHostname,
      onTunnelReady: config.onTunnelReady,
      onDesktopNotification: config.onDesktopNotification,
    });
  } catch (err) {
    console.error("[server] Old runtime bootstrap failed:", err);
    httpServer.close();
    throw err;
  }

  const shutdownHandler = createShutdownHandler({ lifecycle, config, httpServer });

  // Use serverInstance to avoid unused variable warning
  void serverInstance;

  return {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expressApp: oldController!.expressApp,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    httpServer: oldController!.httpServer,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    getPort: oldController!.getPort,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    getOpenCodePort: oldController!.getOpenCodePort,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    getTunnelUrl: oldController!.getTunnelUrl,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    isReady: oldController!.isReady,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    restartOpenCode: oldController!.restartOpenCode,
    stop: async (opts) => { await shutdownHandler.gracefulShutdown(opts); },
  };
}

export async function gracefulShutdown(options?: { exitProcess?: boolean }): Promise<void> {
  const runtime = await getOldRuntime();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return runtime.gracefulShutdown(options);
}

export async function restartOpenCode(): Promise<void> {
  const runtime = await getOldRuntime();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return runtime.restartOpenCode();
}

export async function parseArgs(argv?: string[]): Promise<Record<string, unknown>> {
  const runtime = await getOldRuntime();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return runtime.parseArgs(argv);
}

export type { StartWebUiServerOptions, WebUiServerController };