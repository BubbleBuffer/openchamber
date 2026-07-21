/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */
import type { Express } from "express";
import { apiError } from "../../contracts/common.js";
import { NOTIFICATION_SSE_CONTENT_TYPE, parseNotificationSseEvent, parsePushSubscribeRequest, parsePushUnsubscribeRequest, parseSessionActionRequest, parseSessionActionResponse, parseSessionActivityResponse, parseSessionAttentionSnapshotResponse, parseSessionAttentionStateResponse, parseSessionPathRequest, parseSessionSnapshotResponse, parseSessionStateResponse, parseSessionStatusSnapshotResponse, parseVisibilityRequest } from "../../contracts/notifications.js";

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
  getSessionAttentionState: (sessionId: string) => boolean | null;
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
  const unavailable = (res: any) => res.status(500).json({ error: "Internal server error", code: "notification_unavailable" });
  const invalidSessionRequest = (res: any) => res.status(400).json({ error: "Invalid session request", code: "notification_invalid_request" });
  const sendContract = (res: any, payload: unknown, parse: (value: unknown) => { ok: boolean }) => {
    if (!parse(payload).ok) return unavailable(res);
    return res.json(payload);
  };
  const sessionIdFromRequest = (req: any, res: any): string | null => {
    const parsed = parseSessionPathRequest(req.params);
    if (!parsed.ok) { invalidSessionRequest(res); return null; }
    return parsed.value.sessionId;
  };
  const clientIdFromRequest = (req: any): string => {
    const header = req.headers?.["x-client-id"];
    if (typeof header === "string" && header.trim()) return header.trim();
    return typeof req.ip === "string" && req.ip ? req.ip : "anonymous";
  };

  const requireUiSession = async (req: any, res: any): Promise<string | null> => {
    const token = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: "UI authentication required", code: "ui_auth_unauthorized" });
      return null;
    }
    return token;
  };

  app.get("/api/push/vapid-public-key", async (_req: any, res: any) => {
    try {
      await ensurePushInitialized();
      const keys = await getOrCreateVapidKeys();
      res.json({ publicKey: keys.publicKey });
    } catch (error) {
      console.warn("[Push] Failed to load VAPID key:", error);
      res.status(500).json(apiError("internal_error"));
    }
  });

  app.post("/api/push/subscribe", async (req: any, res: any) => {
    try {
      await ensurePushInitialized();
      await ensureSessionWatcher();

    const uiToken = await requireUiSession(req, res); if (!uiToken) return;

    const parsedResult = parsePushSubscribeRequest(req.body);
    if (!parsedResult.ok) {
      return res.status(400).json({ error: "Invalid body", code: "notification_invalid_request" });
    }
    const parsed = parsedResult.value;

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
    } catch (error) {
      console.error("[Push] Failed to subscribe:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.delete("/api/push/subscribe", async (req: any, res: any) => {
    try {
      await ensurePushInitialized();

    const uiToken = await requireUiSession(req, res); if (!uiToken) return;

    const parsedResult = parsePushUnsubscribeRequest(req.body);
    if (!parsedResult.ok) {
      return res.status(400).json({ error: "Invalid body", code: "notification_invalid_request" });
    }
    const parsed = parsedResult.value;

    await removePushSubscription(uiToken, parsed.endpoint);
      return res.json({ ok: true });
    } catch (error) {
      console.error("[Push] Failed to unsubscribe:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.post("/api/push/visibility", async (req: any, res: any) => {
    try {
    const uiToken = await requireUiSession(req, res); if (!uiToken) return;

    const parsed = parseVisibilityRequest(req.body);
    if (!parsed.ok) return res.status(400).json({ error: "Invalid body", code: "notification_invalid_request" });
    updateUiVisibility(uiToken, parsed.value.visible);
    return res.json({ ok: true });
    } catch (error) {
      console.error("[Push] Failed to update visibility:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.get("/api/push/visibility", async (req: any, res: any) => {
    const uiToken = await requireUiSession(req, res); if (!uiToken) return;

    return res.json({
      ok: true,
      visible: isUiVisible(uiToken),
    });
  });

  app.get("/api/notifications/stream", async (req: any, res: any) => {
    const uiToken = await requireUiSession(req, res); if (!uiToken) return;

    res.setHeader("Content-Type", NOTIFICATION_SSE_CONTENT_TYPE);
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const clients = getUiNotificationClients();
    clients.add(res);

    try {
      const event = parseNotificationSseEvent({
        type: "openchamber:notification-stream-ready",
        properties: {},
      });
      if (event.ok) writeSseEvent(res, event.value);
    } catch {
    }

    req.on("close", () => {
      clients.delete(res);
    });
  });

  app.get("/api/session-activity", (_req: any, res: any) => {
    void ensureSessionWatcher();
    return sendContract(res, getSessionActivitySnapshot(), parseSessionActivityResponse);
  });

  app.get("/api/sessions/snapshot", async (_req: any, res: any) => {
    await ensureSessionWatcher();
    return sendContract(res, {
      statusSessions: getSessionStateSnapshot(),
      attentionSessions: getSessionAttentionSnapshot(),
      serverTime: Date.now(),
    }, parseSessionSnapshotResponse);
  });

  app.get("/api/sessions/status", async (_req: any, res: any) => {
    await ensureSessionWatcher();
    const snapshot = getSessionStateSnapshot();
    return sendContract(res, {
      sessions: snapshot,
      serverTime: Date.now(),
    }, parseSessionStatusSnapshotResponse);
  });

  app.get("/api/sessions/:id/status", async (req: any, res: any) => {
    await ensureSessionWatcher();
    const sessionId = sessionIdFromRequest(req, res); if (!sessionId) return;
    const state = getSessionState(sessionId);

    if (!state) {
      return res.status(404).json({ error: "Session not found", code: "session_not_found" });
    }

    return sendContract(res, {
      sessionId,
      ...state,
    }, parseSessionStateResponse);
  });

  app.get("/api/sessions/attention", async (_req: any, res: any) => {
    await ensureSessionWatcher();
    const snapshot = getSessionAttentionSnapshot();
    return sendContract(res, {
      sessions: snapshot,
      serverTime: Date.now(),
    }, parseSessionAttentionSnapshotResponse);
  });

  app.get("/api/sessions/:id/attention", async (req: any, res: any) => {
    await ensureSessionWatcher();
    const sessionId = sessionIdFromRequest(req, res); if (!sessionId) return;
    const state = getSessionAttentionState(sessionId);

    if (state === null) {
      return res.status(404).json({ error: "Session not found", code: "session_not_found" });
    }

    return sendContract(res, {
      sessionId,
      needsAttention: state,
    }, parseSessionAttentionStateResponse);
  });

  app.post("/api/sessions/:id/view", (req: any, res: any) => {
    const sessionId = sessionIdFromRequest(req, res); if (!sessionId) return;
    const clientId = clientIdFromRequest(req);

    markSessionViewed(sessionId, clientId);

    return sendContract(res, {
      success: true,
      sessionId,
      viewed: true,
    }, parseSessionActionResponse);
  });

  app.post("/api/sessions/:id/unview", (req: any, res: any) => {
    const sessionId = sessionIdFromRequest(req, res); if (!sessionId) return;
    const clientId = clientIdFromRequest(req);

    markSessionUnviewed(sessionId, clientId);

    return sendContract(res, {
      success: true,
      sessionId,
      viewed: false,
    }, parseSessionActionResponse);
  });

  app.post("/api/sessions/:id/message-sent", (req: any, res: any) => {
    const sessionId = sessionIdFromRequest(req, res); if (!sessionId) return;

    markUserMessageSent(sessionId);

    return sendContract(res, {
      success: true,
      sessionId,
      messageSent: true,
    }, parseSessionActionResponse);
  });

  // Mirror client-side Permission Auto-Accept state to the server so it can
  // suppress permission notifications at the source (the 500ms debounce race
  // otherwise leaks notifications for auto-accepted permissions).
  app.post("/api/notifications/auto-accept", (req: any, res: any) => {
    const parsed = parseSessionActionRequest(req.body);
    if (!parsed.ok) return invalidSessionRequest(res);
    const { sessionId, enabled } = parsed.value;
    if (typeof setAutoAcceptSession === "function") {
      setAutoAcceptSession(sessionId, enabled);
    }
    return sendContract(res, { success: true, sessionId, enabled }, parseSessionActionResponse);
  });
};
