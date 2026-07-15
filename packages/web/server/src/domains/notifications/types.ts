/* eslint-disable @typescript-eslint/no-explicit-any */

import type { EventBus } from "../core/event-bus.js";

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

export interface NotificationEmitterDeps {
  getUiNotificationClients: () => Set<any>;
  getBroadcastGlobalUiEvent: () => ((payload: any) => void) | null;
}

export interface NotificationEmitterRuntime {
  writeSseEvent: (res: any, payload: any) => void;
  broadcastUiNotification: (payload: any) => void;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface NotificationMessageSettings {
  summarizeLastMessage?: boolean;
  summaryThreshold?: number;
  summaryLength?: number;
  maxLastMessageLength?: number;
}

export interface PrepareNotificationLastMessageArgs {
  message: string;
  settings?: NotificationMessageSettings;
  summarize?: (text: string, length: number) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export interface NotificationTemplateDeps {
  eventBus: EventBus;
  readSettingsFromDisk: () => Promise<any>;
  persistSettings: (settings: any) => Promise<void>;
  openCodeRuntime: any;
  resolveGitBinaryForSpawn: () => string;
}

export interface NotificationTemplateRuntime {
  createTimeoutSignal: (timeoutMs: number) => { signal: globalThis.AbortSignal; cleanup: () => void };
  formatProjectLabel: (label: string) => string;
  resolveNotificationTemplate: (template: string, variables: Record<string, string>) => string;
  shouldApplyResolvedTemplateMessage: (template: string, resolved: string, variables: any) => boolean;
  fetchFreeZenModels: () => Promise<Array<{ id: string; owned_by: string }>>;
  resolveZenModel: (override?: string) => Promise<string>;
  validateZenModelAtStartup: () => Promise<void>;
  summarizeText: (text: string, targetLength: number, zenModel?: string) => Promise<string>;
  extractTextFromParts: (parts: any[], maxLength?: number) => string;
  extractLastMessageText: (payload: any, maxLength?: number) => string;
  fetchLastAssistantMessageText: (sessionId: string, messageId: string, maxLength?: number) => Promise<string>;
  maybeCacheSessionInfoFromEvent: (payload: any) => void;
  buildTemplateVariables: (payload: any, sessionId?: string) => Promise<Record<string, string>>;
  getCachedZenModels: () => any;
  dispose?: () => void;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export interface NotificationTriggerDeps {
  eventBus: EventBus;
  readSettingsFromDisk: () => Promise<any>;
  prepareNotificationLastMessage: (args: PrepareNotificationLastMessageArgs) => Promise<string>;
  summarizeText: (text: string, length: number, zenModel?: string) => Promise<string>;
  resolveZenModel: (override?: string) => Promise<string>;
  buildTemplateVariables: (payload: any, sessionId?: string) => Promise<Record<string, string>>;
  extractLastMessageText: (payload: any, maxLength?: number) => string;
  fetchLastAssistantMessageText: (sessionId: string, messageId: string, maxLength?: number) => Promise<string>;
  resolveNotificationTemplate: (template: string, variables: Record<string, string>) => string;
  shouldApplyResolvedTemplateMessage: (template: string, resolved: string, variables: any) => boolean;
  openCodeRuntime: any;
}

export interface NotificationTriggerRuntime {
  maybeSendPushForTrigger: (payload: any) => Promise<void>;
  setAutoAcceptSession: (sessionId: string, enabled: boolean) => void;
  dispose?: () => void;
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export interface PushRuntimeDeps {
  fsPromises: typeof import("fs").promises;
  path: typeof import("path");
  webPush: any;
  PUSH_SUBSCRIPTIONS_FILE_PATH: string;
  readSettingsFromDiskMigrated: () => Promise<any>;
  writeSettingsToDisk: (settings: any) => Promise<void>;
}

export interface PushRuntime {
  getOrCreateVapidKeys: () => Promise<{ publicKey: string; privateKey: string }>;
  addOrUpdatePushSubscription: (uiSessionToken: string, subscription: any, userAgent?: string) => Promise<void>;
  removePushSubscription: (uiSessionToken: string, endpoint: string) => Promise<void>;
  sendPushToAllUiSessions: (payload: any, options?: { requireNoSse?: boolean }) => Promise<void>;
  updateUiVisibility: (token: string, visible: boolean) => void;
  isAnyUiVisible: () => boolean;
  isUiVisible: (token: string) => boolean;
  ensurePushInitialized: () => Promise<void>;
  setPushInitialized: (value: boolean) => void;
  dispose?: () => void;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export interface NotificationRoutesDeps {
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
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export interface NotificationRuntimeDeps {
  eventBus: EventBus;
  openCodeRuntime: any;
  readSettingsFromDisk: () => Promise<any>;
  persistSettings: (settings: any) => Promise<void>;
  resolveGitBinaryForSpawn: () => string;
}

export interface NotificationRuntime {
  initialize: () => Promise<void>;
  maybeSendPushForTrigger: (payload: any) => Promise<void>;
  setAutoAcceptSession: (sessionId: string, enabled: boolean) => void;
  dispose?: () => void;
}
