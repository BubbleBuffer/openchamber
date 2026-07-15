import type { ServerConfig, StartWebUiServerOptions } from "../shared/types.js";
import {
  resolveBindHost,
  resolveOpenChamberDataDir,
  resolvePort,
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
    openchamberVersion: readOpenChamberVersion(),
  };
}
