import type { EventBus } from "../core/event-bus.js";
import { EVENTS } from "../core/events.js";
import { createNotificationTemplateRuntime } from "./template-runtime.js";
import { createNotificationTriggerRuntime } from "./trigger-runtime.js";
import { prepareNotificationLastMessage } from "./message.js";

export const createNotificationRuntime = (deps: {
  eventBus: EventBus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openCodeRuntime: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readSettingsFromDisk: () => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  persistSettings: (settings: any) => Promise<void>;
  resolveGitBinaryForSpawn: () => string;
}) => {
  const { eventBus, openCodeRuntime, readSettingsFromDisk, persistSettings, resolveGitBinaryForSpawn } = deps;

  const templateRuntime = createNotificationTemplateRuntime({
    eventBus,
    readSettingsFromDisk,
    persistSettings,
    openCodeRuntime,
    resolveGitBinaryForSpawn,
  });

  const triggerRuntime = createNotificationTriggerRuntime({
    eventBus,
    readSettingsFromDisk,
    openCodeRuntime,
    prepareNotificationLastMessage,
    summarizeText: templateRuntime.summarizeText,
    resolveZenModel: templateRuntime.resolveZenModel,
    buildTemplateVariables: templateRuntime.buildTemplateVariables,
    extractLastMessageText: templateRuntime.extractLastMessageText,
    fetchLastAssistantMessageText: templateRuntime.fetchLastAssistantMessageText,
    resolveNotificationTemplate: templateRuntime.resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage: templateRuntime.shouldApplyResolvedTemplateMessage,
  });

  let initPromise: Promise<void> | null = null;

  const initialize = async (): Promise<void> => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      await templateRuntime.validateZenModelAtStartup();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventBus.on(EVENTS.EVENT_RECEIVED, ({ payload }: { payload: any }) => {
        triggerRuntime.maybeSendPushForTrigger(payload);
      });
    })();
    return initPromise;
  };

  return {
    initialize,
    maybeSendPushForTrigger: triggerRuntime.maybeSendPushForTrigger,
    setAutoAcceptSession: triggerRuntime.setAutoAcceptSession,
    dispose: () => {
      triggerRuntime.dispose?.();
      templateRuntime.dispose?.();
    },
  };
};