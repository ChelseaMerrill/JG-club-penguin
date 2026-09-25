import { describe, expect, it } from 'vitest';
import { MAX_BUBBLE_WIDTH } from '../game/npcs/bubble-geometry';
import { devPit } from '../game/rooms/definitions/dev-pit';
import { tileToScreen } from '../game/rooms/iso';
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

  it("places every human NPC in exactly one Room's npcSlots, matching its own roomId, and no Penguin-kind NPC in any", () => {
    const slotIdsByRoom = new Map(
      ROOM_DEFINITIONS.map((room) => [room.id, room.npcSlots.map((slot) => slot.npcId)]),
    );

    for (const npc of Object.values(NPCS)) {
      const roomsContainingIt = ROOM_DEFINITIONS.filter((room) =>
        (slotIdsByRoom.get(room.id) ?? []).includes(npc.id),
      );
      // Only Players appear as Penguins (owner decision, 2026-09-25): the
      // designs' Penguin-kind NPCs keep their definitions but aren't placed.
      if (npc.kind === 'penguin') {
        expect(roomsContainingIt, `Penguin NPC "${npc.id}"`).toHaveLength(0);
        continue;
      }
      expect(roomsContainingIt, `NPC "${npc.id}"`).toHaveLength(1);
      expect(roomsContainingIt[0]?.id).toBe(npc.roomId);
    }
  });

  it('covers every npcSlot exactly once across every Room (no duplicate npcId)', () => {
    const allSlotIds = ROOM_DEFINITIONS.flatMap((room) => room.npcSlots.map((slot) => slot.npcId));
    const uniqueSlotIds = new Set(allSlotIds);
    expect(allSlotIds).toHaveLength(uniqueSlotIds.size);
  });

  it('sets title: null for every "TITLE TBD" card on design/Characters.dc.html\'s footnote list', () => {
    // The footnote (line ~217): "TITLE TBD cards still need yours: Chelsea,
    // Tom, Dom, Ashley, Emily, Millie, Casey, Ryan, Sam." Emily has no
    // npcSlot in this prototype; the rest (including Tom, who gained a slot
    // in #91's Kitchen resync) are asserted here (#36 round-1 review item 1,
    // blocking).
    const tbdIds: NpcId[] = ['chelsea', 'dom', 'ashley', 'millie', 'casey', 'ryan', 'sam', 'tom'];
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
    expect(NPCS.tom.tagName).toBe('Tom');
  });

  it('tags Chelsea Merrill as "Chelsea" in The Melt, per the #91 Kitchen design\'s own nameplate', () => {
    // A documented exception to The Melt's otherwise-full-name convention:
    // design/Kitchen.dc.html's own nameplate for her literally reads
    // "Chelsea", not "Chelsea Merrill" (#36 round-1 follow-up).
    expect(NPCS.chelsea.tagName).toBe('Chelsea');
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

  it("nudges Tristin's bubble up to clear Millie's nameplate (confirmed overlapping via an e2e screenshot)", () => {
    expect(NPCS.tristin.bubbleOffsetY).toBe(-60);
    expect(NPCS.millie.bubbleOffsetY).toBeUndefined();
  });

  it(
    "keeps Ian/Dom's and Ryan/Steven/Sam's bubble rects from intersecting at the shared " +
      "max bubble width, each rect still spanning its own NPC's tile x (#36 round-2 review " +
      'item 4: replaces a constants-only assertion after #92 moved them close together, ' +
      'confirmed overlapping via an e2e screenshot)',
    () => {
      const halfWidth = MAX_BUBBLE_WIDTH / 2;

      function npcX(id: NpcId): number {
        const slot = devPit.npcSlots.find((s) => s.npcId === id);
        if (!slot) throw new Error(`expected dev-pit to have a "${id}" npcSlot`);
        return tileToScreen(slot.tile, devPit.grid.origin).x;
      }

      function bubbleRect(id: NpcId): { min: number; max: number; npcTileX: number } {
        const tileX = npcX(id);
        const center = tileX + (NPCS[id].bubbleOffsetX ?? 0);
        return { min: center - halfWidth, max: center + halfWidth, npcTileX: tileX };
      }

      const ids: NpcId[] = ['ian', 'dom', 'ryan', 'steven', 'sam'];
      const rects = new Map(ids.map((id) => [id, bubbleRect(id)]));

      for (const id of ids) {
        const rect = rects.get(id)!;
        expect(rect.npcTileX, `${id}'s bubble rect`).toBeGreaterThanOrEqual(rect.min);
        expect(rect.npcTileX, `${id}'s bubble rect`).toBeLessThanOrEqual(rect.max);
      }

      const adjacentPairs: [NpcId, NpcId][] = [
        ['ian', 'dom'],
        ['ryan', 'steven'],
        ['steven', 'sam'],
      ];
      for (const [a, b] of adjacentPairs) {
        const rectA = rects.get(a)!;
        const rectB = rects.get(b)!;
        const noOverlap = rectA.max <= rectB.min || rectB.max <= rectA.min;
        expect(noOverlap, `${a}'s and ${b}'s bubble rects overlap`).toBe(true);
      }
    },
  );

  it("matches design/Room 02 Dev Pit.dc.html's own say-cycle timing for Ian, Steven and Ryan", () => {
    // Traced directly from the (post-#91-resync) design's `<g style=
    // "animation:say 22s ease-in-out -1s infinite;...">`/`-10s` (Ian), `14s`/
    // `-2s,-9s` (Steven), and `20s`/`-2s,-8s,-14s` (Ryan, unchanged by #91)
    // markup (#36 round-1 review item 2, and the round-1 follow-up's Ian/
    // Steven line updates).
    expect(NPCS.ian.idleLines).toEqual([
      { text: 'Who broke CI? Be honest.', periodS: 22, delayS: -1 },
      { text: 'Grab the hammer. CI is red.', periodS: 22, delayS: -10 },
    ]);
    expect(NPCS.steven.idleLines).toEqual([
      { text: 'Boxes and arrows. Mostly arrows.', periodS: 14, delayS: -2 },
      { text: 'This diagram scales. Trust me.', periodS: 14, delayS: -9 },
    ]);
    expect(NPCS.ryan.idleLines).toEqual([
      { text: 'LGTM. One nit.', periodS: 20, delayS: -2 },
      { text: 'This diagram is load-bearing.', periodS: 20, delayS: -8 },
      { text: 'Whiteboard is the real repo.', periodS: 20, delayS: -14 },
    ]);
  });

  it("matches design/Kitchen.dc.html's own say-cycle timing for Tom, Chelsea, Tonya and Jesse", () => {
    // #91's Kitchen design resync replaced The Melt's static bubbles with the
    // same generic `say`-cycling every other Room already uses (#36 round-1
    // follow-up).
    expect(NPCS.tom.idleLines).toEqual([
      { text: 'Fresh pot. Do not touch.', periodS: 16, delayS: -1 },
      { text: 'Coffee run?', periodS: 16, delayS: -6 },
      { text: 'This is my fourth. Fifth. Whatever.', periodS: 16, delayS: -11 },
    ]);
    expect(NPCS.chelsea.idleLines).toEqual([
      { text: 'Flip it NOW.', periodS: 13, delayS: 0 },
      { text: 'GOLDEN. Not before.', periodS: 13, delayS: -4.5 },
      { text: 'Tom, stop eating the burnt ones.', periodS: 13, delayS: -9 },
    ]);
    expect(NPCS.tonya.idleLines).toEqual([
      { text: 'Clean your mug.', periodS: 15, delayS: -5 },
      { text: 'I made the sign. I mean it.', periodS: 15, delayS: -12 },
    ]);
    expect(NPCS.jesse.idleLines).toEqual([
      { text: 'Is this decaf? Be honest.', periodS: 15, delayS: -2 },
      { text: 'Snack drawer is a lie.', periodS: 15, delayS: -9 },
    ]);
  });

  it("gives the Icebox's five NPCs the sheet's names/titles, first-name tags and the design's own say-cycles (#51)", () => {
    // Names/titles from design/Characters.dc.html's cards (Millie is on its
    // TITLE TBD list); tags, lines and timing from design/Room 03 The
    // Icebox.dc.html's own nameplates and `animation:say` bubbles. Millie and
    // Darrin already have a slot in another Room, so their Icebox appearance
    // is its own suffixed NpcId (an NPC lives in exactly one Room); Jason has
    // no slot elsewhere, so the Icebox gets his bare id, `jason` (see
    // `npcs.ts`'s own `NpcId` union comment).
    expect(NPCS['millie-icebox']).toMatchObject({
      name: 'Millie Elliott',
      title: null,
      roomId: 'the-icebox',
      tagName: 'Millie',
      idleLines: [
        { text: 'Team lead question: who owns this?', periodS: 26, delayS: -3 },
        { text: 'Standup was 4 minutes. Record.', periodS: 26, delayS: -12 },
        { text: 'Trivia time. Door stays shut.', periodS: 26, delayS: -20 },
      ],
    });
    expect(NPCS.nicole).toMatchObject({
      name: 'Nicole Roberts',
      title: 'Account Manager',
      roomId: 'the-icebox',
      tagName: 'Nicole',
      dialogLine: "The client loved it. Next one's at 2.",
      idleLines: [
        { text: 'Client call in 5. Shh.', periodS: 15, delayS: -2 },
        { text: 'Account manager mode: on.', periodS: 15, delayS: -7 },
        { text: 'Nope, that is billable.', periodS: 15, delayS: -12 },
      ],
    });
    expect(NPCS.jason).toMatchObject({
      name: 'Jason Jahnel',
      title: 'COO',
      roomId: 'the-icebox',
      tagName: 'Jason',
      dialogLine: 'Answer three and you may pass.',
      idleLines: [
        { text: 'Stairs challenge. You are behind.', periodS: 26, delayS: -1 },
        { text: 'Three questions and you may pass.', periodS: 26, delayS: -10 },
        { text: 'Kickoff in 4:32. Sit.', periodS: 26, delayS: -18 },
      ],
    });
    expect(NPCS.jethro).toMatchObject({
      name: 'Jethro Breuer',
      title: 'Director of Digital Media',
      roomId: 'the-icebox',
      tagName: 'Jethro',
      dialogLine: "Act natural. Camera's rolling.",
      idleLines: [
        { text: 'Act natural. Camera is rolling.', periodS: 21, delayS: -2 },
        { text: 'One more for the recap.', periodS: 21, delayS: -9 },
        { text: 'Say hackathon!', periodS: 21, delayS: -16 },
      ],
    });
    expect(NPCS['darrin-icebox']).toMatchObject({
      name: 'Darrin Jahnel',
      title: 'Founder & CEO',
      roomId: 'the-icebox',
      tagName: 'Darrin',
      dialogLine: 'Show me energy.',
      idleLines: [
        { text: 'Show me energy.', periodS: 15, delayS: -1 },
        { text: 'Serve. Grind. Grow. Inspire.', periodS: 15, delayS: -6 },
        { text: 'Who is demoing first?', periodS: 15, delayS: -11 },
      ],
    });
    for (const id of ['millie-icebox', 'nicole', 'jason', 'jethro', 'darrin-icebox'] as const) {
      expect(NPCS[id].dialog, `${id}'s dialog`).toEqual({ kind: 'line' });
    }
  });

  it('gives Front Desk a single static (periodS: 0) idle line', () => {
    // Front Desk's own bubble in Town Center has no `animation:say` wrapper
    // at all, unlike every other NPC (including, since #91, every The Melt
    // NPC) (#36 round-1 review item 2/3).
    expect(NPCS['front-desk'].idleLines).toHaveLength(1);
    expect(NPCS['front-desk'].idleLines[0]?.periodS).toBe(0);
  });

  it('replaces Chef Chelsea with Tom in The Melt (removed by the #91 Kitchen design resync)', () => {
    expect(getNpcDefinition('chef-chelsea')).toBeUndefined();
    const tom = NPCS.tom;
    expect(tom.name).toBe("Tom O'Neill");
    expect(tom.title).toBeNull();
    expect(tom.roomId).toBe('the-melt');
    expect(tom.kind).toBe('human');
  });

  it("includes Josh Cantor-Stone in Roof Deck with a Snow Cone Stand dialog and the trigger design's own quote/subtitle", () => {
    // #36 round-2 review item 1a: Josh wasn't reachable from #49's own
    // Snow Cone Stand until now.
    const josh = NPCS.josh;
    expect(josh.name).toBe('Josh Cantor-Stone');
    expect(josh.title).toBe('Senior Project Manager');
    expect(josh.roomId).toBe('roof-deck');
    expect(josh.kind).toBe('human');
    expect(josh.dialog).toMatchObject({
      kind: 'minigame',
      minigameId: 'snow-cone-stand',
      actionLabel: 'WORK A SHIFT',
      declineLabel: 'MAYBE LATER',
      triggerLine:
        "Line's getting long and I've got a pumpkin spice to finish. Work a shift at the stand? Tokens are yours. 200 in one shift and I'll throw in a badge.",
      subtitle: 'SNACKS · SENIOR PROJECT MANAGER',
    });
  });

  it("includes Tom O'Neill in The Melt with a Coffee Rush dialog and the trigger design's own quote/subtitle", () => {
    // #36 round-2 review item 1b: Tom wasn't reachable from #50's own
    // Coffee Rush until now.
    const tom = NPCS.tom;
    expect(tom.dialog).toMatchObject({
      kind: 'minigame',
      minigameId: 'coffee-rush',
      actionLabel: 'GRAB THE POT',
      declineLabel: 'JUST HERE FOR COFFEE',
      triggerLine:
        'Fresh pot is on and the line is out the door. You pour, I supervise. Fifteen good cups before the pot runs dry and the Barista badge is yours.',
      subtitle: 'THE MELT · COFFEE RUSH',
    });
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
    const talkers: NpcId[] = ['ian', 'chelsea', 'casey', 'josh', 'tom'];
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
