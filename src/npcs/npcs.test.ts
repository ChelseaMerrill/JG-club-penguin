import { describe, expect, it } from 'vitest';
import { ROOM_DEFINITIONS } from '../game/rooms/registry';
import { getNpcDefinition, NPCS, type NpcId } from './npcs';

describe('NPCS', () => {
  it("has a definition for every npcId in every prototype Room's npcSlots", () => {
    for (const room of ROOM_DEFINITIONS) {
      for (const slot of room.npcSlots) {
        expect(
          getNpcDefinition(slot.npcId),
          `${room.id}'s "${slot.npcId}" slot`,
        ).not.toBeUndefined();
      }
    }
  });

  it("places every NPC in exactly one Room's npcSlots, matching its own roomId", () => {
    const slotIdsByRoom = new Map(
      ROOM_DEFINITIONS.map((room) => [room.id, room.npcSlots.map((slot) => slot.npcId)]),
    );

    for (const npc of Object.values(NPCS)) {
      const roomsContainingIt = ROOM_DEFINITIONS.filter((room) =>
        (slotIdsByRoom.get(room.id) ?? []).includes(npc.id),
      );
      expect(roomsContainingIt, `NPC "${npc.id}"`).toHaveLength(1);
      expect(roomsContainingIt[0]?.id).toBe(npc.roomId);
    }
  });

  it('covers every npcSlot exactly once across the five prototype Rooms (no duplicate npcId)', () => {
    const allSlotIds = ROOM_DEFINITIONS.flatMap((room) => room.npcSlots.map((slot) => slot.npcId));
    const uniqueSlotIds = new Set(allSlotIds);
    expect(allSlotIds).toHaveLength(uniqueSlotIds.size);
  });

  it('sets title: null for every "TITLE TBD" card on design/Characters.dc.html\'s footnote list', () => {
    // The footnote (line ~217): "TITLE TBD cards still need yours: Chelsea,
    // Tom, Dom, Ashley, Emily, Millie, Casey, Ryan, Sam." Tom and Emily have
    // no npcSlot in this prototype; the rest are asserted here (#36 round-1
    // review item 1, blocking).
    const tbdIds: NpcId[] = ['chelsea', 'dom', 'ashley', 'millie', 'casey', 'ryan', 'sam'];
    for (const id of tbdIds) {
      expect(NPCS[id].title, `${id}'s title`).toBeNull();
    }
  });

  it("takes Ann Marie's title from the sheet instead of humans.js's own unresolved placeholder", () => {
    // design/build/humans.js's title field for her is "ROLE TBD · SEND ME
    // THIS ONE", but the character sheet itself already resolved this to
    // "SUBSCRIPTION AI" -- the sheet wins per D1/A3 (#36 round-1 review item 1).
    expect(NPCS['ann-marie'].title).toBe('SUBSCRIPTION AI');
  });

  it("uses the sheet's full names, including surnames humans.js omits", () => {
    // design/build/humans.js names them just "Ryan"/"Sam"; the character
    // sheet's own cards are "RYAN SHENDLER"/"SAM SCHANTZ" (#36 round-1 review
    // item 1).
    expect(NPCS.ryan.name).toBe('Ryan Shendler');
    expect(NPCS.sam.name).toBe('Sam Schantz');
  });

  it('Dev Pit and Roof Deck tag names are first names; Town Center and The Melt are full names', () => {
    expect(NPCS.ian.tagName).toBe('Ian');
    expect(NPCS.dom.tagName).toBe('Dom');
    expect(NPCS.casey.tagName).toBe('Casey');
    expect(NPCS['ann-marie'].tagName).toBe('Ann Marie');
    expect(NPCS.darrin.tagName).toBe('Darrin Jahnel');
    expect(NPCS.sydney.tagName).toBe('Sydney Murauskas');
    expect(NPCS.chelsea.tagName).toBe('Chelsea Merrill');
  });

  it('gives the four Roof Deck vendors a -90px bubbleOffsetX, traced from the design, and no offset elsewhere', () => {
    const vendors: NpcId[] = ['kevin', 'ann-marie', 'josh', 'casey'];
    for (const id of vendors) {
      expect(NPCS[id].bubbleOffsetX, `${id}'s bubbleOffsetX`).toBe(-90);
    }
    const nonVendorsInRoofDeck: NpcId[] = ['millie', 'brandon', 'anthony', 'tristin'];
    for (const id of nonVendorsInRoofDeck) {
      expect(NPCS[id].bubbleOffsetX, `${id}'s bubbleOffsetX`).toBeUndefined();
    }
  });

  it("matches design/Room 02 Dev Pit.dc.html's own say-cycle timing for Ian and Ryan", () => {
    // Traced directly from the design's `<g style="animation:say 12s
    // ease-in-out -1s infinite;...">`/`-7s` (Ian) and `20s`/`-2s,-8s,-14s`
    // (Ryan) markup (#36 round-1 review item 2).
    expect(NPCS.ian.idleLines).toEqual([
      { text: 'Who broke CI? Be honest.', periodS: 12, delayS: -1 },
      { text: 'Green means go home.', periodS: 12, delayS: -7 },
    ]);
    expect(NPCS.ryan.idleLines).toEqual([
      { text: 'LGTM. One nit.', periodS: 20, delayS: -2 },
      { text: 'This diagram is load-bearing.', periodS: 20, delayS: -8 },
      { text: 'Whiteboard is the real repo.', periodS: 20, delayS: -14 },
    ]);
  });

  it('gives Front Desk and every The Melt NPC a single static (periodS: 0) idle line', () => {
    // design/Room 04 Kitchen.dc.html has zero `animation:say` occurrences
    // (#36 round-1 review item 2/3); Front Desk's own bubble in Town Center
    // is the one exception there with no `animation:say` wrapper either.
    const staticIds: NpcId[] = ['front-desk', 'chef-chelsea', 'chelsea', 'tonya', 'jesse'];
    for (const id of staticIds) {
      expect(NPCS[id].idleLines, `${id}'s idleLines`).toHaveLength(1);
      expect(NPCS[id].idleLines[0]?.periodS, `${id}'s periodS`).toBe(0);
    }
  });

  it("includes Ian Ballard in Dev Pit with a Bug Squash dialog and the trigger design's own quote/subtitle", () => {
    const ian = NPCS.ian;
    expect(ian.name).toBe('Ian Ballard');
    expect(ian.title).toBe('VP of Engineering');
    expect(ian.roomId).toBe('dev-pit');
    expect(ian.kind).toBe('human');
    expect(ian.dialog).toMatchObject({
      kind: 'minigame',
      minigameId: 'bug-squash',
      actionLabel: 'GRAB THE HAMMER',
      declineLabel: 'NOT MY TICKET',
      triggerLine:
        "CI is red. Something's crawling through the test suite and I've got a 2 o'clock. Grab the hammer, squash what you find. 500 points and I'll put you on the Exterminator wall.",
      subtitle: 'DEV PIT · VP OF ENGINEERING',
    });
  });

  it("includes Chelsea Merrill in The Melt with a Pancake Flip dialog and the trigger design's own quote/subtitle", () => {
    const chelsea = NPCS.chelsea;
    expect(chelsea.name).toBe('Chelsea Merrill');
    expect(chelsea.roomId).toBe('the-melt');
    expect(chelsea.kind).toBe('human');
    expect(chelsea.dialog).toMatchObject({
      kind: 'minigame',
      minigameId: 'pancake-flip',
      actionLabel: 'GRAB THE SPATULA',
      declineLabel: 'I BURN TOAST',
      triggerLine:
        'Batter is mixed, griddle is hot, and Tom keeps eating the burnt ones. Watch the color and flip on GOLDEN. Twenty on the stack and you are in the Breakfast Club.',
      subtitle: 'THE MELT · PANCAKE FLIP',
    });
  });

  it('includes Casey in Roof Deck with an Igloo Gear stall dialog', () => {
    const casey = NPCS.casey;
    expect(casey.name).toBe('Casey Snow');
    expect(casey.roomId).toBe('roof-deck');
    expect(casey.dialog).toMatchObject({ kind: 'stall', stallId: 'igloo-gear' });
  });

  it('every other NPC has a plain line dialog', () => {
    const talkers: NpcId[] = ['ian', 'chelsea', 'casey'];
    for (const npc of Object.values(NPCS)) {
      if (talkers.includes(npc.id)) continue;
      expect(npc.dialog).toMatchObject({ kind: 'line' });
    }
  });

  it('gives a human NPC a figure spec and a penguin-kind NPC a fixed look', () => {
    for (const npc of Object.values(NPCS)) {
      if (npc.kind === 'human') {
        expect(npc.figure).toBeDefined();
      } else {
        expect(npc.look).toBeDefined();
      }
    }
  });

  it('getNpcDefinition returns undefined for an unknown id', () => {
    expect(getNpcDefinition('not-a-real-npc')).toBeUndefined();
  });
});
