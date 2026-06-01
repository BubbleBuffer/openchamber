/* eslint-disable @typescript-eslint/no-explicit-any */
import { createProxyMiddleware } from "http-proxy-middleware";

import {
  applyForwardProxyResponseHeaders,
  collectForwardProxyHeaders,
  shouldForwardProxyResponseHeader,
} from "../../../proxy-headers.js";

export const waitForSseDrain = (res: any, signal?: AbortSignal): Promise<void> => new Promise((resolve) => {
  if (signal?.aborted || res.writableEnded || res.destroyed) {
    resolve();
    return;
  }

  const cleanup = () => {
    res.off?.("drain", onDone);
    res.off?.("close", onDone);
    res.off?.("error", onDone);
    signal?.removeEventListener?.("abort", onDone);
  };
  const onDone = () => {
    cleanup();
    resolve();
  };

  res.once?.("drain", onDone);
  res.once?.("close", onDone);
  res.once?.("error", onDone);
  signal?.addEventListener?.("abort", onDone, { once: true });
});

export const writeSseChunkWithBackpressure = async (
  res: any,
  value: Uint8Array,
  signal?: AbortSignal,
): Promise<boolean> => {
  if (!value || value.length === 0 || signal?.aborted || res.writableEnded || res.destroyed) {
    return false;
  }

  const flushed = res.write(value);
  if (flushed !== false) {
    return true;
  }

  await waitForSseDrain(res, signal);
  return !signal?.aborted && !res.writableEnded && !res.destroyed;
};

export const registerOpenCodeProxy = (app: any, deps: {
  fs: typeof import("fs");
  os: typeof import("os");
  path: typeof import("path");
  OPEN_CODE_READY_GRACE_MS: number;
  openCodeRuntime: any;
}): void => {
  const {
    fs,
    os,
    path,
    OPEN_CODE_READY_GRACE_MS,
    openCodeRuntime,
  } = deps;

  if (app.get("opencodeProxyConfigured")) {
    return;
  }

  const port = openCodeRuntime.getPort();
  if (port) {
    console.log(`Setting up proxy to OpenCode on port ${port}`);
  } else {
    console.log("Setting up OpenCode API gate (OpenCode not started yet)");
  }
  app.set("opencodeProxyConfigured", true);

  const isAbortError = (error: unknown): boolean => (error as any)?.name === "AbortError";
  const FALLBACK_PROXY_TARGET = "http://127.0.0.1:3902";

  const normalizeProxyTarget = (candidate: unknown): string | null => {
    if (typeof candidate !== "string") {
      return null;
    }

    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.replace(/\/+$/, "");
  };

  const resolveProxyTarget = (): string => {
    try {
      const resolved = normalizeProxyTarget(openCodeRuntime.getUrl("/", ""));
      if (resolved) {
        return resolved;
      }
    } catch {
    }

    const externalBase = normalizeProxyTarget(openCodeRuntime.getBaseUrl());
    if (externalBase) {
      return externalBase;
    }

    const currentPort = openCodeRuntime.getPort();
    if (currentPort) {
      return `http://localhost:${currentPort}`;
    }

    return FALLBACK_PROXY_TARGET;
  };

  const forwardSseRequest = async (req: any, res: any): Promise<void> => {
    const abortController = new AbortController();
    const closeUpstream = () => abortController.abort();
    let upstream: Response | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
    const startKeepalive = () => {
      if (keepaliveInterval) return;
      keepaliveInterval = setInterval(() => {
        if (!res.writableEnded) {
          try { res.write(": keepalive\n\n"); } catch {}
        }
      }, 15_000);
    };
    const stopKeepalive = () => {
      if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
    };

    req.on("close", closeUpstream);

    try {
      const requestUrl = typeof req.originalUrl === "string" && req.originalUrl.length > 0
        ? req.originalUrl
        : (typeof req.url === "string" ? req.url : "");
      const upstreamPath = requestUrl.startsWith("/api") ? requestUrl.slice(4) || "/" : requestUrl;
      const headers = collectForwardProxyHeaders(req.headers, openCodeRuntime.getAuthHeaders());
      headers.accept ??= "text/event-stream";
      headers["cache-control"] ??= "no-cache";

      upstream = await fetch(openCodeRuntime.getUrl(upstreamPath, ""), {
        method: "GET",
        headers,
        signal: abortController.signal,
      });

      res.status(upstream.status);
      applyForwardProxyResponseHeaders(upstream.headers, res);

      const contentType = upstream.headers.get("content-type") || "text/event-stream";
      const isEventStream = contentType.toLowerCase().includes("text/event-stream");

      if (!upstream.body) {
        res.end(await upstream.text().catch(() => ""));
        return;
      }

      if (!isEventStream) {
        res.end(await upstream.text());
        return;
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      if (res.socket && typeof res.socket.setNoDelay === "function") {
        res.socket.setNoDelay(true);
      }

      startKeepalive();
      reader = upstream.body.getReader();
      while (!abortController.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value && value.length > 0) {
          const canContinue = await writeSseChunkWithBackpressure(res, value, abortController.signal);
          if (!canContinue) {
            break;
          }
        }
      }

      res.end();
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      console.error("[proxy] OpenCode SSE proxy error:", (error as Error)?.message ?? error);
      if (!res.headersSent) {
        res.status(503).json({ error: "OpenCode service unavailable" });
      } else {
        res.end();
      }
    } finally {
      stopKeepalive();
      req.off("close", closeUpstream);
      try {
        if (reader) {
          await reader.cancel();
          reader.releaseLock();
        } else if (upstream?.body && !(upstream.body as any).locked) {
          await (upstream.body as any).cancel();
        }
      } catch {
      }
    }
  };

  app.use("/api", (_req: any, _res: any, next: () => void) => {
    next();
  });

  app.use("/api", (req: any, res: any, next: () => void) => {
    if (
      req.path.startsWith("/themes/custom") ||
      req.path.startsWith("/push") ||
      req.path.startsWith("/config/agents") ||
      req.path.startsWith("/config/opencode-resolution") ||
      req.path.startsWith("/config/settings") ||
      req.path.startsWith("/config/skills") ||
      req.path === "/config/reload" ||
      req.path === "/health"
    ) {
      return next();
    }

    const notReadySince = openCodeRuntime.getNotReadySince();
    const waitElapsed = notReadySince === 0 ? 0 : Date.now() - notReadySince;
    const stillWaiting =
      (!openCodeRuntime.isReady() && (notReadySince === 0 || waitElapsed < OPEN_CODE_READY_GRACE_MS)) ||
      openCodeRuntime.isRestarting() ||
      !openCodeRuntime.getPort();

    if (stillWaiting) {
      return res.status(503).json({
        error: "OpenCode is restarting",
        restarting: true,
      });
    }

    next();
  });

  if (process.platform === "win32") {
    app.get("/api/session", async (req: any, res: any, next: () => void) => {
      const rawUrl = req.originalUrl || req.url || "";
      if (rawUrl.includes("directory=")) return next();

      try {
        const authHeaders = openCodeRuntime.getAuthHeaders();
        const fetchOpts = {
          method: "GET",
          headers: { Accept: "application/json", ...authHeaders },
          signal: AbortSignal.timeout(10000),
        };
        const globalRes = await fetch(openCodeRuntime.getUrl("/session", ""), fetchOpts);
        const globalPayload = globalRes.ok ? await globalRes.json().catch(() => []) : [];
        const globalSessions = Array.isArray(globalPayload) ? globalPayload : [];

        const settingsPath = path.join(os.homedir(), ".config", "openchamber", "settings.json");
        let projectDirs: string[] = [];
        try {
          const settingsRaw = fs.readFileSync(settingsPath, "utf8");
          const settings = JSON.parse(settingsRaw);
          projectDirs = (settings.projects || [])
            .map((project: any) => (typeof project?.path === "string" ? project.path.trim() : ""))
            .filter(Boolean);
        } catch {
        }

        const seen = new Set(
          globalSessions
            .map((session: any) => (session && typeof session.id === "string" ? session.id : null))
            .filter((id: unknown) => typeof id === "string")
        );
        const extraSessions: any[] = [];
        for (const dir of projectDirs) {
          const candidates = Array.from(new Set([
            dir,
            dir.replace(/\\/g, "/"),
            dir.replace(/\//g, "\\"),
          ]));
          for (const candidateDir of candidates) {
            const encoded = encodeURIComponent(candidateDir);
            try {
              const dirRes = await fetch(openCodeRuntime.getUrl(`/session?directory=${encoded}`, ""), fetchOpts);
              if (dirRes.ok) {
                const dirPayload = await dirRes.json().catch(() => []);
                const dirSessions = Array.isArray(dirPayload) ? dirPayload : [];
                for (const session of dirSessions) {
                  const id = session && typeof session.id === "string" ? session.id : null;
                  if (id && !seen.has(id)) {
                    seen.add(id);
                    extraSessions.push(session);
                  }
                }
              }
            } catch {
            }
          }
        }

        const merged = [...globalSessions, ...extraSessions];
        merged.sort((a: any, b: any) => {
          const aTime = a && typeof a.time_updated === "number" ? a.time_updated : 0;
          const bTime = b && typeof b.time_updated === "number" ? b.time_updated : 0;
          return bTime - aTime;
        });
        console.log(`[SessionMerge] ${globalSessions.length} global + ${extraSessions.length} extra = ${merged.length} total`);
        return res.json(merged);
      } catch (error) {
        console.log(`[SessionMerge] Error: ${(error as Error).message}, falling through`);
        next();
      }
    });
  }

  app.get("/api/global/event", forwardSseRequest);
  app.get("/api/event", forwardSseRequest);

  const apiProxy = createProxyMiddleware({
    target: resolveProxyTarget(),
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
    router: () => resolveProxyTarget(),
    on: {
      proxyReq: (proxyReq: any) => {
        const authHeaders = openCodeRuntime.getAuthHeaders();
        if (authHeaders.Authorization) {
          proxyReq.setHeader("Authorization", authHeaders.Authorization);
        }

        proxyReq.setHeader("accept-encoding", "identity");
      },
      proxyRes: (proxyRes: any) => {
        for (const key of Object.keys(proxyRes.headers || {})) {
          if (!shouldForwardProxyResponseHeader(key)) {
            delete proxyRes.headers[key];
          }
        }
      },
      error: (err: Error, _req: any, res: any) => {
        console.error("[proxy] OpenCode proxy error:", err.message);
        if (res && !res.headersSent && typeof res.status === "function") {
          res.status(503).json({ error: "OpenCode service unavailable" });
        }
      },
    },
  });

  app.use("/api", apiProxy);
};