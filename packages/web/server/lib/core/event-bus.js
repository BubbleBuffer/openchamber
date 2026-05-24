// packages/web/server/lib/core/event-bus.js
// Minimal publish/subscribe event bus for orchestrator-level communication.

export function createEventBus() {
  const handlers = new Map();

  const on = (event, handler) => {
    if (typeof event !== 'string' || !event) return () => {};
    if (typeof handler !== 'function') return () => {};

    if (!handlers.has(event)) {
      handlers.set(event, new Set());
    }
    handlers.get(event).add(handler);

    return () => {
      const set = handlers.get(event);
      if (set) {
        set.delete(handler);
        if (set.size === 0) handlers.delete(event);
      }
    };
  };

  const off = (event, handler) => {
    const set = handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) handlers.delete(event);
    }
  };

  const emit = (event, ...args) => {
    const set = handlers.get(event);
    if (!set || set.size === 0) return;
    for (const handler of Array.from(set)) {
      try {
        handler(...args);
      } catch (error) {
        console.error(`[event-bus] Error in handler for "${event}":`, error);
      }
    }
  };

  return { on, off, emit };
}
