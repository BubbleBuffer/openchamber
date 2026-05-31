import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function readOpenChamberVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return (pkg && typeof pkg.version === "string" && pkg.version.trim()) || "unknown";
  } catch {
    return "unknown";
  }
}

export function resolveOpenChamberDataDir(): string {
  const env = process.env.OPENCHAMBER_DATA_DIR;
  if (env) return env;
  const platform = os.platform();
  const home = os.homedir();
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "OpenChamber");
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "OpenChamber");
  }
  const xdg = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return path.join(xdg, "openchamber");
}

export function resolveBindHost(host?: string): string {
  if (host) return host;
  return process.env.OPENCHAMBER_HOST || "127.0.0.1";
}

export function resolvePort(raw?: number | string): number {
  if (raw !== undefined && raw !== null) {
    const num = typeof raw === "string" ? parseInt(raw, 10) : raw;
    if (!Number.isNaN(num) && num > 0 && num < 65536) return num;
  }
  const env = process.env.OPENCHAMBER_PORT || process.env.OPENCODE_PORT || process.env.PORT;
  if (env) {
    const num = parseInt(env, 10);
    if (!Number.isNaN(num) && num > 0 && num < 65536) return num;
  }
  return 3000;
}

export function isDesktopNotifyEnabled(): boolean {
  return (
    process.env.OPENCHAMBER_DESKTOP_NOTIFY === "true" ||
    process.env.OPENCHAMBER_RUNTIME === "desktop" ||
    /openchamber-server/i.test(process.argv0 ?? "") ||
    /openchamber-server/i.test(process.argv[1] ?? "")
  );
}

export function getRuntimeName(): string {
  return typeof (globalThis as Record<string, unknown>).Bun !== "undefined" ? "bun" : "node";
}