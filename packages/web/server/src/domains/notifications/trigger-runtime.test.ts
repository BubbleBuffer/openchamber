import { afterEach, describe, expect, it, vi } from "vitest";

import { EventBus } from "../core/event-bus.js";
import { EVENTS } from "../core/events.js";
import { createNotificationTriggerRuntime } from "./trigger-runtime.js";

type TriggerCase = {
  name: string;
  payload: Record<string, unknown>;
  disabledSetting: string;
  expectedKind: string;
  expectedPushType: string;
  expectedTitle: string;
  expectedBody: string;
  sessionId: string;
};

type NotificationEventPayload = {
  payload?: {
    title?: string;
    body?: string;
    tag?: string;
    kind?: string;
    requireHidden?: boolean;
    data?: Record<string, string>;
  };
  options?: { requireNoSse?: boolean };
};

const cases: TriggerCase[] = [
  {
    name: "ready/completion",
    payload: {
      type: "message.updated",
      properties: {
        info: {
          role: "assistant",
          finish: "stop",
          sessionID: "session-ready",
          id: "message-ready",
          mode: "build-agent",
          modelID: "gpt-4o",
        },
      },
    },
    disabledSetting: "notifyOnCompletion",
    expectedKind: "ready",
    expectedPushType: "ready",
    expectedTitle: "Resolved Build agent",
    expectedBody: "Resolved original message",
    sessionId: "session-ready",
  },
  {
    name: "error",
    payload: {
      type: "message.updated",
      properties: {
        info: {
          role: "assistant",
          finish: "error",
          sessionID: "session-error",
          id: "message-error",
        },
      },
    },
    disabledSetting: "notifyOnError",
    expectedKind: "error",
    expectedPushType: "error",
    expectedTitle: "Resolved error",
    expectedBody: "Resolved original message",
    sessionId: "session-error",
  },
  {
    name: "question",
    payload: {
      type: "question.asked",
      properties: {
        sessionID: "session-question",
        questions: [{ header: "Input", question: "Choose a value" }],
      },
    },
    disabledSetting: "notifyOnQuestion",
    expectedKind: "question",
    expectedPushType: "question",
    expectedTitle: "Resolved question",
    expectedBody: "Resolved Choose a value",
    sessionId: "session-question",
  },
  {
    name: "permission",
    payload: {
      type: "permission.asked",
      properties: {
        sessionID: "session-permission",
        id: "request-1",
        permission: "edit",
      },
    },
    disabledSetting: "notifyOnQuestion",
    expectedKind: "permission",
    expectedPushType: "permission",
    expectedTitle: "Resolved question",
    expectedBody: "Resolved edit",
    sessionId: "session-permission",
  },
];

const createRuntime = (
  testCase: TriggerCase,
  settingsOverrides: Record<string, unknown> = {},
) => {
  const eventBus = new EventBus();
  const events: Array<{ name: string; payload: unknown }> = [];
  const settings = {
    nativeNotificationsEnabled: true,
    notificationMode: "hidden-only",
    notifyOnCompletion: true,
    notifyOnError: true,
    notifyOnQuestion: true,
    notifyOnSubtasks: true,
    notificationTemplates: {
      completion: { title: "Resolved {agent_name}", message: "Resolved {last_message}" },
      error: { title: "Resolved error", message: "Resolved {last_message}" },
      question: { title: "Resolved question", message: "Resolved {last_message}" },
    },
    ...settingsOverrides,
  };

  for (const name of [
    EVENTS.NOTIFICATION_SEND_UI,
    EVENTS.NOTIFICATION_SEND_PUSH,
    "notification:send-desktop",
  ]) {
    eventBus.on(name, (payload) => events.push({ name, payload }));
  }

  const runtime = createNotificationTriggerRuntime({
    eventBus,
    readSettingsFromDisk: async () => settings,
    prepareNotificationLastMessage: async ({ message }) => message || "prepared message",
    summarizeText: async (text) => text,
    resolveZenModel: async () => "zen-model",
    buildTemplateVariables: async () => ({
      agent_name: "Build agent",
      model_name: "GPT 4o",
      last_message: "original message",
    }),
    extractLastMessageText: () => "original message",
    fetchLastAssistantMessageText: async () => "fetched message",
    resolveNotificationTemplate: (template, variables) =>
      template.replace(/\{(\w+)\}/g, (_match, key: string) => variables[key] || ""),
    shouldApplyResolvedTemplateMessage: () => true,
    getOpenCodeRuntime: () => null,
  });

  return { runtime, events, settings, eventBus };
};

describe("notification trigger runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(cases)(
    "$name preserves push payloads while browser UI delivery follows preferences",
    async (testCase) => {
      vi.useFakeTimers();
      const enabled = createRuntime(testCase);

      await enabled.runtime.maybeSendPushForTrigger(testCase.payload);
      await vi.advanceTimersByTimeAsync(500);

      const uiEvents = enabled.events.filter(({ name }) => name === EVENTS.NOTIFICATION_SEND_UI);
      const pushEvents = enabled.events.filter(({ name }) => name === EVENTS.NOTIFICATION_SEND_PUSH);
      const desktopEvents = enabled.events.filter(({ name }) => name === "notification:send-desktop");

      expect(uiEvents).toHaveLength(1);
      expect(pushEvents).toHaveLength(1);
      expect(desktopEvents).toHaveLength(0);
      const pushEvent = pushEvents[0].payload as NotificationEventPayload;
      const uiEvent = uiEvents[0].payload as NotificationEventPayload;
      expect(pushEvent.options).toEqual({ requireNoSse: true });
      expect(pushEvent.payload).toEqual({
        title: testCase.expectedTitle,
        body: testCase.expectedBody,
        tag: `${testCase.expectedPushType}-${testCase.sessionId}`,
        data: {
          url: `/?session=${testCase.sessionId}`,
          sessionId: testCase.sessionId,
          type: testCase.expectedPushType,
        },
      });
      expect(uiEvent.payload).toMatchObject({
        kind: testCase.expectedKind,
        requireHidden: true,
      });
      enabled.runtime.dispose?.();

      const browserDisabled = createRuntime(testCase, { nativeNotificationsEnabled: false });
      await browserDisabled.runtime.maybeSendPushForTrigger(testCase.payload);
      await vi.advanceTimersByTimeAsync(500);
      expect(browserDisabled.events.filter(({ name }) => name === EVENTS.NOTIFICATION_SEND_UI)).toHaveLength(0);
      expect(browserDisabled.events.filter(({ name }) => name === EVENTS.NOTIFICATION_SEND_PUSH)).toHaveLength(1);
      expect(browserDisabled.events.filter(({ name }) => name === "notification:send-desktop")).toHaveLength(0);
      browserDisabled.runtime.dispose?.();

      const eventDisabled = createRuntime(testCase, { [testCase.disabledSetting]: false });
      await eventDisabled.runtime.maybeSendPushForTrigger(testCase.payload);
      await vi.advanceTimersByTimeAsync(500);
      expect(eventDisabled.events).toHaveLength(0);
      eventDisabled.runtime.dispose?.();
    },
  );

  it("clears pending trigger timers when disposed", async () => {
    vi.useFakeTimers();
    const testCase = cases.find(({ name }) => name === "question");
    if (!testCase) throw new Error("question trigger case is required");
    const runtime = createRuntime(testCase);

    await runtime.runtime.maybeSendPushForTrigger(testCase.payload);
    runtime.runtime.dispose?.();
    await vi.advanceTimersByTimeAsync(500);

    expect(runtime.events).toHaveLength(0);
  });
});
