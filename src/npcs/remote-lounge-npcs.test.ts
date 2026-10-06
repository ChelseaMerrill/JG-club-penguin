import { describe, expect, it } from 'vitest';
import { renderCardFigure } from '../game/npcs/card-figures';
import { REMOTE_JGERS } from '../game/npcs/remote-lounge-figures';
import { getRoomDefinition } from '../game/rooms/registry';
import { getNpcMotion } from './npc-motions';
import { NPCS } from './npcs';
import { REMOTE_LOUNGE_NPC_IDS } from './remote-lounge-npcs';

const lounge = getRoomDefinition('remote-lounge');

describe('Remote Lounge NPCs', () => {
  it("places the design's 16 remote JGers, each once, in the design's own order", () => {
    expect(REMOTE_JGERS).toHaveLength(16);
    expect(lounge.npcSlots.map((slot) => slot.npcId)).toEqual(
      REMOTE_JGERS.map((p) => REMOTE_LOUNGE_NPC_IDS[p.key as keyof typeof REMOTE_LOUNGE_NPC_IDS]),
    );
  });

  it("gives each one the design's name, first-name tag, quote and figure", () => {
    for (const person of REMOTE_JGERS) {
      const npc = NPCS[REMOTE_LOUNGE_NPC_IDS[person.key as keyof typeof REMOTE_LOUNGE_NPC_IDS]];
      expect(npc).toMatchObject({
        name: person.name,
        roomId: 'remote-lounge',
        kind: 'human',
        tagName: person.name.split(' ')[0],
        dialogLines: [person.line],
        figure: { card: person.card },
      });
    }
    expect(NPCS['joshua-jameson'].dialogLines[0]).toBe(
      'In Florida, a gator in the pool counts as a standup.',
    );
  });

  it("draws Steven from the design's own override, not his humans.js spec: grey hair and the green alien badge", () => {
    const steven = renderCardFigure('remoteSteven', 'steven-remote-lounget');
    expect(steven).toContain('fill="#6E7075"');
    expect(steven).toContain('fill="#7ED957"');
  });

  it('keeps TITLE TBD people untitled, as the Characters sheet does', () => {
    expect(NPCS['casey-remote-lounge'].title).toBeNull();
    expect(NPCS['millie-remote-lounge'].title).toBeNull();
    expect(NPCS['steven-vickers'].title).toBeNull();
    expect(NPCS['matt-anderson'].title).toBe('Principal Engineer');
  });

  it('shows one quote at a time, 4 s apart, each for 3.2 s of a 64 s cycle', () => {
    const lines = lounge.npcSlots.map((slot) => NPCS[slot.npcId as keyof typeof NPCS].idleLines);
    for (const [i, idle] of lines.entries()) {
      expect(idle).toEqual([
        expect.objectContaining({ periodS: 64, delayS: 1.2 + 4 * i - 64, window: [0, 0.05] }),
      ]);
    }
  });

  it('gives every one a designed idle motion, and Tommy and Michael their instruments and notes', () => {
    for (const slot of lounge.npcSlots) {
      expect(getNpcMotion(slot.npcId)?.figure, slot.npcId).toBeDefined();
    }
    expect(getNpcMotion('tommy-kneeland')?.figure?.animation).toMatch(/^remotePlayTrumpet /);
    expect(getNpcMotion('michael-shirk')?.figure?.animation).toMatch(/^remotePlayHarp /);
    expect(getNpcMotion('tommy-kneeland')?.props).toHaveLength(6);
    expect(getNpcMotion('michael-shirk')?.props).toHaveLength(6);
    expect(getNpcMotion('matt-bessler')?.props).toBeUndefined();
  });

  it('stands everyone on a walkable tile, none on the spawn tile', () => {
    for (const slot of lounge.npcSlots) {
      expect(lounge.walkable[slot.tile.row]![slot.tile.col], slot.npcId).toBe(true);
      expect(slot.tile).not.toEqual(lounge.spawnTile);
    }
  });
});
