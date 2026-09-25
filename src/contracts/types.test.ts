import { describe, expect, it } from 'vitest';
import { gameEvents, type MinigameCompleted } from './game-events';
import type { RoomBroadcastEvent } from './realtime';

describe('contract type-level guarantees', () => {
  it('rejects a payload for a void event', () => {
    // @ts-expect-error 'ui:open-map' is declared void; it takes no payload argument.
    gameEvents.emit('ui:open-map', {});

    expect(true).toBe(true);
  });

  it('requires a payload for a non-void event', () => {
    // @ts-expect-error 'npc:talked' requires an { npcId: string } payload.
    gameEvents.emit('npc:talked');

    expect(true).toBe(true);
  });

  it('rejects a MinigameCompleted whose stats do not match its minigameId', () => {
    const completed: MinigameCompleted = {
      minigameId: 'bug-squash',
      score: 10,
      // @ts-expect-error bug-squash stats are { score, squashed, bestCombo, escaped }, not the pancake-flip shape.
      stats: { golden: 1, flipNow: 1, raw: 1, burnt: 1, stacked: 1 },
    };

    expect(completed.minigameId).toBe('bug-squash');
  });

  it('rejects a reserved event name as a RoomBroadcastEvent', () => {
    // @ts-expect-error 'snowball:throw' is reserved (#53) but not a key of RoomBroadcastMap yet.
    const event: RoomBroadcastEvent = 'snowball:throw';

    expect(event).toBe('snowball:throw');
  });

  it('accepts emote (#47) as a RoomBroadcastEvent, now that it is a real RoomBroadcastMap key', () => {
    const event: RoomBroadcastEvent = 'emote';

    expect(event).toBe('emote');
  });

  it('accepts a well-typed emit as a positive control', () => {
    let received: { npcId: string } | undefined;
    const unsubscribe = gameEvents.on('npc:talked', (payload) => {
      received = payload;
    });

    gameEvents.emit('npc:talked', { npcId: 'npc-1' });
    unsubscribe();

    expect(received).toEqual({ npcId: 'npc-1' });
  });
});
