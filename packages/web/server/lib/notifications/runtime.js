import { createNotificationTemplateRuntime } from './template-runtime.js';
import { createNotificationTriggerRuntime } from './trigger-runtime.js';
import { EVENTS } from '../core/events.js';

export const createNotificationRuntime = (deps) => {
  const { eventBus, openCodeRuntime, readSettingsFromDisk, persistSettings, resolveGitBinaryForSpawn } = deps;

  const templateRuntime = createNotificationTemplateRuntime({
    eventBus, readSettingsFromDisk, persistSettings, openCodeRuntime, resolveGitBinaryForSpawn,
  });

  const triggerRuntime = createNotificationTriggerRuntime({
    eventBus, readSettingsFromDisk, openCodeRuntime,
    prepareNotificationLastMessage: templateRuntime.prepareNotificationLastMessage,
    summarizeText: templateRuntime.summarizeText,
    resolveZenModel: templateRuntime.resolveZenModel,
    buildTemplateVariables: templateRuntime.buildTemplateVariables,
    extractLastMessageText: templateRuntime.extractLastMessageText,
    fetchLastAssistantMessageText: templateRuntime.fetchLastAssistantMessageText,
    resolveNotificationTemplate: templateRuntime.resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage: templateRuntime.shouldApplyResolvedTemplateMessage,
  });

  let initialized = false;

  const initialize = async () => {
    if (initialized) return;
    initialized = true;
    await templateRuntime.validateZenModelAtStartup();
    eventBus.on(EVENTS.EVENT_RECEIVED, ({ payload }) => {
      triggerRuntime.maybeSendPushForTrigger(payload);
    });
  };

  return {
    initialize,
    maybeSendPushForTrigger: triggerRuntime.maybeSendPushForTrigger,
    setAutoAcceptSession: triggerRuntime.setAutoAcceptSession,
  };
};
