import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './event-bus.js';

describe('EventBus', () => {
  it('subscribes and emits', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    bus.emit('test', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('handles multiple subscribers', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('test', a);
    bus.on('test', b);
    bus.emit('test', 'data');
    expect(a).toHaveBeenCalledWith('data');
    expect(b).toHaveBeenCalledWith('data');
  });

  it('returns unsubscribe function that removes only that handler', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('test', a);
    bus.on('test', b);
    offA();
    bus.emit('test', 'data');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('data');
  });

  it('once fires exactly one time', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.once('test', handler);
    bus.emit('test', 1);
    bus.emit('test', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('once unsubscribes before handler runs so throw inside handler is safe', () => {
    const bus = createEventBus();
    const handler = vi.fn(() => { throw new Error('boom'); });
    bus.once('test', handler);
    bus.emit('test', 1);
    expect(handler).toHaveBeenCalledTimes(1);
    bus.emit('test', 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removeAllFor clears all handlers for an event', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('test', a);
    bus.on('test', b);
    bus.removeAllFor('test');
    bus.emit('test', 'data');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('emit with no registered handlers does not throw', () => {
    const bus = createEventBus();
    expect(() => bus.emit('nonexistent', 'data')).not.toThrow();
  });

  it('a handler error does not prevent other handlers from running', () => {
    const bus = createEventBus();
    const good = vi.fn();
    const bad = vi.fn(() => { throw new Error('fail'); });
    bus.on('test', bad);
    bus.on('test', good);
    bus.emit('test', 'data');
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });

  it('same handler registered twice fires twice', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    bus.on('test', handler);
    bus.emit('test', 'data');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('events are isolated by name', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('event.a', a);
    bus.on('event.b', b);
    bus.emit('event.a', 1);
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('dispose clears all handlers', () => {
    const bus = createEventBus();
    const h = vi.fn();
    bus.on('test', h);
    bus.dispose();
    bus.emit('test', 'data');
    expect(h).not.toHaveBeenCalled();
  });
});
