import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectTerminalStream,
  createTerminalSession,
  disposeTerminalInputTransport,
  resizeTerminal,
} from './terminalApi';

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.CONNECTING;
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly send = vi.fn();

  constructor(url: string) { void url; MockWebSocket.instances.push(this); }
  open(): void { this.readyState = MockWebSocket.OPEN; this.onopen?.(); }
  receiveControl(payload: unknown): void {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    this.onmessage?.({ data: new Uint8Array([1, ...bytes]).buffer });
  }
  close(): void { this.readyState = 3; this.onclose?.(); }
}

class MockEventSource {
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly close = vi.fn(() => { this.readyState = MockEventSource.CLOSED; });

  constructor(url: string) { void url; MockEventSource.instances.push(this); }
  open(): void { this.readyState = 1; this.onopen?.(); }
  receive(data: string): void { this.onmessage?.({ data }); }
}

const terminalSession = {
  sessionId: 'terminal-1', cols: 80, rows: 24,
  capabilities: {
    input: { preferred: 'ws' as const, transports: ['ws' as const, 'http' as const], ws: { path: '/api/terminal/ws', v: 2, enc: 'text+json-bin-control' } },
    stream: { preferred: 'ws' as const, transports: ['ws' as const, 'sse' as const], ws: { path: '/api/terminal/ws', v: 2, enc: 'text+json-bin-control' } },
  },
};

describe('terminal API contracts', () => {
  afterEach(() => {
    disposeTerminalInputTransport();
    MockWebSocket.instances = [];
    MockEventSource.instances = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects malformed terminal session responses before configuring transport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: 'terminal-1' }), { status: 200 })));
    await expect(createTerminalSession({ cwd: '/work' })).rejects.toThrow('Malformed terminal session response');
  });

  it('decodes coded terminal failures and rejects malformed success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Terminal request failed', code: 'terminal_invalid_request' }), { status: 400 })));
    await expect(resizeTerminal('terminal-1', 80, 24)).rejects.toThrow('Terminal request failed');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 })));
    await expect(resizeTerminal('terminal-1', 80, 24)).rejects.toThrow('Failed to resize terminal');
  });

  it('rebinds after transport loss and discards malformed control without dispatching stream state', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost' } });
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(terminalSession), { status: 200 })));
    await createTerminalSession({ cwd: '/work' });
    const events: string[] = [];
    connectTerminalStream('terminal-1', (event) => events.push(event.type));

    const first = MockWebSocket.instances[0]!;
    first.open();
    first.receiveControl({ t: 'ok', v: 2 });
    await Promise.resolve();
    first.receiveControl({ t: 'bok', s: 'terminal-1', v: 2, runtime: 'node', ptyBackend: 'test-pty' });
    await Promise.resolve();
    expect(events).toEqual(['connected']);

    first.receiveControl({ t: 'bok', s: 'terminal-1', v: 2 });
    await Promise.resolve();
    expect(events).toEqual(['connected']);

    first.close();
    await vi.advanceTimersByTimeAsync(1000);
    const second = MockWebSocket.instances[1]!;
    second.open();
    second.receiveControl({ t: 'ok', v: 2 });
    await Promise.resolve();
    const rebind = second.send.mock.calls.map(([frame]) => {
      const bytes = new Uint8Array(frame as ArrayBuffer);
      return JSON.parse(new TextDecoder().decode(bytes.subarray(1)));
    });
    expect(rebind).toContainEqual({ t: 'b', s: 'terminal-1', v: 2 });
  });

  it('rejects malformed SSE events without corrupting fallback state and cleans up valid exits', () => {
    vi.stubGlobal('EventSource', MockEventSource);
    const events: string[] = [];
    const errors: Error[] = [];
    const cleanup = connectTerminalStream('terminal-1', (event) => events.push(event.type), (error) => errors.push(error));
    const source = MockEventSource.instances[0]!;
    source.open();
    source.receive('{"type":"exit","exitCode":"0","signal":0}');
    expect(events).toEqual(['connected']);
    expect(errors).toHaveLength(1);
    expect(source.close).not.toHaveBeenCalled();

    source.receive('{"type":"exit","exitCode":0,"signal":0}');
    expect(events).toEqual(['connected', 'exit']);
    expect(source.close).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
