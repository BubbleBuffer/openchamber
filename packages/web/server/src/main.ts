import { startWebUiServer } from "./index.js";
import { resolvePort, resolveBindHost, readOpenChamberVersion } from "./runtime/env.js";

const args = process.argv.slice(2);
let requestedPort: number | undefined;
let requestedHost: string | undefined;
let tunnelMode: string | undefined;
let tunnelProvider: string | undefined;
let uiPassword: string | null = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--port" && i + 1 < args.length) { requestedPort = parseInt(args[++i]!, 10); }
  else if (arg === "--host" && i + 1 < args.length) { requestedHost = args[++i]; }
  else if (arg === "--tunnel-mode" && i + 1 < args.length) { tunnelMode = args[++i]; }
  else if (arg === "--tunnel-provider" && i + 1 < args.length) { tunnelProvider = args[++i]; }
  else if (arg === "--ui-password" && i + 1 < args.length) { uiPassword = args[++i]; }
  else if (arg === "--help" || arg === "-h") {
    console.log("openchamber-server [options]");
    console.log("  --port <number>        Port to listen on (default: 3000)");
    console.log("  --host <string>        Host to bind to (default: 127.0.0.1)");
    console.log("  --tunnel-mode <mode>   Tunnel mode");
    console.log("  --tunnel-provider <p>  Tunnel provider");
    console.log("  --ui-password <pw>     UI password");
    console.log("  --help, -h             Show this help");
    console.log("  --version, -v          Show version");
    process.exit(0);
  }
  else if (arg === "--version" || arg === "-v") {
    console.log(`openchamber-server ${readOpenChamberVersion()}`);
    process.exit(0);
  }
}

startWebUiServer({
  port: requestedPort || resolvePort(),
  host: requestedHost || resolveBindHost(),
  attachSignals: true,
  exitOnShutdown: true,
  uiPassword,
  tunnelMode,
  tunnelProvider,
}).catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});