import type { CliEntryDeps } from "./types.js";

export function runCliEntryIfMain(deps: CliEntryDeps): void {
  const { process: proc, currentFilename, parseServeCliOptions, defaultPort, cloudflareProvider, managedLocalMode, setExitOnShutdown, startServer } = deps;

  const isCliExecution = proc.argv[1] === currentFilename;
  if (!isCliExecution) {
    return;
  }

  const cliOptions = parseServeCliOptions({
    argv: proc.argv.slice(2),
    env: proc.env as Record<string, string | undefined>,
    defaultPort,
    cloudflareProvider,
    managedLocalMode,
  });

  setExitOnShutdown(true);
  startServer({
    port: cliOptions.port,
    host: cliOptions.host,
    tryCfTunnel: cliOptions.tryCfTunnel,
    tunnelProvider: cliOptions.tunnelProvider,
    tunnelMode: cliOptions.tunnelMode,
    tunnelConfigPath: cliOptions.tunnelConfigPath,
    tunnelToken: cliOptions.tunnelToken,
    tunnelHostname: cliOptions.tunnelHostname,
    attachSignals: true,
    exitOnShutdown: true,
    uiPassword: cliOptions.uiPassword,
  }).catch((error: unknown) => {
    console.error("Failed to start server:", error);
    proc.exit(1);
  });
}