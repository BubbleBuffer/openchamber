// packages/web/server/lib/core/event-bus.js
/** @template {Record<string, unknown>} Events
 * @returns {{
 *   on: <E extends keyof Events>(event: E, handler: (payload: Events[E]) => void) => () => void,
 *   once: <E extends keyof Events>(event: E, handler: (payload: Events[E]) => void) => void,
 *   emit: <E extends keyof Events>(event: E, payload: Events[E]) => void,
 *   removeAllFor: <E extends keyof Events>(event: E) => void,
 *   dispose: () => void,
 * }}
 */
export function createEventBus() {
  const handlers = new Map();

  const on = (event, handler) => {
    if (!handlers.has(event)) {
      handlers.set(event, []);
    }
    handlers.get(event).push(handler);
    return () => {
      const arr = handlers.get(event);
      if (arr) {
        const idx = arr.indexOf(handler);
        if (idx !== -1) {
          arr.splice(idx, 1);
          if (arr.length === 0) handlers.delete(event);
        }
      }
    };
  };

  const once = (event, handler) => {
    const wrapped = (payload) => {
      off();
      handler(payload);
    };
    const off = on(event, wrapped);
  };

  const emit = (event, payload) => {
    const arr = handlers.get(event);
    if (!arr) return;
    for (const handler of arr) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[EventBus] handler for "${event}" threw:`, error);
      }
    }
  };

  const removeAllFor = (event) => {
    handlers.delete(event);
  };

  const dispose = () => {
    handlers.clear();
  };

  return { on, once, emit, removeAllFor, dispose };
}
