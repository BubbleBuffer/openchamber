// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { EventBus } from "../core/event-bus.js";
import { EVENTS } from "../core/events.js";
// @ts-expect-error — resolves once template-runtime.ts exists (Task 9)
import { createNotificationTemplateRuntime } from "./template-runtime.js";
// @ts-expect-error — resolves once trigger-runtime.ts exists (Task 9)
import { createNotificationTriggerRuntime } from "./trigger-runtime.js";

export const createNotificationRuntime = (deps: {
  eventBus: EventBus;
  openCodeRuntime: any;
  readSettingsFromDisk: () => Promise<any>;
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
    prepareNotificationLastMessage: templateRuntime.prepareNotificationLastMessage,
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