import { describe, expect, it } from 'vitest';
import { createEventBus } from '../core/event-bus.js';
import { createNotificationRuntime } from './runtime.js';

describe('notification-runtime', () => {
  it('emits notification events when event:received has matching payload', async () => {
    const eventBus = createEventBus();

    const emitted = [];
    eventBus.on('notification:send-ui', (p) => emitted.push(p));
    eventBus.on('notification:send-desktop', (p) => emitted.push(p));

    const runtime = createNotificationRuntime({
      eventBus,
      openCodeRuntime: { getUrl: () => '', getAuthHeaders: () => ({}) },
      readSettingsFromDisk: async () => ({
        notifyOnCompletion: true,
        notifyOnError: false,
        notifyOnQuestion: false,
        notifyOnSubtasks: false,
        nativeNotificationsEnabled: true,
        notificationMode: 'always',
        notificationTemplates: {},
      }),
      persistSettings: async () => {},
      resolveGitBinaryForSpawn: () => null,
    });

    await runtime.initialize();

    eventBus.emit('event:received', {
      payload: {
        type: 'message.updated',
        properties: {
          sessionID: 'test-session',
          info: {
            role: 'assistant',
            finish: 'stop',
            id: 'msg-1',
            mode: 'agent',
            modelID: 'gpt-5-nano',
          },
          parts: [{ type: 'text', text: 'Hello' }],
        },
      },
    });

    const start = Date.now();
    while (emitted.length < 1 && Date.now() - start < 2000) {
      await new Promise(r => setTimeout(r, 10));
    }

    expect(emitted.length).toBeGreaterThanOrEqual(1);
  });
});
