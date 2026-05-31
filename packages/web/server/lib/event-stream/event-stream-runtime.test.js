import { describe, expect, it } from 'vitest';
import { createEventBus } from '../core/event-bus.js';
import { createEventStreamRuntime } from './runtime.js';

describe('event-stream-runtime', () => {
  it('broadcasts ui notification to sse clients', () => {
    const eventBus = createEventBus();
    const runtime = createEventStreamRuntime({
      eventBus,
      openCodeRuntime: { getUrl: () => '', getAuthHeaders: () => ({}) },
      process,
      fsPromises: null, path: null,
      readSettingsFromDiskMigrated: async () => ({}),
      writeSettingsToDisk: async () => {},
      pushSubscriptionsFilePath: '/tmp/test-push.json',
    });

    const messages = [];
    const fakeRes = { write: (data) => { messages.push(data); } };
    runtime.addUiNotificationClient(fakeRes);

    eventBus.emit('notification:send-ui', {
      payload: { type: 'test', title: 'hello' },
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('hello');
  });

  it('emits event:received when upstream payload arrives', () => {
    const eventBus = createEventBus();
    const runtime = createEventStreamRuntime({
      eventBus,
      openCodeRuntime: { getUrl: () => '', getAuthHeaders: () => ({}) },
      process,
      fsPromises: null, path: null,
      readSettingsFromDiskMigrated: async () => ({}),
      writeSettingsToDisk: async () => {},
      pushSubscriptionsFilePath: '/tmp/test-push.json',
    });

    const received = [];
    eventBus.on('event:received', (payload) => { received.push(payload); });

    runtime.processUpstreamPayload({ type: 'session.status', properties: { sessionID: 's1' } });

    expect(received.length).toBe(1);
    expect(received[0].payload.type).toBe('session.status');
  });
});
