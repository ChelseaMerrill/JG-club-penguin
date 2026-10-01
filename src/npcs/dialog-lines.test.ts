import { describe, expect, it } from 'vitest';
import { ROOM_DEFINITIONS } from '../game/rooms/registry';
import { dialogLinePool, pickDialogLine } from './dialog-lines';
import { getNpcDefinition, NPCS, type NpcDefinition } from './npcs';

/**
 * Placed NPCs still one line short, waiting on BA copy (#144). Remove an id
 * when its line lands; the test below fails if the set drifts either way.
 * The three Mullet ids (#51 slice 3) are the BA request at
 * https://github.com/ChelseaMerrill/JG-club-penguin/issues/144#issuecomment-5861116456.
 */
const AWAITING_BA_LINE: readonly string[] = [
  'emily',
  'jason-mullet',
  'jon-mullet',
  'brandon-mullet',
  // His "corner pocket" bubble is a fragment of his one line, so it's
  // omitted from his dialog (owner request, 2026-10-01, Track D).
  'tony',
];

/**
 * Every speech-bubble line in `design/Stairwell.dc.html`. #144 leaves them
 * out (Q16); #51's Stairwell slice adds them with those NPCs' appearances.
 */
const STAIRWELL_LINES: readonly string[] = [
  'Almost.',
  'Beat drops on floor 3.',
  'Cardio is free!',
  'Deep breaths.',
  'Dom beat you by four minutes.',
  'Dom has lapped you twice.',
  'Elevator is broken. It is not. Take the stairs.',
  'Elevator is for quitters!',
  'Fine.',
  'Five floors. I will be watching.',
  'Five floors. One legend.',
  'Five floors?!',
  'Floor 1. That is one. Out of five.',
  'Floor 1. Warm-up done.',
  'Floor 2. My grandma climbs faster.',
  'Floor 2. You got this.',
  'Floor 4. Breathing hard already?',
  'Floor 5. Finally.',
  'Follow me!',
  'Halfway! Kind of!',
  'Halfway.',
  'Halfway. Your Fitbit is embarrassed.',
  'Headphones on. Legs on.',
  'Here we go.',
  'Legs feeling it yet?',
  'Legs: gone.',
  'Log it or it did not happen.',
  'Looking strong!',
  'Made it! Chicken did too.',
  'My Fitbit is SCREAMING.',
  'Nobody phishes on the stairs.',
  'Oh, you made it? Took a while.',
  'Okay. Stairs.',
  'One more.',
  'Outwit. Outplay. Outclimb.',
  'Pool table is on 5. Motivation.',
  'Race you to the top.',
  'See you at the top!',
  'Stairs build character.',
  'Stairs challenge starts NOW.',
  'Stairs Challenge. Or are you scared?',
  'Stretch. Then coffee.',
  'Sure. Why not.',
  'The elevator misses you.',
  'The tribe says: keep going.',
  'Two more. Easy.',
  'Verify the floor number.',
  'Why not the elevator?',
];

/** Every NPC a Room's `npcSlots` actually places. */
function placedNpcs(): NpcDefinition[] {
  return ROOM_DEFINITIONS.flatMap((room) => room.npcSlots).map((slot) => {
    const npc = getNpcDefinition(slot.npcId);
    if (!npc) throw new Error(`no NPC for slot ${slot.npcId}`);
    return npc;
  });
}

/** A small seeded PRNG (mulberry32), so the no-repeat run is reproducible. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('dialogLinePool', () => {
  it('gives every placed NPC at least two lines, except the ones awaiting BA copy', () => {
    const short = placedNpcs()
      .filter((npc) => dialogLinePool(npc).length < 2)
      .map((npc) => npc.id)
      .sort();
    expect(short).toEqual([...AWAITING_BA_LINE].sort());
  });

  it("starts with the NPC's own dialog lines, then its Room bubbles, without duplicates", () => {
    // Jon's `sayJon` shows the same bubble twice per cycle.
    expect(dialogLinePool(NPCS.jon)).toEqual([
      'Welcome to JG. Sunglasses stay on.',
      'Wanna see a magic trick?',
    ]);
  });

  it('leaves out dialogOmit texts but keeps them as Room bubbles', () => {
    expect(dialogLinePool(NPCS.emily)).toEqual(['Ever thought about joining JG?']);
    expect(NPCS.emily.idleLines.map((line) => line.text)).toContain('Joining JG?');
    expect(dialogLinePool(NPCS.jason)).not.toContain('Three questions and you may pass.');
    expect(dialogLinePool(NPCS.jethro)).not.toContain('Act natural. Camera is rolling.');
    // Tony's "corner pocket" bubble is a fragment of his one dialog line.
    expect(dialogLinePool(NPCS.tony)).toEqual(['Eight ball, corner pocket.']);
    expect(NPCS.tony.idleLines.map((line) => line.text)).toContain('corner pocket');
  });

  it("gives Jethro's Team Room 1 appearance his Icebox bubbles too (H4)", () => {
    expect(dialogLinePool(NPCS['jethro-team-room-1'])).toEqual([
      "Act natural. Camera's rolling.",
      'One more for the recap.',
      'Say hackathon!',
    ]);
  });

  it('includes no Stairwell line in any pool (Q16)', () => {
    for (const npc of Object.values(NPCS)) {
      for (const line of dialogLinePool(npc)) {
        expect(STAIRWELL_LINES, `${npc.id}: "${line}"`).not.toContain(line);
      }
    }
  });

  it("keeps each NPC's first dialog line as #36's single line", () => {
    for (const npc of Object.values(NPCS)) {
      expect(dialogLinePool(npc)[0], npc.id).toBe(npc.dialogLines[0]);
    }
  });
});

describe('pickDialogLine', () => {
  it('never repeats a line twice in a row for any placed NPC, and reaches every line', () => {
    const random = seeded(144);
    for (const npc of placedNpcs()) {
      const pool = dialogLinePool(npc);
      if (pool.length < 2) continue;
      const seen = new Set<string>();
      let previous: string | undefined;
      for (let i = 0; i < 500; i += 1) {
        const line = pickDialogLine(pool, previous, random);
        expect(line, npc.id).not.toBe(previous);
        expect(pool, npc.id).toContain(line);
        seen.add(line);
        previous = line;
      }
      expect(seen.size, npc.id).toBe(pool.length);
    }
  });

  it('returns the only line of a one-line pool, even when it was the last one shown', () => {
    expect(pickDialogLine(['Only line.'], undefined)).toBe('Only line.');
    expect(pickDialogLine(['Only line.'], 'Only line.')).toBe('Only line.');
  });

  it('picks from the whole pool when nothing was shown before', () => {
    expect(pickDialogLine(['a', 'b', 'c'], undefined, () => 0)).toBe('a');
    expect(pickDialogLine(['a', 'b', 'c'], undefined, () => 0.99)).toBe('c');
  });

  it('never picks the previous line, whatever the random value', () => {
    expect(pickDialogLine(['a', 'b'], 'a', () => 0)).toBe('b');
    expect(pickDialogLine(['a', 'b'], 'a', () => 0.999)).toBe('b');
  });
});
