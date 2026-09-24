import { describe, expect, it } from 'vitest';
import { createEmitter, type GameEmitter } from './game-events';

describe('createEmitter', () => {
  it('delivers an event to handlers in registration order', () => {
    const emitter: GameEmitter = createEmitter();
    const calls: string[] = [];
    emitter.on('npc:talked', () => calls.push('a'));
    emitter.on('npc:talked', () => calls.push('b'));

    emitter.emit('npc:talked', { npcId: 'npc-1' });

    expect(calls).toEqual(['a', 'b']);
  });

  it('delivers distinct emits, in the order they were emitted, with the correct payload', () => {
    const emitter: GameEmitter = createEmitter();
    const calls: string[] = [];
    emitter.on('tokens:changed', (payload) => calls.push(`tokens:${payload.balance}`));
    emitter.on('badge:earned', (payload) => calls.push(`badge:${payload.badgeId}`));

    emitter.emit('tokens:changed', { balance: 5 });
    emitter.emit('badge:earned', { badgeId: 'first-badge' });

    expect(calls).toEqual(['tokens:5', 'badge:first-badge']);
  });

  it('snapshots the handler list per emit, so a handler added during an emit does not run in it', () => {
    const emitter: GameEmitter = createEmitter();
    const calls: string[] = [];
    emitter.on('npc:talked', () => {
      calls.push('first');
      emitter.on('npc:talked', () => calls.push('added-during-emit'));
    });

    emitter.emit('npc:talked', { npcId: 'npc-1' });
    expect(calls).toEqual(['first']);

    emitter.emit('npc:talked', { npcId: 'npc-1' });
    expect(calls).toEqual(['first', 'first', 'added-during-emit']);
  });

  it('stops delivering to a handler once its unsubscribe function has run', () => {
    const emitter: GameEmitter = createEmitter();
    const calls: string[] = [];
    const unsubscribe = emitter.on('ui:open-map', () => calls.push('called'));

    unsubscribe();
    emitter.emit('ui:open-map', {});

    expect(calls).toEqual([]);
  });

  it('stops delivering to a handler removed via off', () => {
    const emitter: GameEmitter = createEmitter();
    const calls: string[] = [];
    const handler = (): void => {
      calls.push('called');
    };
    emitter.on('ui:open-creator', handler);

    emitter.off('ui:open-creator', handler);
    emitter.emit('ui:open-creator', {});

    expect(calls).toEqual([]);
  });
});
