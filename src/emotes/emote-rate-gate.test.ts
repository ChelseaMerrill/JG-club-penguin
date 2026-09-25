import { describe, expect, it } from 'vitest';
import { EMOTE_RATE_LIMIT_MS, EmoteRateGate } from './emote-rate-gate';

function clockFrom(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('EmoteRateGate', () => {
  it('accepts the first call for a key', () => {
    const gate = new EmoteRateGate();
    expect(gate.accept('self')).toBe(true);
  });

  it('rejects a second call for the same key inside the window', () => {
    const clock = clockFrom(0);
    const gate = new EmoteRateGate(clock.now);

    expect(gate.accept('self')).toBe(true);
    clock.advance(EMOTE_RATE_LIMIT_MS - 1);
    expect(gate.accept('self')).toBe(false);
  });

  it('accepts a second call once the window has fully elapsed', () => {
    const clock = clockFrom(0);
    const gate = new EmoteRateGate(clock.now);

    expect(gate.accept('self')).toBe(true);
    clock.advance(EMOTE_RATE_LIMIT_MS);
    expect(gate.accept('self')).toBe(true);
  });

  it('a rejected call does not itself move the window', () => {
    const clock = clockFrom(0);
    const gate = new EmoteRateGate(clock.now);

    gate.accept('self');
    clock.advance(100);
    expect(gate.accept('self')).toBe(false);
    clock.advance(100);
    expect(gate.accept('self')).toBe(false);
    clock.advance(EMOTE_RATE_LIMIT_MS - 200);
    expect(gate.accept('self')).toBe(true);
  });

  it('reset(key) clears only that key', () => {
    const clock = clockFrom(0);
    const gate = new EmoteRateGate(clock.now);

    gate.accept('self');
    gate.accept('other');
    gate.reset('self');

    expect(gate.accept('self')).toBe(true);
    expect(gate.accept('other')).toBe(false);
  });

  it('reset() with no key clears every key', () => {
    const clock = clockFrom(0);
    const gate = new EmoteRateGate(clock.now);

    gate.accept('self');
    gate.accept('other');
    gate.reset();

    expect(gate.accept('self')).toBe(true);
    expect(gate.accept('other')).toBe(true);
  });
});
