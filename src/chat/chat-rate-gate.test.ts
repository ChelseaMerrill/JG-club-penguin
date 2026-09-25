import { describe, expect, it } from 'vitest';
import { CHAT_RATE_LIMIT_MS, ChatRateGate } from './chat-rate-gate';

function clockAt(...times: number[]): () => number {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
}

describe('ChatRateGate', () => {
  it('accepts the first call for a key', () => {
    const gate = new ChatRateGate(clockAt(0));

    expect(gate.accept('a')).toBe(true);
  });

  it('refuses a second call for the same key inside the rate limit window', () => {
    const gate = new ChatRateGate(clockAt(0, 500));

    expect(gate.accept('a')).toBe(true);
    expect(gate.accept('a')).toBe(false);
  });

  it('accepts again once the rate limit window has fully elapsed', () => {
    const gate = new ChatRateGate(clockAt(0, CHAT_RATE_LIMIT_MS));

    expect(gate.accept('a')).toBe(true);
    expect(gate.accept('a')).toBe(true);
  });

  it('tracks each key independently', () => {
    const gate = new ChatRateGate(clockAt(0, 10));

    expect(gate.accept('a')).toBe(true);
    expect(gate.accept('b')).toBe(true);
  });

  it('a refused call does not move the window forward', () => {
    const gate = new ChatRateGate(clockAt(0, 200, 900, CHAT_RATE_LIMIT_MS));

    expect(gate.accept('a')).toBe(true); // at 0: accepted, window starts at 0
    expect(gate.accept('a')).toBe(false); // at 200: refused
    expect(gate.accept('a')).toBe(false); // at 900: refused (still < 1000 since 0)
    expect(gate.accept('a')).toBe(true); // at 1000: accepted
  });

  it('reset(key) makes the next accept() for that key unconditional', () => {
    const gate = new ChatRateGate(clockAt(0, 500));

    expect(gate.accept('a')).toBe(true);
    gate.reset('a');
    expect(gate.accept('a')).toBe(true);
  });

  it('reset() with no key clears every key', () => {
    const gate = new ChatRateGate(clockAt(0, 0, 500, 500));

    expect(gate.accept('a')).toBe(true);
    expect(gate.accept('b')).toBe(true);
    gate.reset();
    expect(gate.accept('a')).toBe(true);
    expect(gate.accept('b')).toBe(true);
  });
});
