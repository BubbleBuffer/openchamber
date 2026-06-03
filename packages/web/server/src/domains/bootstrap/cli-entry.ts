import type { CliEntryDeps } from "./types.js";

export function runCliEntryIfMain(deps: CliEntryDeps): void {
  const { process: proc, currentFilename, parseServeCliOptions, defaultPort, setExitOnShutdown, startServer } = deps;

  const isCliExecution = proc.argv[1] === currentFilename;
  if (!isCliExecution) {
    return;
  }

  const cliOptions = parseServeCliOptions({
    argv: proc.argv.slice(2),
    env: proc.env as Record<string, string | undefined>,
    defaultPort,
  });

  setExitOnShutdown(true);
  startServer({
    port: cliOptions.port,
    host: cliOptions.host,
    attachSignals: true,
    exitOnShutdown: true,
    uiPassword: cliOptions.uiPassword,
  }).catch((error: unknown) => {
    console.error("Failed to start server:", error);
    proc.exit(1);
  });
}
