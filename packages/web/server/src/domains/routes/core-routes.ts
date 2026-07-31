import type { Express, NextFunction, Request, Response } from "express";
import type { CoreRoutesDeps, AuthRoutesDeps, SettingsUtilityRoutesDeps, CommonMiddlewareDeps } from "./types.js";
import { MESSAGE_STREAM_PROTOCOL_VERSION } from "../../contracts/system.js";

export function registerServerStatusRoutes(app: Express, deps: CoreRoutesDeps): void {
  const {
    process,
    openchamberVersion,
    runtimeName,
    serverStartedAt,
    gracefulShutdown,
    getHealthSnapshot,
  } = deps;

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ...getHealthSnapshot(),
    });
  });

  app.post('/api/system/shutdown', (_req: Request, res: Response) => {
    res.json({ ok: true });
    gracefulShutdown({ exitProcess: true }).catch((error: unknown) => {
      console.error('Shutdown request failed:', error instanceof Error ? error.message : error);
    });
  });

  app.get('/api/system/info', (_req: Request, res: Response) => {
    res.json({
      openchamberVersion,
      runtime: runtimeName,
      pid: process.pid,
      startedAt: serverStartedAt,
      protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION,
    });
  });
}

export function registerAuthAndAccessRoutes(app: Express, deps: AuthRoutesDeps): void {
  const {
    uiAuthController,
  } = deps;

  app.get('/auth/session', async (req: Request, res: Response) => {
    try {
      await uiAuthController.handleSessionStatus(req, res);
    } catch (error) {
      console.error('Failed to read owner session status:', error);
      res.status(500).json({ error: 'Internal server error', code: 'internal_error' });
    }
  });

  app.post('/auth/session', (req: Request, res: Response) => {
    return uiAuthController.handleSessionCreate(req, res);
  });

  app.get('/auth/passkey/status', (req: Request, res: Response) => {
    return uiAuthController.handlePasskeyStatus(req, res);
  });

  app.post('/auth/passkey/authenticate/options', (req: Request, res: Response) => {
    return uiAuthController.handlePasskeyAuthenticationOptions(req, res);
  });

  app.post('/auth/passkey/authenticate/verify', (req: Request, res: Response) => {
    return uiAuthController.handlePasskeyAuthenticationVerify(req, res);
  });

  app.post('/auth/passkey/register/options', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await uiAuthController.requireAuth(req, res, async () => {
        await uiAuthController.handlePasskeyRegistrationOptions(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/passkey/register/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await uiAuthController.requireAuth(req, res, async () => {
        await uiAuthController.handlePasskeyRegistrationVerify(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/passkeys', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await uiAuthController.requireAuth(req, res, async () => {
        await uiAuthController.handlePasskeyList(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/passkeys/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await uiAuthController.requireAuth(req, res, async () => {
        await uiAuthController.handlePasskeyRevoke(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/reset', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await uiAuthController.requireAuth(req, res, async () => {
        await uiAuthController.handleResetAuth(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await uiAuthController.requireAuth(req, res, next);
    } catch (err) {
      next(err);
    }
  });
}

export function registerSettingsUtilityRoutes(app: Express, deps: SettingsUtilityRoutesDeps): void {
  const {
    readCustomThemesFromDisk,
    refreshOpenCodeAfterConfigChange,
    clientReloadDelayMs,
  } = deps;

  app.get('/api/config/themes', async (_req: Request, res: Response) => {
    try {
      const customThemes = await readCustomThemesFromDisk();
      res.json({ themes: customThemes });
    } catch (error) {
      console.error('Failed to load custom themes:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load custom themes' });
    }
  });

  app.post('/api/config/reload', async (_req: Request, res: Response) => {
    try {
      console.log('[Server] Manual configuration reload requested');

      await refreshOpenCodeAfterConfigChange('manual configuration reload');

      res.json({
        success: true,
        requiresReload: true,
        message: 'Configuration reloaded successfully. Refreshing interface…',
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error('[Server] Failed to reload configuration:', error);
      res.status(500).json({
        error: (error as Error).message || 'Failed to reload configuration',
        success: false,
      });
    }
  });
}

export function registerCommonRequestMiddleware(app: Express, deps: CommonMiddlewareDeps): void {
  const { express } = deps;

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api/config/agents') ||
      req.path.startsWith('/api/config/commands') ||
      req.path.startsWith('/api/config/mcp') ||
      req.path.startsWith('/api/config/settings') ||
      req.path.startsWith('/api/config/skills') ||
      req.path.startsWith('/api/projects') ||
      req.path.startsWith('/api/fs') ||
      req.path.startsWith('/api/git') ||
      req.path.startsWith('/api/terminal') ||
      req.path.startsWith('/api/opencode') ||
      req.path.startsWith('/api/push') ||
      req.path.startsWith('/api/notifications') ||
      req.path.startsWith('/api/session-folders')
    ) {
      express.json({ limit: '50mb' })(req, res, next);
    } else if (req.path.startsWith('/api')) {
      next();
    } else {
      express.json({ limit: '50mb' })(req, res, next);
    }
  });

  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}
