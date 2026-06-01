/* eslint-disable @typescript-eslint/no-explicit-any */
// Pre-existing JS dependency — keep old import path
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createBoundedMap }: { createBoundedMap: (opts: { maxSize: number; ttlMs: number }) => Map<unknown, unknown> } =
  require("../../../lib/core/bounded-cache.js") as any;

interface BoundedMap<V> {
  get(key: unknown): V | undefined;
  set(key: unknown, value: V): void;
  dispose(): void;
}

const PUSH_SUBSCRIPTIONS_VERSION = 1;

const isLoopbackHttpOrigin = (value: string): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  return value.startsWith("http://localhost")
    || value.startsWith("http://127.0.0.1")
    || value.startsWith("http://[::1]");
};

export const createPushRuntime = (deps: {
  fsPromises: typeof import("fs").promises;
  path: typeof import("path");
  webPush: any;
  PUSH_SUBSCRIPTIONS_FILE_PATH: string;
  readSettingsFromDiskMigrated: () => Promise<any>;
  writeSettingsToDisk: (settings: any) => Promise<void>;
}) => {
  const {
    fsPromises,
    path,
    webPush,
    PUSH_SUBSCRIPTIONS_FILE_PATH,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
  } = deps;

  let persistPushSubscriptionsLock: Promise<any> = Promise.resolve();
  let pushInitialized = false;

  const uiVisibilityByToken = createBoundedMap({ maxSize: 200, ttlMs: 86400_000 }) as unknown as BoundedMap<{ visible: boolean; updatedAt: number }>;
  let globalVisibilityState = false;

  const readPushSubscriptionsFromDisk = async (): Promise<{ version: number; subscriptionsBySession: Record<string, any[]> }> => {
    try {
      const raw = await fsPromises.readFile(PUSH_SUBSCRIPTIONS_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
      }
      if (typeof parsed.version !== "number" || parsed.version !== PUSH_SUBSCRIPTIONS_VERSION) {
        return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
      }

      const subscriptionsBySession =
        parsed.subscriptionsBySession && typeof parsed.subscriptionsBySession === "object"
          ? parsed.subscriptionsBySession
          : {};

      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession };
    } catch (error) {
      if (error && typeof error === "object" && (error as any).code === "ENOENT") {
        return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
      }
      console.warn("Failed to read push subscriptions file:", error);
      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
    }
  };

  const writePushSubscriptionsToDisk = async (data: { version: number; subscriptionsBySession: Record<string, any[]> }): Promise<void> => {
    await fsPromises.mkdir(path.dirname(PUSH_SUBSCRIPTIONS_FILE_PATH), { recursive: true });
    await fsPromises.writeFile(PUSH_SUBSCRIPTIONS_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  };

  const persistPushSubscriptionUpdate = async (mutate: (current: { version: number; subscriptionsBySession: Record<string, any[]> }) => { version: number; subscriptionsBySession: Record<string, any[]> }): Promise<any> => {
    persistPushSubscriptionsLock = persistPushSubscriptionsLock.then(async () => {
      await fsPromises.mkdir(path.dirname(PUSH_SUBSCRIPTIONS_FILE_PATH), { recursive: true });
      const current = await readPushSubscriptionsFromDisk();
      const next = mutate({
        version: PUSH_SUBSCRIPTIONS_VERSION,
        subscriptionsBySession: current.subscriptionsBySession || {},
      });
      await writePushSubscriptionsToDisk(next);
      return next;
    });

    return persistPushSubscriptionsLock;
  };

  const getOrCreateVapidKeys = async (): Promise<{ publicKey: string; privateKey: string }> => {
    const settings = await readSettingsFromDiskMigrated();
    const existing = settings?.vapidKeys;
    if (existing && typeof existing.publicKey === "string" && typeof existing.privateKey === "string") {
      return { publicKey: existing.publicKey, privateKey: existing.privateKey };
    }

    const generated = webPush.generateVAPIDKeys();
    const next = {
      ...settings,
      vapidKeys: {
        publicKey: generated.publicKey,
        privateKey: generated.privateKey,
      },
    };

    await writeSettingsToDisk(next);
    return { publicKey: generated.publicKey, privateKey: generated.privateKey };
  };

  const normalizePushSubscriptions = (record: unknown[]): Array<{ endpoint: string; p256dh: string; auth: string; createdAt: number | null }> => {
    if (!Array.isArray(record)) return [];
    return record
      .map((entry: any) => {
        if (!entry || typeof entry !== "object") return null;
        const endpoint = entry.endpoint;
        const p256dh = entry.p256dh;
        const auth = entry.auth;
        if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
          return null;
        }
        return {
          endpoint,
          p256dh,
          auth,
          createdAt: typeof entry.createdAt === "number" ? entry.createdAt : null,
        };
      })
      .filter(Boolean) as any;
  };

  const addOrUpdatePushSubscription = async (uiSessionToken: string, subscription: any, userAgent?: string): Promise<void> => {
    if (!uiSessionToken) {
      return;
    }

    await ensurePushInitialized();

    const now = Date.now();

    await persistPushSubscriptionUpdate((current) => {
      const subsBySession = { ...(current.subscriptionsBySession || {}) };
      const existing = Array.isArray(subsBySession[uiSessionToken]) ? subsBySession[uiSessionToken] : [];

      const filtered = existing.filter((entry: any) => entry && typeof entry.endpoint === "string" && entry.endpoint !== subscription.endpoint);

      filtered.unshift({
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        createdAt: now,
        lastSeenAt: now,
        userAgent: typeof userAgent === "string" && userAgent.length > 0 ? userAgent : undefined,
      });

      subsBySession[uiSessionToken] = filtered.slice(0, 10);

      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: subsBySession };
    });
  };

  const removePushSubscription = async (uiSessionToken: string, endpoint: string): Promise<void> => {
    if (!uiSessionToken || !endpoint) return;

    await ensurePushInitialized();

    await persistPushSubscriptionUpdate((current) => {
      const subsBySession = { ...(current.subscriptionsBySession || {}) };
      const existing = Array.isArray(subsBySession[uiSessionToken]) ? subsBySession[uiSessionToken] : [];
      const filtered = existing.filter((entry: any) => entry && typeof entry.endpoint === "string" && entry.endpoint !== endpoint);
      if (filtered.length === 0) {
        delete subsBySession[uiSessionToken];
      } else {
        subsBySession[uiSessionToken] = filtered;
      }
      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: subsBySession };
    });
  };

  const removePushSubscriptionFromAllSessions = async (endpoint: string): Promise<void> => {
    if (!endpoint) return;

    await ensurePushInitialized();

    await persistPushSubscriptionUpdate((current) => {
      const subsBySession = { ...(current.subscriptionsBySession || {}) };
      for (const [token, entries] of Object.entries(subsBySession)) {
        if (!Array.isArray(entries)) continue;
        const filtered = entries.filter((entry: any) => entry && typeof entry.endpoint === "string" && entry.endpoint !== endpoint);
        if (filtered.length === 0) {
          delete subsBySession[token as string];
        } else {
          subsBySession[token as string] = filtered;
        }
      }
      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: subsBySession };
    });
  };

  const sendPushToSubscription = async (sub: any, payload: any): Promise<void> => {
    await ensurePushInitialized();
    const body = JSON.stringify(payload);

    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webPush.sendNotification(pushSubscription, body);
    } catch (error) {
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode === 410 || statusCode === 404) {
        await removePushSubscriptionFromAllSessions(sub.endpoint);
        return;
      }
      console.warn("[Push] Failed to send notification:", error);
    }
  };

  const sendPushToAllUiSessions = async (payload: any, options: { requireNoSse?: boolean } = {}): Promise<void> => {
    const requireNoSse = options.requireNoSse === true;
    const store = await readPushSubscriptionsFromDisk();
    const sessions = store.subscriptionsBySession || {};
    const subscriptionsByEndpoint = new Map<string, any>();

    for (const record of Object.values(sessions)) {
      const subscriptions = normalizePushSubscriptions(record as any[]);
      if (subscriptions.length === 0) continue;

      for (const sub of subscriptions) {
        if (!subscriptionsByEndpoint.has(sub.endpoint)) {
          subscriptionsByEndpoint.set(sub.endpoint, sub);
        }
      }
    }

    await Promise.all(Array.from(subscriptionsByEndpoint.values()).map(async (sub: any) => {
      if (requireNoSse && isAnyUiVisible()) {
        return;
      }
      await sendPushToSubscription(sub, payload);
    }));
  };

  const updateUiVisibility = (token: string, visible: boolean): void => {
    if (!token) return;
    const now = Date.now();
    const nextVisible = Boolean(visible);
    uiVisibilityByToken.set(token, { visible: nextVisible, updatedAt: now });
    globalVisibilityState = nextVisible;
  };

  const isAnyUiVisible = (): boolean => globalVisibilityState === true;

  const isUiVisible = (token: string): boolean => uiVisibilityByToken.get(token)?.visible === true;

  const resolveVapidSubject = async (): Promise<string> => {
    const configured = process.env.OPENCHAMBER_VAPID_SUBJECT;
    if (typeof configured === "string" && configured.trim().length > 0) {
      return configured.trim();
    }

    const originEnv = process.env.OPENCHAMBER_PUBLIC_ORIGIN;
    if (typeof originEnv === "string" && originEnv.trim().length > 0) {
      const trimmed = originEnv.trim();
      if (isLoopbackHttpOrigin(trimmed)) {
        return "mailto:openchamber@localhost";
      }
      return trimmed;
    }

    try {
      const settings = await readSettingsFromDiskMigrated();
      const stored = settings?.publicOrigin;
      if (typeof stored === "string" && stored.trim().length > 0) {
        const trimmed = stored.trim();
        if (isLoopbackHttpOrigin(trimmed)) {
          return "mailto:openchamber@localhost";
        }
        return trimmed;
      }
    } catch {
    }

    return "mailto:openchamber@localhost";
  };

  const ensurePushInitialized = async (): Promise<void> => {
    if (pushInitialized) return;
    const keys = await getOrCreateVapidKeys();
    const subject = await resolveVapidSubject();

    if (subject === "mailto:openchamber@localhost") {
      console.warn("[Push] No public origin configured for VAPID; set OPENCHAMBER_VAPID_SUBJECT or enable push once from a real origin.");
    }

    webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    pushInitialized = true;
  };

  const setPushInitialized = (value: boolean): void => {
    pushInitialized = value === true;
  };

  return {
    getOrCreateVapidKeys,
    addOrUpdatePushSubscription,
    removePushSubscription,
    sendPushToAllUiSessions,
    updateUiVisibility,
    isAnyUiVisible,
    isUiVisible,
    ensurePushInitialized,
    setPushInitialized,
    dispose: () => {
      uiVisibilityByToken.dispose();
    },
  };
};