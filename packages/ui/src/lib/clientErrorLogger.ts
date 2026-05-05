const LOG_ENDPOINT = '/api/client-log';

const MAX_QUEUE = 50;
let queue: Array<Record<string, unknown>> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let disabled = false;

function sendBatch(entries: Array<Record<string, unknown>>): void {
  if (disabled || entries.length === 0) return;

  const payload = JSON.stringify({ entries });
  try {
    const sent = navigator.sendBeacon(LOG_ENDPOINT, payload);
    if (!sent) {
      // Some browsers limit sendBeacon payload size; fall back to individual POSTs
      entries.forEach((entry) => {
        void fetch(LOG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
          keepalive: true,
        });
      });
    }
  } catch {
    disabled = true;
  }
}

function flush(): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  sendBatch(batch);
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 1000);
}

export function logClientError(error: unknown, context?: Record<string, unknown>): void {
  if (disabled) return;

  const entry: Record<string, unknown> = {
    level: 'error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
    ...context,
  };

  queue.push(entry);
  if (queue.length >= MAX_QUEUE) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
  } else {
    scheduleFlush();
  }
}

export function logClientWarning(message: string, context?: Record<string, unknown>): void {
  logClientError(new Error(message), { level: 'warn', ...context });
}

export function logClientInfo(message: string, context?: Record<string, unknown>): void {
  logClientError(new Error(message), { level: 'info', ...context });
}

export function flushClientLogs(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}
