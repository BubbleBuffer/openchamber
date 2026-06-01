/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";

interface PushSubscribeBody {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

interface PushUnsubscribeBody {
  endpoint?: string;
}

const parsePushSubscribeBody = (body: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } | null => {
  if (!body || typeof body !== "object") return null;
  const b = body as PushSubscribeBody;
  const endpoint = b.endpoint;
  const keys = b.keys;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;

  if (typeof endpoint !== "string" || endpoint.trim().length === 0) return null;
  if (typeof p256dh !== "string" || p256dh.trim().length === 0) return null;
  if (typeof auth !== "string" || auth.trim().length === 0) return null;

  return {
    endpoint: endpoint.trim(),
    keys: { p256dh: p256dh.trim(), auth: auth.trim() },
  };
};

const parsePushUnsubscribeBody = (body: unknown): { endpoint: string } | null => {
  if (!body || typeof body !== "object") return null;
  const b = body as PushUnsubscribeBody;
  const endpoint = b.endpoint;
  if (typeof endpoint !== "string" || endpoint.trim().length === 0) return null;
  return { endpoint: endpoint.trim() };
};

export const registerNotificationRoutes = (app: Express, dependencies: {
  uiAuthController?: any;
  ensurePushInitialized: () => Promise<void>;
  ensureGlobalWatcherStarted?: () => Promise<void>;
  getOrCreateVapidKeys: () => Promise<{ publicKey: string; privateKey: string }>;
  getUiSessionTokenFromRequest: (req: any) => string | null;
  readSettingsFromDiskMigrated: () => Promise<any>;
  writeSettingsToDisk: (settings: any) => Promise<void>;
  addOrUpdatePushSubscription: (uiSessionToken: string, subscription: any, userAgent?: string) => Promise<void>;
  removePushSubscription: (uiSessionToken: string, endpoint: string) => Promise<void>;
  updateUiVisibility: (token: string, visible: boolean) => void;
  isUiVisible: (token: string) => boolean;
  getUiNotificationClients: () => Set<any>;
  writeSseEvent: (res: any, payload: any) => void;
  getSessionActivitySnapshot: () => any;
  getSessionStateSnapshot: () => any;
  getSessionAttentionSnapshot: () => any;
  getSessionState: (sessionId: string) => any;
  getSessionAttentionState: (sessionId: string) => any;
  markSessionViewed: (sessionId: string, clientId: string) => void;
  markSessionUnviewed: (sessionId: string, clientId: string) => void;
  markUserMessageSent: (sessionId: string) => void;
  setPushInitialized: (value: boolean) => void;
  setAutoAcceptSession?: (sessionId: string, enabled: boolean) => void;
}): void => {
  const {
    uiAuthController,
    ensurePushInitialized,
    ensureGlobalWatcherStarted,
    getOrCreateVapidKeys,
    getUiSessionTokenFromRequest,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
    addOrUpdatePushSubscription,
    removePushSubscription,
    updateUiVisibility,
    isUiVisible,
    getUiNotificationClients,
    writeSseEvent,
    getSessionActivitySnapshot,
    getSessionStateSnapshot,
    getSessionAttentionSnapshot,
    getSessionState,
    getSessionAttentionState,
    markSessionViewed,
    markSessionUnviewed,
    markUserMessageSent,
    setPushInitialized,
    setAutoAcceptSession,
  } = dependencies;

  const ensureSessionWatcher = async (): Promise<void> => {
    if (typeof ensureGlobalWatcherStarted !== "function") {
      return;
    }
    try {
      await ensureGlobalWatcherStarted();
    } catch (error) {
      console.warn("[OpenCodeWatcher] lazy start failed:", (error as any)?.message ?? error);
    }
  };

  app.get("/api/push/vapid-public-key", async (_req: any, res: any) => {
    try {
      await ensurePushInitialized();
      const keys = await getOrCreateVapidKeys();
      res.json({ publicKey: keys.publicKey });
    } catch (error) {
      console.warn("[Push] Failed to load VAPID key:", error);
      res.status(500).json({ error: "Failed to load push key" });
    }
  });

  app.post("/api/push/subscribe", async (req: any, res: any) => {
    await ensurePushInitialized();
    await ensureSessionWatcher();

    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: "UI session missing" });
    }

    const parsed = parsePushSubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid body" });
    }

    const { endpoint, keys } = parsed;

    const origin = typeof req.body?.origin === "string" ? req.body.origin.trim() : "";
    if (origin.startsWith("http://") || origin.startsWith("https://")) {
      try {
        const settings = await readSettingsFromDiskMigrated();
        if (typeof settings?.publicOrigin !== "string" || settings.publicOrigin.trim().length === 0) {
          await writeSettingsToDisk({
            ...settings,
            publicOrigin: origin,
          });
          setPushInitialized(false);
        }
      } catch {
      }
    }

    await addOrUpdatePushSubscription(
      uiToken,
      {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      req.headers["user-agent"]
    );

    return res.json({ ok: true });
  });

  app.delete("/api/push/subscribe", async (req: any, res: any) => {
    await ensurePushInitialized();

    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: "UI session missing" });
    }

    const parsed = parsePushUnsubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid body" });
    }

    await removePushSubscription(uiToken, parsed.endpoint);
    return res.json({ ok: true });
  });

  app.post("/api/push/visibility", async (req: any, res: any) => {
    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: "UI session missing" });
    }

    const visible = req.body && typeof req.body === "object" ? req.body.visible : null;
    updateUiVisibility(uiToken, visible === true);
    return res.json({ ok: true });
  });

  app.get("/api/push/visibility", (req: any, res: any) => {
    const uiToken = getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: "UI session missing" });
    }

    return res.json({
      ok: true,
      visible: isUiVisible(uiToken),
    });
  });

  app.get("/api/notifications/stream", async (req: any, res: any) => {
    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const clients = getUiNotificationClients();
    clients.add(res);

    try {
      writeSseEvent(res, {
        type: "openchamber:notification-stream-ready",
        properties: { uiToken },
      });
    } catch {
    }

    req.on("close", () => {
      clients.delete(res);
    });
  });

  app.get("/api/session-activity", (_req: any, res: any) => {
    void ensureSessionWatcher();
    res.json(getSessionActivitySnapshot());
  });

  app.get("/api/sessions/snapshot", async (_req: any, res: any) => {
    await ensureSessionWatcher();
    res.json({
      statusSessions: getSessionStateSnapshot(),
      attentionSessions: getSessionAttentionSnapshot(),
      serverTime: Date.now(),
    });
  });

  app.get("/api/sessions/status", async (_req: any, res: any) => {
    await ensureSessionWatcher();
    const snapshot = getSessionStateSnapshot();
    res.json({
      sessions: snapshot,
      serverTime: Date.now(),
    });
  });

  app.get("/api/sessions/:id/status", async (req: any, res: any) => {
    await ensureSessionWatcher();
    const sessionId = req.params.id;
    const state = getSessionState(sessionId);

    if (!state) {
      return res.status(404).json({
        error: "Session not found or no state available",
        sessionId,
      });
    }

    return res.json({
      sessionId,
      ...state,
    });
  });

  app.get("/api/sessions/attention", async (_req: any, res: any) => {
    await ensureSessionWatcher();
    const snapshot = getSessionAttentionSnapshot();
    res.json({
      sessions: snapshot,
      serverTime: Date.now(),
    });
  });

  app.get("/api/sessions/:id/attention", async (req: any, res: any) => {
    await ensureSessionWatcher();
    const sessionId = req.params.id;
    const state = getSessionAttentionState(sessionId);

    if (!state) {
      return res.status(404).json({
        error: "Session not found or no attention state available",
        sessionId,
      });
    }

    return res.json({
      sessionId,
      ...state,
    });
  });

  app.post("/api/sessions/:id/view", (req: any, res: any) => {
    const sessionId = req.params.id;
    const clientId = req.headers["x-client-id"] || req.ip || "anonymous";

    markSessionViewed(sessionId, clientId);

    return res.json({
      success: true,
      sessionId,
      viewed: true,
    });
  });

  app.post("/api/sessions/:id/unview", (req: any, res: any) => {
    const sessionId = req.params.id;
    const clientId = req.headers["x-client-id"] || req.ip || "anonymous";

    markSessionUnviewed(sessionId, clientId);

    return res.json({
      success: true,
      sessionId,
      viewed: false,
    });
  });

  app.post("/api/sessions/:id/message-sent", (req: any, res: any) => {
    const sessionId = req.params.id;

    markUserMessageSent(sessionId);

    return res.json({
      success: true,
      sessionId,
      messageSent: true,
    });
  });

  // Mirror client-side Permission Auto-Accept state to the server so it can
  // suppress permission notifications at the source (the 500ms debounce race
  // otherwise leaks notifications for auto-accepted permissions).
  app.post("/api/notifications/auto-accept", (req: any, res: any) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const enabled = body.enabled === true;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" });
    }
    if (typeof setAutoAcceptSession === "function") {
      setAutoAcceptSession(sessionId, enabled);
    }
    return res.json({ success: true, sessionId, enabled });
  });
};