import { describe, expect, it, vi } from 'vitest';
import { createEmitter } from './emitter';

interface TestEvents {
  ping: { value: string };
  bump: void;
}

describe('createEmitter', () => {
  it('a handler receives successive emits, in emit order', () => {
    const emitter = createEmitter<TestEvents>();
    const received: string[] = [];
    emitter.on('ping', (payload) => received.push(payload.value));

    emitter.emit('ping', { value: 'A' });
    emitter.emit('ping', { value: 'B' });

    expect(received).toEqual(['A', 'B']);
  });

  it('delivers a single emit to multiple handlers in subscription order', () => {
    const emitter = createEmitter<TestEvents>();
    const calls: string[] = [];
    emitter.on('ping', () => calls.push('first'));
    emitter.on('ping', () => calls.push('second'));

    emitter.emit('ping', { value: 'x' });

    expect(calls).toEqual(['first', 'second']);
  });

  it('on returns an unsubscribe function', () => {
    const emitter = createEmitter<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = emitter.on('ping', handler);

    unsubscribe();
    emitter.emit('ping', { value: 'x' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('off inside a handler does not skip a remaining handler for that same emit', () => {
    const emitter = createEmitter<TestEvents>();
    const calls: string[] = [];
    const second = () => calls.push('second');
    emitter.on('ping', () => {
      calls.push('first');
      emitter.off('ping', second);
    });
    emitter.on('ping', second);

    emitter.emit('ping', { value: 'x' });

    expect(calls).toEqual(['first', 'second']);
  });

  it('once fires exactly once', () => {
    const emitter = createEmitter<TestEvents>();
    const handler = vi.fn();
    emitter.once('ping', handler);

    emitter.emit('ping', { value: 'first' });
    emitter.emit('ping', { value: 'second' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 'first' });
  });

  it('emits a void event without a payload', () => {
    const emitter = createEmitter<TestEvents>();
    const handler = vi.fn();
    emitter.on('bump', handler);

    emitter.emit('bump');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });
});
