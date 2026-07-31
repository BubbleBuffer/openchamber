import {
  connectTerminalStream,
  createTerminalSession,
  resizeTerminal,
  sendTerminalInput,
  closeTerminal,
  restartTerminalSession,
  forceKillTerminal,
} from '@/lib/terminal/terminalApi';
import type { TerminalCreateRequest, TerminalSessionResponse } from '@contracts/terminal';
import type { TerminalStreamEvent } from '@/lib/terminal/terminalApi';

export type CreateTerminalOptions = TerminalCreateRequest;
export type TerminalSession = TerminalSessionResponse;
export type TerminalStreamOptions = { retry?: Partial<{ maxRetries: number; initialDelayMs: number; maxDelayMs: number }>; connectionTimeoutMs?: number };
export type TerminalHandlers = { onEvent: (event: TerminalStreamEvent) => void; onError?: (error: Error, fatal?: boolean) => void };
export type ResizeTerminalPayload = { sessionId: string; cols: number; rows: number };
export type ForceKillOptions = { sessionId?: string; cwd?: string };
export interface TerminalAPI {
  createSession(options: CreateTerminalOptions): Promise<TerminalSession>;
  connect(sessionId: string, handlers: TerminalHandlers, options?: TerminalStreamOptions): { close: () => void };
  sendInput(sessionId: string, input: string): Promise<void>;
  resize(payload: ResizeTerminalPayload): Promise<void>;
  close(sessionId: string): Promise<void>;
  restartSession?(currentSessionId: string, options: CreateTerminalOptions): Promise<TerminalSession>;
  forceKill?(options: ForceKillOptions): Promise<void>;
}

const getRetryPolicy = (options?: TerminalStreamOptions) => {
  const retry = options?.retry;
  return {
    maxRetries: retry?.maxRetries ?? 3,
    initialRetryDelay: retry?.initialDelayMs ?? 1000,
    maxRetryDelay: retry?.maxDelayMs ?? 8000,
    connectionTimeout: options?.connectionTimeoutMs ?? 10000,
  };
};

export const createWebTerminalAPI = (): TerminalAPI => ({
  async createSession(options: CreateTerminalOptions): Promise<TerminalSession> {
    return createTerminalSession(options);
  },

  connect(sessionId: string, handlers: TerminalHandlers, options?: TerminalStreamOptions) {
    const unsubscribe = connectTerminalStream(
      sessionId,
      handlers.onEvent,
      handlers.onError,
      getRetryPolicy(options)
    );

    return {
      close: () => unsubscribe(),
    };
  },

  async sendInput(sessionId: string, input: string): Promise<void> {
    await sendTerminalInput(sessionId, input);
  },

  async resize(payload: ResizeTerminalPayload): Promise<void> {
    await resizeTerminal(payload.sessionId, payload.cols, payload.rows);
  },

  async close(sessionId: string): Promise<void> {
    await closeTerminal(sessionId);
  },

  async restartSession(
    currentSessionId: string,
    options: CreateTerminalOptions
  ): Promise<TerminalSession> {
    return restartTerminalSession(currentSessionId, {
      cwd: options.cwd ?? '',
      cols: options.cols,
      rows: options.rows,
    });
  },

  async forceKill(options: ForceKillOptions): Promise<void> {
    await forceKillTerminal(options);
  },
});
