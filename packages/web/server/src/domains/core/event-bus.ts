/* eslint-disable @typescript-eslint/no-explicit-any */
type EventHandler = (payload: any) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private onceHandlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  once(event: string, handler: EventHandler): void {
    if (!this.onceHandlers.has(event)) this.onceHandlers.set(event, new Set());
    this.onceHandlers.get(event)!.add(handler);
  }

  emit(event: string, payload: any): void {
    const hs = this.handlers.get(event);
    if (hs) for (const h of hs) h(payload);
    const oh = this.onceHandlers.get(event);
    if (oh) {
      for (const h of oh) h(payload);
      oh.clear();
    }
  }

  removeAllFor(event: string): void {
    this.handlers.get(event)?.clear();
    this.onceHandlers.get(event)?.clear();
  }

  dispose(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
  }
}

export function createEventBus(): EventBus {
  return new EventBus();
}