import { describe, expect, it } from 'vitest';
import { resolveRoomTitle } from './room-titles';

// A "live" figure the designs hard-coded but the prototype never actually
// computes (a headcount, a build status, a countdown): none of these may
// leak into a resolved subtitle.
const FAKE_LIVE_PATTERNS = [
  /\d+ PENGUINS? HERE/,
  /\d+ ONLINE/,
  /\d+ SHOPPERS/,
  /BUILD PASSING/,
  /KICKOFF IN \d/,
];

describe('resolveRoomTitle', () => {
  it('resolves Town Center from design/Room 01 Town Center.dc.html', () => {
    expect(resolveRoomTitle('town-center')).toEqual({
      title: 'TOWN CENTER',
      subtitle: 'JG HQ · 108 STATE ST · FLOOR 5',
    });
  });

  it('resolves Dev Pit from design/Room 02 Dev Pit.dc.html', () => {
    expect(resolveRoomTitle('dev-pit')).toEqual({
      title: 'DEV PIT',
      subtitle: 'TEAM RMS 1–4 · FLOOR 5',
    });
  });

  it('resolves the-melt as "THE MELT" from design/Room 04 Kitchen.dc.html', () => {
    expect(resolveRoomTitle('the-melt')).toEqual({
      title: 'THE MELT',
      subtitle: 'KITCHEN · FLOOR 5',
    });
  });

  it('resolves roof-deck as "THE MARKET" from design/Room 05 Roof Deck.dc.html', () => {
    expect(resolveRoomTitle('roof-deck')).toEqual({
      title: 'THE MARKET',
      subtitle: 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS',
    });
  });

  it('resolves the Igloo from design/Room 06 Igloo.dc.html', () => {
    expect(resolveRoomTitle('igloo')).toEqual({
      title: 'YOUR IGLOO',
      subtitle: 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS',
    });
  });

  it('never resolves a subtitle with a fabricated live figure', () => {
    for (const roomId of ['town-center', 'dev-pit', 'the-melt', 'roof-deck', 'igloo'] as const) {
      const { subtitle } = resolveRoomTitle(roomId);
      for (const pattern of FAKE_LIVE_PATTERNS) {
        expect(subtitle).not.toMatch(pattern);
      }
    }
  });
});
