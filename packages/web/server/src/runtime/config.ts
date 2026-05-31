import type { ServerConfig, StartWebUiServerOptions } from "../shared/types.js";
import {
  resolveBindHost,
  resolveOpenChamberDataDir,
  resolvePort,
  isDesktopNotifyEnabled,
  readOpenChamberVersion,
} from "./env.js";
import path from "node:path";

export function buildServerConfig(options: StartWebUiServerOptions = {}): ServerConfig {
  const port = resolvePort(options.port);
  const host = resolveBindHost(options.host);
  const openchamberDataDir = resolveOpenChamberDataDir();

  return {
    port,
    host,
    uiPassword: options.uiPassword ?? null,
    attachSignals: options.attachSignals ?? true,
    exitOnShutdown: options.exitOnShutdown ?? false,
    openchamberDataDir,
    settingsFilePath: path.join(openchamberDataDir, "settings.json"),
    pushSubscriptionsFilePath: path.join(openchamberDataDir, "push-subscriptions.json"),
    tunnelConfigPath: options.tunnelConfigPath ?? null,
    runtimeManagedRemoteTunnelHostname: options.tunnelHostname ?? null,
    runtimeManagedRemoteTunnelToken: options.tunnelToken ?? null,
    tryCfTunnel: options.tryCfTunnel ?? false,
    tunnelMode: options.tunnelMode ?? null,
    tunnelProvider: options.tunnelProvider ?? null,
    tunnelToken: options.tunnelToken ?? null,
    tunnelHostname: options.tunnelHostname ?? null,
    onTunnelReady: options.onTunnelReady ?? null,
    onDesktopNotification: options.onDesktopNotification ?? null,
    openchamberVersion: readOpenChamberVersion(),
    isDesktopNotifyEnabled: isDesktopNotifyEnabled(),
  };
}