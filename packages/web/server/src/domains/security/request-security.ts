import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { RequestSecurityDeps, RequestSecurityRuntime } from "./types.js";

export function createRequestSecurityRuntime(deps: RequestSecurityDeps): RequestSecurityRuntime {
  const { readSettingsFromDiskMigrated } = deps;

  const getUiSessionTokenFromRequest = (req: IncomingMessage): string | null => {
    const cookieHeader = req?.headers?.cookie;
    if (!cookieHeader || typeof cookieHeader !== "string") {
      return null;
    }
    const segments = cookieHeader.split(";");
    for (const segment of segments) {
      const [rawName, ...rest] = segment.split("=");
      const name = rawName?.trim();
      if (!name) continue;
      if (name !== "oc_ui_session") continue;
      const value = rest.join("=").trim();
      try {
        return decodeURIComponent(value || "");
      } catch {
        return value || null;
      }
    }
    return null;
  };

  const rejectWebSocketUpgrade = (socket: Socket | null, statusCode: number, reason?: string): void => {
    if (!socket || socket.destroyed) {
      return;
    }

    const message = typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : "Bad Request";
    const body = Buffer.from(message, "utf8");
    const statusTextMap: Record<number, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
    };
    const statusText = statusTextMap[statusCode] || "Bad Request";

    try {
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        `Content-Length: ${body.length}\r\n\r\n`
      );
      socket.write(body);
    } catch {
      /* best-effort */
    }

    try {
      socket.destroy();
    } catch {
      /* best-effort */
    }
  };

  const getRequestOriginCandidates = async (req: IncomingMessage): Promise<Set<string>> => {
    const origins = new Set<string>();
    const forwardedProto = typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"].split(",")[0].trim().toLowerCase()
      : "";
    const protocol = forwardedProto || ((req.socket as { encrypted?: boolean } | null)?.encrypted ? "https" : "http");

    const forwardedHost = typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"].split(",")[0].trim()
      : "";
    const host = forwardedHost || (typeof req.headers.host === "string" ? req.headers.host.trim() : "");

    if (host) {
      origins.add(`${protocol}://${host}`);
      const [hostname, port] = host.split(":");
      const normalizedHost = typeof hostname === "string" ? hostname.toLowerCase() : "";
      const portSuffix = typeof port === "string" && port.length > 0 ? `:${port}` : "";
      if (normalizedHost === "localhost") {
        origins.add(`${protocol}://127.0.0.1${portSuffix}`);
        origins.add(`${protocol}://[::1]${portSuffix}`);
      } else if (normalizedHost === "127.0.0.1" || normalizedHost === "[::1]") {
        origins.add(`${protocol}://localhost${portSuffix}`);
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const settings = (await readSettingsFromDiskMigrated()) as any;
      if (typeof settings?.publicOrigin === "string" && settings.publicOrigin.trim().length > 0) {
        origins.add(new URL(settings.publicOrigin.trim()).origin);
      }
    } catch {
      /* best-effort */
    }

    return origins;
  };

  const isRequestOriginAllowed = async (req: IncomingMessage): Promise<boolean> => {
    const originHeader = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
    if (!originHeader) {
      return false;
    }

    let normalizedOrigin = "";
    try {
      normalizedOrigin = new URL(originHeader).origin;
    } catch {
      return false;
    }

    const allowedOrigins = await getRequestOriginCandidates(req);
    return allowedOrigins.has(normalizedOrigin);
  };

  return {
    getUiSessionTokenFromRequest,
    rejectWebSocketUpgrade,
    isRequestOriginAllowed,
  };
}
