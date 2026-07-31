import type { Express, Request, Response, NextFunction } from "express";
import { parseThemesListResponse, themesError } from "../../../contracts/themes.js";
import type { HealthSnapshot } from "../../../shared/types.js";

interface TunnelAuthExchangeResult {
  ok: boolean;
  reason?: string;
  retryAfter?: number;
}

interface TunnelAuthController {
  classifyRequestScope: (req: Request) => string;
  getTunnelSessionFromRequest?: (req: Request) => unknown;
  clearTunnelSessionCookie?: (req: Request, res: Response) => void;
  exchangeBootstrapToken?: (options: {
    req: Request;
    res: Response;
    token: string;
    sessionTtlMs: number;
  }) => TunnelAuthExchangeResult;
  requireTunnelSession?: (req: Request, res: Response, next: NextFunction) => void;
}

interface UiAuthController {
  handleSessionStatus?: (req: Request, res: Response) => Promise<void>;
  handleSessionCreate?: (req: Request, res: Response) => Promise<void>;
  handlePasskeyStatus?: (req: Request, res: Response) => void;
  handlePasskeyAuthenticationOptions?: (req: Request, res: Response) => Promise<void>;
  handlePasskeyAuthenticationVerify?: (req: Request, res: Response) => Promise<void>;
  handlePasskeyRegistrationOptions?: (req: Request, res: Response) => Promise<void>;
  handlePasskeyRegistrationVerify?: (req: Request, res: Response) => Promise<void>;
  handlePasskeyList?: (req: Request, res: Response) => void;
  handlePasskeyRevoke?: (req: Request, res: Response) => void;
  handleResetAuth?: (req: Request, res: Response) => void;
  requireAuth?: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}

interface ServerStatusRoutesDeps {
  process: typeof import("process");
  openchamberVersion: string;
  runtimeName: string;
  serverStartedAt: string;
  gracefulShutdown: (opts?: { exitProcess: boolean }) => Promise<void>;
  getHealthSnapshot: () => HealthSnapshot;
}

interface AuthAndAccessRoutesDeps {
  tunnelAuthController: TunnelAuthController;
  uiAuthController: UiAuthController;
  readSettingsFromDiskMigrated: () => Promise<Record<string, unknown>>;
  normalizeTunnelSessionTtlMs: (value: unknown) => number;
}

interface SettingsUtilityRoutesDeps {
  readCustomThemesFromDisk: () => Promise<object[]>;
  refreshOpenCodeAfterConfigChange: (
    reason: string,
    options?: Record<string, unknown>
  ) => Promise<void>;
  clientReloadDelayMs: number;
}

interface CommonMiddlewareDeps {
  express: typeof import("express");
}

export function registerServerStatusRoutes(
  app: Express,
  dependencies: ServerStatusRoutesDeps
): void {
  const {
    process,
    openchamberVersion,
    runtimeName,
    serverStartedAt,
    gracefulShutdown,
    getHealthSnapshot,
  } = dependencies;

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      ...getHealthSnapshot(),
    });
  });

  app.post("/api/system/shutdown", (_req: Request, res: Response) => {
    res.json({ ok: true });
    gracefulShutdown({ exitProcess: true }).catch((error) => {
      console.error("Shutdown request failed:", (error as Error)?.message || error);
    });
  });

  app.get("/api/system/info", (_req: Request, res: Response) => {
    res.json({
      openchamberVersion,
      runtime: runtimeName,
      pid: process.pid,
      startedAt: serverStartedAt,
    });
  });
}

export function registerAuthAndAccessRoutes(
  app: Express,
  dependencies: AuthAndAccessRoutesDeps
): void {
  const {
    tunnelAuthController,
    uiAuthController,
    readSettingsFromDiskMigrated,
    normalizeTunnelSessionTtlMs,
  } = dependencies;

  app.get("/auth/session", async (req: Request, res: Response) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      const tunnelSession = tunnelAuthController.getTunnelSessionFromRequest!(req);
      if (tunnelSession) {
        res.json({ authenticated: true, scope: "tunnel" });
        return;
      }
      tunnelAuthController.clearTunnelSessionCookie!(req, res);
      res.status(401).json({ authenticated: false, locked: true, tunnelLocked: true });
      return;
    }

    try {
      await uiAuthController.handleSessionStatus!(req, res);
    } catch (error) {
      console.error("[UiAuth] Failed to read session status", error);
      res.status(500).json({ error: "Internal server error", code: "internal_error" });
    }
  });

  app.post("/auth/session", async (req: Request, res: Response) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      res.status(403).json({
        error: "Password login is disabled for tunnel scope",
        tunnelLocked: true,
      });
      return;
    }
    try {
      await uiAuthController.handleSessionCreate!(req, res);
    } catch (error) {
      console.error("[UiAuth] Failed to create session", error);
      res.status(500).json({ error: "Internal server error", code: "internal_error" });
    }
  });

  app.get("/auth/passkey/status", (req: Request, res: Response) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      res.json({
        enabled: false,
        hasPasskeys: false,
        passkeyCount: 0,
        rpID: null,
        tunnelLocked: true,
      });
      return;
    }
    uiAuthController.handlePasskeyStatus!(req, res);
  });

  app.post("/auth/passkey/authenticate/options", (req: Request, res: Response) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      res.status(403).json({
        error: "Passkey login is disabled for tunnel scope",
        tunnelLocked: true,
      });
      return;
    }
    uiAuthController.handlePasskeyAuthenticationOptions!(req, res);
  });

  app.post("/auth/passkey/authenticate/verify", (req: Request, res: Response) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      res.status(403).json({
        error: "Passkey login is disabled for tunnel scope",
        tunnelLocked: true,
      });
      return;
    }
    uiAuthController.handlePasskeyAuthenticationVerify!(req, res);
  });

  app.post(
    "/auth/passkey/register/options",
    async (req: Request, res: Response, next: NextFunction) => {
      const requestScope = tunnelAuthController.classifyRequestScope(req);
      if (requestScope === "tunnel" || requestScope === "unknown-public") {
        res.status(403).json({
          error: "Passkey setup is disabled for tunnel scope",
          tunnelLocked: true,
        });
        return;
      }
      try {
        await uiAuthController.requireAuth!(req, res, async () => {
          await uiAuthController.handlePasskeyRegistrationOptions!(req, res);
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/auth/passkey/register/verify",
    async (req: Request, res: Response, next: NextFunction) => {
      const requestScope = tunnelAuthController.classifyRequestScope(req);
      if (requestScope === "tunnel" || requestScope === "unknown-public") {
        res.status(403).json({
          error: "Passkey setup is disabled for tunnel scope",
          tunnelLocked: true,
        });
        return;
      }
      try {
        await uiAuthController.requireAuth!(req, res, async () => {
          await uiAuthController.handlePasskeyRegistrationVerify!(req, res);
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/passkeys", async (req: Request, res: Response, next: NextFunction) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      res.status(403).json({
        error: "Passkey management is disabled for tunnel scope",
        tunnelLocked: true,
      });
      return;
    }
    try {
      await uiAuthController.requireAuth!(req, res, async () => {
        await uiAuthController.handlePasskeyList!(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/passkeys/:id", async (req: Request, res: Response, next: NextFunction) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      res.status(403).json({
        error: "Passkey management is disabled for tunnel scope",
        tunnelLocked: true,
      });
      return;
    }
    try {
      await uiAuthController.requireAuth!(req, res, async () => {
        await uiAuthController.handlePasskeyRevoke!(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/reset", async (req: Request, res: Response, next: NextFunction) => {
    const requestScope = tunnelAuthController.classifyRequestScope(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      res.status(403).json({
        error: "Global sign-out is disabled for tunnel scope",
        tunnelLocked: true,
      });
      return;
    }
    try {
      await uiAuthController.requireAuth!(req, res, async () => {
        await uiAuthController.handleResetAuth!(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/connect", async (req: Request, res: Response) => {
    try {
      const token = typeof req.query?.t === "string" ? req.query.t : "";
      const settings = await readSettingsFromDiskMigrated();
      const tunnelSessionTtlMs = normalizeTunnelSessionTtlMs(settings?.tunnelSessionTtlMs);

      const exchange = tunnelAuthController.exchangeBootstrapToken!({
        req,
        res,
        token,
        sessionTtlMs: tunnelSessionTtlMs,
      });

      res.setHeader("Cache-Control", "no-store");

      if (!exchange.ok) {
        if (exchange.reason === "rate-limited") {
          res.setHeader("Retry-After", String(exchange.retryAfter || 60));
          res.status(429)
            .type("text/plain")
            .send("Too many attempts. Please try again later.");
          return;
        }
        res.status(401).type("text/plain").send("Connection link is invalid or expired.");
        return;
      }

      res.redirect(302, "/");
    } catch {
      res.status(500).type("text/plain").send("Failed to process connect request.");
    }
  });

  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestScope = tunnelAuthController.classifyRequestScope(req);
      if (requestScope === "tunnel" || requestScope === "unknown-public") {
        tunnelAuthController.requireTunnelSession!(req, res, next);
        return;
      }
      await uiAuthController.requireAuth!(req, res, next);
    } catch (err) {
      next(err);
    }
  });
}

export function registerSettingsUtilityRoutes(
  app: Express,
  dependencies: SettingsUtilityRoutesDeps
): void {
  const { readCustomThemesFromDisk, refreshOpenCodeAfterConfigChange, clientReloadDelayMs } =
    dependencies;

  app.get("/api/config/themes", async (_req: Request, res: Response) => {
    try {
      const customThemes = await readCustomThemesFromDisk();
      const response = parseThemesListResponse({ themes: customThemes });
      if (!response.ok) {
        console.error("Failed to validate custom themes response:", response.error);
        res.status(500).json(themesError("themes_internal_error", "Failed to load custom themes"));
        return;
      }
      res.json(response.value);
    } catch (error) {
      console.error("Failed to load custom themes:", error);
      res.status(500).json(themesError("themes_internal_error", "Failed to load custom themes"));
    }
  });

  app.post("/api/config/reload", async (_req: Request, res: Response) => {
    try {
      console.log("[Server] Manual configuration reload requested");

      await refreshOpenCodeAfterConfigChange("manual configuration reload");

      res.json({
        success: true,
        requiresReload: true,
        message: "Configuration reloaded successfully. Refreshing interface…",
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error("[Server] Failed to reload configuration:", error);
      res.status(500).json({
        error: (error as Error)?.message || "Failed to reload configuration",
        success: false,
      });
    }
  });
}

export function registerCommonRequestMiddleware(
  app: Express,
  dependencies: CommonMiddlewareDeps
): void {
  const { express } = dependencies;

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith("/api/config/agents") ||
      req.path.startsWith("/api/config/commands") ||
      req.path.startsWith("/api/config/mcp") ||
      req.path.startsWith("/api/config/settings") ||
      req.path.startsWith("/api/config/skills") ||
      req.path.startsWith("/api/projects") ||
      req.path.startsWith("/api/fs") ||
      req.path.startsWith("/api/git") ||
      req.path.startsWith("/api/terminal") ||
      req.path.startsWith("/api/opencode") ||
      req.path.startsWith("/api/push") ||
      req.path.startsWith("/api/notifications") ||
      req.path.startsWith("/api/session-folders") ||
      req.path.startsWith("/api/text") ||
      req.path.startsWith("/api/openchamber/tunnel")
    ) {
      express.json({ limit: "50mb" })(req, res, next);
    } else if (req.path.startsWith("/api")) {
      next();
    } else {
      express.json({ limit: "50mb" })(req, res, next);
    }
  });

  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}
