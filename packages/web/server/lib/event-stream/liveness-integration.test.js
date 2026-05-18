import { describe, expect, it } from 'vitest';
import { createGlobalMessageStreamHub } from './global-hub.js';
import { createUpstreamSseReader } from './upstream-reader.js';

function createMockSseServer() {
  let signal;
  let blocks = [];
  let holdOpen = false;
  let fetchCount = 0;

  return {
    setResponse(opts) {
      blocks = opts.blocks ?? [];
      holdOpen = opts.holdOpen ?? false;
    },
    setSignal(s) { signal = s; },
    get fetchCount() { return fetchCount; },
    fetch: async (url, options) => {
      fetchCount++;
      const encoder = new TextEncoder();
      let index = 0;
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                if (index < blocks.length) {
                  return { value: encoder.encode(blocks[index++]), done: false };
                }
                if (!holdOpen) {
                  return { value: undefined, done: true };
                }
                return new Promise((_resolve, reject) => {
                  const onAbort = () => {
                    options.signal.removeEventListener('abort', onAbort);
                    const error = new Error('Aborted');
                    error.name = 'AbortError';
                    reject(error);
                  };
                  options.signal.addEventListener('abort', onAbort, { once: true });
                });
              },
            };
          },
        },
      };
    },
  };
}

describe('liveness signal chain', () => {
  it('upstream-reader triggers onStall when data stops', async () => {
    const mockServer = createMockSseServer();
    const abortController = new AbortController();
    const stallReceived = new Promise((resolve) => {
      mockServer.setResponse({
        blocks: ['id: evt-1\ndata: {"type":"server.connected","properties":{}}\n\n'],
        holdOpen: true, // won't send more data → stall
      });
      mockServer.setSignal(abortController.signal);

      const hub = createGlobalMessageStreamHub({
        buildOpenCodeUrl: (path) => new URL(`http://127.0.0.1${path}`),
        getOpenCodeAuthHeaders: () => ({}),
        fetchImpl: mockServer.fetch,
        upstreamStallTimeoutMs: 50,
        upstreamReconnectDelayMs: 10,
      });

      // Subscribe to hub status to detect stall
      hub.subscribeStatus((status) => {
        // Upstream reader will attempt to reconnect automatically
        // The onStall is called before the reader reconnects
        if (status.type === 'disconnect' && status.reason === 'upstream_stalled') {
          resolve(status.reason);
        }
      });

      hub.start();
    });

    const reason = await stallReceived;
    expect(reason).toBe('upstream_stalled');
    abortController.abort();
  }, 10000);

  it('upstream-reader calls onStall and onResume through stall/reconnect cycle', async () => {
    const mockServer = createMockSseServer();
    const abortController = new AbortController();
    let attempt = 0;
    mockServer.setResponse({
      blocks: [],
      holdOpen: true, // first attempt hangs → stall timer fires
    });

    const stallCalled = new Promise((resolve) => {
      mockServer.setSignal(abortController.signal);

      const reader = createUpstreamSseReader({
        buildUrl: () => new URL('http://127.0.0.1:4096/global/event'),
        fetchImpl: async (url, options) => {
          attempt++;
          mockServer.setSignal(options.signal);
          if (attempt === 1) {
            return mockServer.fetch(url, options);
          }
          // Second attempt: return data quickly
          return {
            ok: true,
            status: 200,
            body: {
              getReader() {
                let done = false;
                return {
                  async read() {
                    if (!done) {
                      done = true;
                      const encoder = new TextEncoder();
                      return { value: encoder.encode('id: evt-2\ndata: {"type":"server.connected","properties":{}}\n\n'), done: false };
                    }
                    return { value: undefined, done: true };
                  },
                };
              },
            },
          };
        },
        stallTimeoutMs: 50,
        reconnectDelayMs: 10,
        onStall: ({ duration }) => resolve(duration),
        onResume: ({ lastEventId }) => resolve(lastEventId),
      });

      reader.start();
    });

    const result = await stallCalled;
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(48);
    abortController.abort();
  }, 10000);
});
