import { describe, expect, it } from 'vitest';
import { estimateBubbleSize } from '../game/npcs/bubble-geometry';
import { bubbleSchedule } from '../game/npcs/bubble-schedule';
import { estimateNameplateWidth, npcLayout } from '../game/npcs/npc-layout';
import { devPit } from '../game/rooms/definitions/dev-pit';
import { npcSlotPoint } from '../game/rooms/iso';
import { ROOM_DEFINITIONS } from '../game/rooms/registry';
import { getNpcDefinition, NPCS, type NpcBubbleLine, type NpcId } from './npcs';

/** Whether two idle lines are ever shown at once (a `periodS: 0` line always is). */
function visibleAtTheSameTime(a: NpcBubbleLine, b: NpcBubbleLine): boolean {
  if (a.periodS === 0 || b.periodS === 0) return true;
  const windowsOf = (line: NpcBubbleLine, horizonMs: number): [number, number][] => {
    const { firstShowMs, visibleMs, periodMs } = bubbleSchedule(line);
    const windows: [number, number][] = [];
    for (let start = firstShowMs - periodMs; start < horizonMs; start += periodMs) {
      windows.push([start, start + visibleMs]);
    }
    return windows;
  };
  // Both cycles line up again after their least common multiple.
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  const pa = Math.round(a.periodS * 1000);
  const pb = Math.round(b.periodS * 1000);
  const horizonMs = (pa / gcd(pa, pb)) * pb;
  const wa = windowsOf(a, horizonMs);
  const wb = windowsOf(b, horizonMs);
  return wa.some(([s1, e1]) => wb.some(([s2, e2]) => s1 < e2 && s2 < e1));
}

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
    // Dom removed from the Dev Pit's own `npcSlots` (owner request,
    // 2026-09-25, Track D), but his `NpcDefinition` stays (other tests here
    // still reference his name/title/figure) -- so he's an intentional
    // exception to "every NPC has exactly one Room slot".
    // Anthony too (#146): the Phishing Quiz places him at the door he guards,
    // one shared Room at a time, so no Room lists him. Ryan and Sam likewise
    // left the Dev Pit (owner request, 2026-09-30); Team Room 4 has its own.
    // Jon and Sydney left Town Center (owner request, 2026-10-02); the Mullet
    // and Team Room 3 have their own. Steven left the Dev Pit too; the
    // Characters sheet puts him in the Remote Lounge, which isn't built yet.
    // Millie, Jason and Darrin left the Icebox (owner request, 2026-10-02).
    const NO_LONGER_PLACED: NpcId[] = [
      'dom',
      'anthony',
      'ryan',
      'sam',
      'jon',
      'sydney',
      'steven',
      'millie-icebox',
      'jason',
      'darrin-icebox',
      // Millie and Brandon left the Market (owner request, 2026-10-02).
      'millie',
      'brandon',
    ];

    for (const npc of Object.values(NPCS)) {
      if (NO_LONGER_PLACED.includes(npc.id)) continue;
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

  it('no longer places Dom in the Dev Pit (owner request, 2026-09-25, Track D)', () => {
    expect(devPit.npcSlots.some((slot) => slot.npcId === 'dom')).toBe(false);
    expect(NPCS.dom).toBeDefined();
  });

  it('has no Room slot for Anthony, the door guard, but keeps his definition (#146)', () => {
    expect(ROOM_DEFINITIONS.some((room) => room.npcSlots.some((s) => s.npcId === 'anthony'))).toBe(
      false,
    );
    expect(NPCS.anthony).toMatchObject({
      name: 'Anthony Conway',
      title: 'Director of IT',
      dialog: { kind: 'phishing-quiz', subtitle: 'DOOR BOSS · PHISHING QUIZ' },
    });
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
    // #51 gives Emily her first slot (the Hallway); her card is on that list.
    const tbdIds: NpcId[] = [
      'chelsea',
      'dom',
      'ashley',
      'millie',
      'casey',
      'ryan',
      'sam',
      'tom',
      'emily',
    ];
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

  it("draws the Team Rooms' and the Mullet's Humans as their Room designs do (#149)", () => {
    // Dark nameplates: every Team Room and Mullet NPC except Tony.
    const dark = Object.values(NPCS)
      .filter((npc) => npc.nameplate === 'dark')
      .map((npc) => npc.id)
      .sort();
    expect(dark).toEqual(
      [
        'jethro-team-room-1',
        'dom-team-room-1',
        'ian-team-room-2',
        'millie-team-room-3',
        'casey-team-room-3',
        'sydney-team-room-3',
        'michael',
        'sam-team-room-4',
        'ryan-team-room-4',
        'jason-mullet',
        'nicole-mullet',
        'ann-marie-mullet',
        'jory-mullet',
        'ashley-mullet',
        'jon-mullet',
        'brandon-mullet',
        'dom-mullet',
      ].sort(),
    );
    expect(NPCS.tony.nameplate).toBeUndefined();

    const scales: [NpcId, number][] = [
      ['jethro-team-room-1', 70 / 120],
      ['dom-team-room-1', 70 / 120],
      ['ian-team-room-2', 70 / 120],
      ['michael', 0.5],
      ['sam-team-room-4', 0.5],
      ['ryan-team-room-4', 0.5],
      ['jason-mullet', 0.5],
      ['nicole-mullet', 0.5],
      ['ann-marie-mullet', 0.5],
      ['jory-mullet', 0.58],
      ['ashley-mullet', 0.58],
      ['jon-mullet', 0.58],
      ['brandon-mullet', 0.58],
      ['dom-mullet', 0.58],
    ];
    for (const [id, scale] of scales) expect(NPCS[id].scale, id).toBeCloseTo(scale, 10);
    expect(NPCS.tony.scale).toBeUndefined();

    const offsets: [NpcId, { x?: number; y?: number }][] = [
      ['millie-team-room-3', { y: -3 }],
      ['casey-team-room-3', { y: 9 }],
      ['sydney-team-room-3', { y: 7 }],
      ['sam-team-room-4', { y: -9.5 }],
      ['jason-mullet', { x: -55.5, y: 15 }],
      ['jon-mullet', { y: 19 }],
      ['brandon-mullet', { y: 19 }],
      ['nicole-mullet', { y: -5 }],
      ['ann-marie-mullet', { y: -5 }],
    ];
    for (const [id, offset] of offsets) expect(NPCS[id].nameplateOffset, id).toEqual(offset);

    expect(NPCS['sydney-team-room-3'].bubbleOffsetY).toBe(-8);
    expect(NPCS.michael.bubbleOffsetY).toBe(-23);
    expect(NPCS['ashley-mullet'].bubbleOffsetY).toBe(-7.6);

    const michael = NPCS.michael;
    const tony = NPCS.tony;
    if (michael.kind !== 'human' || tony.kind !== 'human') throw new Error('expected Humans');
    expect(michael.figure.beard).toBe('stubble');
    expect(tony.figure).toMatchObject({ style: 'slick', collar: 'henley' });
  });

  it(
    "never shows an NPC's bubble over another NPC's bubble or nameplate while every NPC " +
      'stands at its rest slot: any two lines whose visible windows overlap in time have ' +
      "pill rects that don't intersect, and no line's pill ever covers another NPC's " +
      "nameplate (#113: rest slots only; a roaming NPC's passing overlaps come from the " +
      "designs' own paths)",
    () => {
      interface Rect {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }
      const intersects = (a: Rect, b: Rect): boolean =>
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const collisions: string[] = [];
      for (const room of ROOM_DEFINITIONS) {
        // Penguin-kind NPCs are being removed from the Rooms (only Players
        // appear as Penguins, PR #133), so they're left out.
        const placed = room.npcSlots.flatMap((slot) => {
          const npc = getNpcDefinition(slot.npcId)!;
          if (npc.kind === 'penguin') return [];
          // Where it is drawn: its tile's point plus any slot `offset`.
          return [{ npc, feet: npcSlotPoint(slot, room.grid.origin) }];
        });
        const nameplates = placed.map(({ npc, feet }) => {
          const layout = npcLayout(npc);
          const width = estimateNameplateWidth(npc.tagName);
          return {
            npcId: npc.id,
            tagName: npc.tagName,
            rect: {
              left: feet.x + layout.nameplateCenterX - width / 2,
              right: feet.x + layout.nameplateCenterX + width / 2,
              top: feet.y + layout.nameplateTopY,
              bottom: feet.y + layout.nameplateBottomY,
            },
          };
        });
        const shown = placed.flatMap(({ npc, feet }) => {
          const bottom = feet.y + npcLayout(npc).bubbleBottomY + (npc.bubbleOffsetY ?? 0);
          const centerX = feet.x + (npc.bubbleOffsetX ?? 0);
          return npc.idleLines.map((line) => {
            const size = estimateBubbleSize(line.text);
            return {
              npcId: npc.id,
              line,
              rect: {
                left: centerX - size.width / 2,
                right: centerX + size.width / 2,
                top: bottom - size.height,
                bottom,
              },
            };
          });
        });
        for (let i = 0; i < shown.length; i += 1) {
          const a = shown[i]!;
          for (let j = i + 1; j < shown.length; j += 1) {
            const b = shown[j]!;
            if (a.npcId === b.npcId) continue;
            if (intersects(a.rect, b.rect) && visibleAtTheSameTime(a.line, b.line)) {
              collisions.push(
                `${room.id}: ${a.npcId} "${a.line.text}" x ${b.npcId} "${b.line.text}"`,
              );
            }
          }
          for (const plate of nameplates) {
            if (plate.npcId === a.npcId) continue;
            if (intersects(a.rect, plate.rect)) {
              collisions.push(
                `${room.id}: ${a.npcId} "${a.line.text}" x ${plate.npcId}'s nameplate "${plate.tagName}"`,
              );
            }
          }
        }
      }
      // Overlaps the Room design itself draws at rest, kept as designed: the
      // Mullet's Jory stands where the design starts her lap (her slot
      // `offset`, #189), where her bubble crosses Brandon's nameplate. She
      // walks off it at once. (Dev Pit's old Steven-over-Ryan overlap went
      // when Ryan left, 2026-09-30; the Mullet's Dom-over-Nicole one went when
      // the Mullet's NPCs took their design scales and nameplate offsets, #149.)
      // The Stairwell's floor-2 and floor-4 guests too (#51 slice 4):
      // design/Stairwell.dc.html draws Sydney's "Stairs build character." at
      // x 670.6 and Jory's two bubbles at x 669.2 and 665.4, each over the
      // right end of Jason's nameplate (x 564-676, y 487.4-507.4).
      const drawnByTheDesign: string[] = [
        `the-mullet: jory-mullet "Tribe has spoken." x brandon-mullet's nameplate "Brandon"`,
        `stairwell-2: sydney-stairwell-2 "Stairs build character." x jason-stairwell-2's nameplate "Jason Jahnel"`,
        `stairwell-4: jory-stairwell-4 "Outwit. Outplay. Outclimb." x jason-stairwell-4's nameplate "Jason Jahnel"`,
        `stairwell-4: jory-stairwell-4 "The tribe says: keep going." x jason-stairwell-4's nameplate "Jason Jahnel"`,
      ];
      expect(collisions.filter((collision) => !drawnByTheDesign.includes(collision))).toEqual([]);
      // Each allowed overlap still happens, so a stale entry can't linger.
      for (const allowed of drawnByTheDesign) expect(collisions).toContain(allowed);
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
      dialogLines: ["The client loved it. Next one's at 2."],
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
      dialogLines: ['Answer three and you may pass.'],
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
      dialogLines: ["Act natural. Camera's rolling.", 'One more for the recap.', 'Say hackathon!'],
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
      dialogLines: ['Show me energy.'],
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

  it("gives the Hallway's, Team Rooms 1-4's and the Bathroom's NPCs the sheet's names/titles and their Room design's own nameplates and lines (#51)", () => {
    // Names/titles from design/Characters.dc.html (Emily, Dom, Millie, Casey,
    // Ryan and Sam are on its TITLE TBD list); tags and idle lines verbatim
    // from each Room design's nameplates and bubbles. Static bubbles are
    // `periodS: 0`; Team Room 1's `jtalk` (4s, shown 38%-76%) and
    // `domtalk` (6s, shown 39%-66%) and Team Room 3's `rats` (10s, shown
    // 80%-98%) carry their own windows (owner request, 2026-09-30, Track D).
    // Repeat appearances get a `-<room>` suffixed id.
    expect(NPCS.emily).toMatchObject({
      kind: 'human',
      name: 'Emily Smith',
      title: null,
      roomId: 'office-hallway',
      tagName: 'Emily Smith',
      dialogLines: ['Ever thought about joining JG?'],
      idleLines: [{ text: 'Joining JG?', periodS: 0, delayS: 0 }],
    });
    expect(NPCS['anthony-hallway']).toMatchObject({
      name: 'Anthony Conway',
      title: 'Director of IT',
      roomId: 'office-hallway',
      tagName: 'Anthony Conway',
      idleLines: [{ text: 'Is this link safe?', periodS: 0, delayS: 0 }],
    });
    expect(NPCS['jethro-team-room-1']).toMatchObject({
      name: 'Jethro Breuer',
      title: 'Director of Digital Media',
      roomId: 'team-room-1',
      tagName: 'Jethro',
      idleLines: [
        { text: "Act natural. Camera's rolling.", periodS: 4, delayS: 0, window: [0.38, 0.76] },
      ],
    });
    expect(NPCS['dom-team-room-1']).toMatchObject({
      name: 'Dom Favata',
      title: null,
      roomId: 'team-room-1',
      tagName: 'Dom',
      idleLines: [
        { text: 'you gotta be faster than that', periodS: 6, delayS: 0, window: [0.39, 0.66] },
      ],
    });
    expect(NPCS['ian-team-room-2']).toMatchObject({
      name: 'Ian Ballard',
      title: 'VP of Engineering',
      roomId: 'team-room-2',
      tagName: 'Ian',
      idleLines: [{ text: 'have you installed the atlas plugin yet?', periodS: 0, delayS: 0 }],
      // The design draws his "TALK · BUG SQUASH" prompt under him.
      dialog: { kind: 'minigame', minigameId: 'bug-squash' },
    });
    expect(NPCS['millie-team-room-3']).toMatchObject({
      name: 'Millie Elliott',
      title: null,
      roomId: 'team-room-3',
      tagName: 'Millie',
      idleLines: [],
    });
    expect(NPCS['casey-team-room-3']).toMatchObject({
      name: 'Casey Snow',
      title: null,
      roomId: 'team-room-3',
      tagName: 'Casey',
      // `rats 10s linear infinite`, no delay, fully shown 80%-98%.
      idleLines: [{ text: 'RATS', periodS: 10, delayS: 0, window: [0.8, 0.98] }],
      // The Igloo Gear stall is the Roof Deck's; here she is just gaming.
      dialog: { kind: 'line' },
    });
    expect(NPCS['sydney-team-room-3']).toMatchObject({
      name: 'Sydney Murauskas',
      title: 'Technical Recruiter',
      roomId: 'team-room-3',
      tagName: 'Sydney',
      idleLines: [{ text: 'So, open to new roles?', periodS: 0, delayS: 0 }],
    });
    expect(NPCS.michael).toMatchObject({
      kind: 'human',
      name: 'Michael Prete',
      title: 'IT Associate',
      roomId: 'team-room-4',
      tagName: 'Michael',
      dialogLines: ['3-0. Again.'],
      idleLines: [{ text: 'I challenge you to a Beyblade battle!', periodS: 0, delayS: 0 }],
    });
    // Sam's and Ryan's nameplates are their full names, not the Room
    // design's "Sam"/"Ryan" (owner request, 2026-09-30, Track D).
    expect(NPCS['sam-team-room-4']).toMatchObject({
      name: 'Sam Schantz',
      title: null,
      roomId: 'team-room-4',
      tagName: 'Sam Schantz',
      idleLines: [],
    });
    expect(NPCS['ryan-team-room-4']).toMatchObject({
      name: 'Ryan Shendler',
      title: null,
      roomId: 'team-room-4',
      tagName: 'Ryan Shendler',
      idleLines: [],
    });
  });

  it("gives the Mullet's nine NPCs the sheet's names/titles and the design's own nameplates and lines (#51 slice 3)", () => {
    // Names/titles from design/Characters.dc.html (Dom and Ashley are on its
    // TITLE TBD list); tags and idle lines verbatim from design/The
    // Mullet.dc.html. Its discrete SMIL bubbles keep their own windows:
    // Ashley's on an 18 s cycle, Dom's either side of a 9.4 s cycle's start.
    // Tony has no slot anywhere else, so he gets a bare id; the other eight
    // are repeat appearances with a `-mullet` suffix.
    const expected: Partial<Record<NpcId, Record<string, unknown>>> = {
      'jason-mullet': { name: 'Jason Jahnel', title: 'COO', tagName: 'Jason', idleLines: [] },
      'nicole-mullet': {
        name: 'Nicole Roberts',
        title: 'Account Manager',
        tagName: 'Nicole',
        idleLines: [{ text: 'hehe', periodS: 3, delayS: 0, window: [0.05, 0.35] }],
      },
      'ann-marie-mullet': {
        name: 'Ann Marie Berdar',
        title: 'SUBSCRIPTION AI',
        tagName: 'Ann Marie',
        idleLines: [{ text: 'haha', periodS: 3, delayS: -1.5, window: [0.05, 0.35] }],
      },
      'jory-mullet': {
        name: 'Jory Hutchins',
        title: 'Director of Career Development',
        tagName: 'Jory',
        idleLines: [{ text: 'Tribe has spoken.', periodS: 0, delayS: 0 }],
      },
      'ashley-mullet': {
        name: 'Ashley Schuliger',
        title: null,
        tagName: 'Ashley',
        idleLines: [
          { text: 'Clucknelius coming at you!', periodS: 18, window: [0.0444, 0.1667] },
          { text: 'Clucknelius coming at you!', periodS: 18, window: [0.4111, 0.5333] },
          { text: 'Clucknelius coming at you!', periodS: 18, window: [0.7056, 0.8278] },
        ],
      },
      tony: {
        name: 'Tony Mercadante',
        title: 'Project Manager',
        tagName: 'Tony Mercadante',
        dialogLines: ['Eight ball, corner pocket.'],
        idleLines: [{ text: 'corner pocket', periodS: 0, delayS: 0 }],
      },
      'jon-mullet': { name: 'Jon Keller', title: 'President', tagName: 'Jon', idleLines: [] },
      'brandon-mullet': {
        name: 'Brandon Badgett',
        title: 'Senior Vice President',
        tagName: 'Brandon',
        idleLines: [],
      },
      'dom-mullet': {
        name: 'Dom Favata',
        title: null,
        tagName: 'Dom',
        idleLines: [
          { text: 'Undefeated. I always win.', periodS: 9.4, window: [0, 0.1] },
          { text: 'Undefeated. I always win.', periodS: 9.4, window: [0.88, 1] },
        ],
      },
    };
    for (const [id, fields] of Object.entries(expected)) {
      expect(NPCS[id as NpcId], id).toMatchObject({
        kind: 'human',
        roomId: 'the-mullet',
        dialog: { kind: 'line' },
        ...fields,
      });
    }
  });

  it("gives the Stairwell's 18 NPCs the sheet's names/titles and each floor's own nameplates and lines (#51 slice 4)", () => {
    // Names/titles from design/Characters.dc.html (Dom, Ashley and Casey are
    // on its TITLE TBD list); tags and lines verbatim from each floor's Stage
    // of design/Stairwell.dc.html, on its own `say` cycle: Dom 9 s (-1 s,
    // -5 s), Jason 14 s (-1 s, -8 s) and the guest 18 s (-4 s, -13 s). Each
    // NPC's two bubbles are its two dialog lines (S4-D8).
    const floors: [string, string][][] = [
      [
        ['Stairs challenge starts NOW.', 'Follow me!'],
        ['Elevator is broken. It is not. Take the stairs.', 'Five floors. I will be watching.'],
        ['Nobody phishes on the stairs.', 'Verify the floor number.'],
      ],
      [
        ['Floor 1. Warm-up done.', 'See you at the top!'],
        ['Floor 1. That is one. Out of five.', 'Stairs Challenge. Or are you scared?'],
        ['Headphones on. Legs on.', 'Beat drops on floor 3.'],
      ],
      [
        ['Floor 2. You got this.', 'My Fitbit is SCREAMING.'],
        ['Floor 2. My grandma climbs faster.', 'Log it or it did not happen.'],
        ['Stairs build character.', 'Looking strong!'],
      ],
      [
        ['Halfway! Kind of!', 'Race you to the top.'],
        ['Halfway. Your Fitbit is embarrassed.', 'Dom has lapped you twice.'],
        ['Pool table is on 5. Motivation.', 'Two more. Easy.'],
      ],
      [
        ['Elevator is for quitters!', 'Legs feeling it yet?'],
        ['Floor 4. Breathing hard already?', 'The elevator misses you.'],
        ['Outwit. Outplay. Outclimb.', 'The tribe says: keep going.'],
      ],
      [
        ['Cardio is free!', 'Five floors. One legend.'],
        ['Oh, you made it? Took a while.', 'Dom beat you by four minutes.'],
        ['Made it! Chicken did too.', 'Stretch. Then coffee.'],
      ],
    ].map((floor) => floor.map((pair) => pair as [string, string]));
    const guests: [NpcId, string, string, string | null, NpcId][] = [
      ['anthony-stairwell-0', 'Anthony', 'Anthony Conway', 'Director of IT', 'anthony-hallway'],
      ['casey-stairwell-1', 'Casey', 'Casey Snow', null, 'casey'],
      ['sydney-stairwell-2', 'Sydney', 'Sydney Murauskas', 'Technical Recruiter', 'sydney'],
      ['tony-stairwell-3', 'Tony', 'Tony Mercadante', 'Project Manager', 'tony'],
      ['jory-stairwell-4', 'Jory', 'Jory Hutchins', 'Director of Career Development', 'jory'],
      ['ashley-stairwell-5', 'Ashley', 'Ashley Schuliger', null, 'ashley'],
    ];
    const lines = (
      [first, second]: [string, string],
      periodS: number,
      delays: [number, number],
    ) => ({
      dialogLines: [first, second],
      idleLines: [
        { text: first, periodS, delayS: delays[0] },
        { text: second, periodS, delayS: delays[1] },
      ],
    });
    const figureOf = (id: NpcId) => {
      const npc = NPCS[id];
      if (npc.kind !== 'human') throw new Error(`expected ${id} to be a Human NPC`);
      return npc.figure;
    };

    floors.forEach(([dom, jason, guest], floor) => {
      const roomId = `stairwell-${floor}`;
      const domId = `dom-stairwell-${floor}` as NpcId;
      const jasonId = `jason-stairwell-${floor}` as NpcId;
      const [guestId, guestTag, guestName, guestTitle, guestElsewhere] = guests[floor]!;
      const common = { kind: 'human', roomId, dialog: { kind: 'line' } };
      expect(NPCS[domId], domId).toMatchObject({
        ...common,
        name: 'Dom Favata',
        title: null,
        tagName: 'Dom',
        ...lines(dom, 9, [-1, -5]),
      });
      expect(NPCS[jasonId], jasonId).toMatchObject({
        ...common,
        name: 'Jason Jahnel',
        title: 'COO',
        tagName: 'Jason Jahnel',
        still: true,
        ...lines(jason, 14, [-1, -8]),
      });
      expect(NPCS[guestId], guestId).toMatchObject({
        ...common,
        name: guestName,
        title: guestTitle,
        tagName: guestTag,
        ...lines(guest, 18, [-4, -13]),
      });
      // Each is drawn as the same person elsewhere is (the slice-2 rule):
      // humans.js's Dom, not the running kit Team Room 1 and the Mullet add.
      expect(figureOf(domId)).toBe(figureOf('dom'));
      expect(figureOf(jasonId)).toBe(figureOf('jason'));
      expect(figureOf(guestId)).toBe(figureOf(guestElsewhere));
      // The design draws every Stairwell figure at the Human default, 0.62.
      for (const id of [domId, jasonId, guestId]) expect(NPCS[id].scale, id).toBeUndefined();
    });
  });

  it("draws each repeat appearance with the same figure and dialog line as the person's first Room (#51)", () => {
    const repeats: [NpcId, NpcId][] = [
      ['ian-team-room-2', 'ian'],
      ['millie-team-room-3', 'millie'],
      // #51 slice 3: the Mullet.
      ['ann-marie-mullet', 'ann-marie'],
      ['jory-mullet', 'jory'],
      // Both Dom's running-kit appearances (owner request, 2026-09-30).
      ['dom-mullet', 'dom-team-room-1'],
    ];
    for (const [repeat, first] of repeats) {
      const again = NPCS[repeat];
      const original = NPCS[first];
      if (again.kind !== 'human' || original.kind !== 'human') {
        throw new Error(`expected ${repeat} and ${first} to be Human NPCs`);
      }
      expect(again.figure, repeat).toBe(original.figure);
      expect(again.dialogLines[0], repeat).toBe(original.dialogLines[0]);
    }
  });

  it("differs from a person's other appearances only by what that Room's design adds (#113: the Room design wins)", () => {
    // Roof Deck's Anthony fishes instead of holding his laptop; the Icebox's
    // Jethro wears a chest camera rig; Dev Pit's Ryan and Sam raise a
    // whiteboard marker. Their other Rooms' designs draw none of that.
    const overrides: [NpcId, NpcId, Record<string, unknown>][] = [
      ['anthony', 'anthony-hallway', { prop: 'fishingRod' }],
      ['ryan', 'ryan-team-room-4', { marker: expect.anything() }],
      ['sam', 'sam-team-room-4', { marker: expect.anything() }],
      // Town Center's Jon holds playing cards and the Icebox's Nicole has a
      // laptop on her lap; the Mullet's design draws neither (#51 slice 3).
      // The Mullet's Jon and Brandon hold a ping-pong paddle at rest (#149).
      ['jon', 'jon-mullet', { cards: true, paddle: undefined }],
      ['brandon-mullet', 'brandon', { paddle: 'left' }],
      // The Mullet's design draws Ashley's hair as curly volume (#149).
      ['ashley-mullet', 'ashley', { style: 'curlyVolume' }],
      ['nicole', 'nicole-mullet', { seated: 'laptop' }],
      // Team Room 3's Casey holds an open laptop and its Sydney wears a
      // headset; the Roof Deck's and Town Center's designs draw neither.
      ['casey-team-room-3', 'casey', { prop: 'openLaptop' }],
      ['sydney-team-room-3', 'sydney', { headset: true }],
      // The Mullet's Jason plays its arcade machine, his hands drawn by his
      // motion's layers (owner request, 2026-10-01, Track D).
      ['jason-mullet', 'jason', { arcadeHands: 'resting' }],
    ];
    for (const [roomOwn, other, added] of overrides) {
      const withOverride = NPCS[roomOwn];
      const plain = NPCS[other];
      if (withOverride.kind !== 'human' || plain.kind !== 'human') {
        throw new Error(`expected ${roomOwn} and ${other} to be Human NPCs`);
      }
      expect(withOverride.figure, roomOwn).toEqual({ ...plain.figure, ...added });
      expect(withOverride.dialogLines[0], roomOwn).toBe(plain.dialogLines[0]);
    }

    // Team Room 1's design wins for its own two NPCs (owner request,
    // 2026-09-30, Track D): Dom runs in a kit that replaces his shirt and
    // collar, and Jethro's hands and camera are its `jdown` camera-raise
    // group. The Icebox's Jethro takes photos the same way (owner request,
    // 2026-10-01, Track D), so Jethro has no plain appearance left; both keep
    // the same sheet spec underneath.
    const [dom, domTeamRoom1, jethro, jethroTeamRoom1] = (
      ['dom', 'dom-team-room-1', 'jethro', 'jethro-team-room-1'] as const
    ).map((id) => {
      const npc = NPCS[id];
      if (npc.kind !== 'human') throw new Error(`expected ${id} to be a Human NPC`);
      return npc;
    });
    expect(domTeamRoom1.figure).toEqual({
      ...dom.figure,
      top: undefined,
      collar: undefined,
      runner: true,
    });
    expect(domTeamRoom1.dialogLines[0]).toBe(dom.dialogLines[0]);
    expect(jethro.figure.cameraRig).toBeUndefined();
    expect(jethroTeamRoom1.figure).toEqual(jethro.figure);
    expect(jethroTeamRoom1.figure).toMatchObject({ prop: undefined, cameraRaise: 'lowered' });
    expect(jethroTeamRoom1.dialogLines[0]).toBe(jethro.dialogLines[0]);
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

  it("includes Michael Prete in Team Room 4 with a Beystadium dialog and the trigger design's own quote/subtitle (#121)", () => {
    const michael = NPCS.michael;
    expect(michael.name).toBe('Michael Prete');
    expect(michael.roomId).toBe('team-room-4');
    expect(michael.idleLines).toEqual([
      expect.objectContaining({ text: 'I challenge you to a Beyblade battle!' }),
    ]);
    expect(michael.dialog).toEqual({
      kind: 'minigame',
      minigameId: 'beystadium',
      actionLabel: 'LET IT RIP',
      declineLabel: 'BACK AWAY SLOWLY',
      triggerLine:
        "You walked into the Pod. That's a challenge. Pick a Bey, rip the launcher, and knock mine out of the stadium. Best of three. I'm 3-0 against the whole office. 3-0 against you next.",
      subtitle: 'THE POD · IT ASSOCIATE · BEYSTADIUM CHAMP',
    });
  });

  it('includes Casey in Roof Deck with an Igloo Gear stall dialog', () => {
    const casey = NPCS.casey;
    expect(casey.name).toBe('Casey Snow');
    expect(casey.roomId).toBe('roof-deck');
    expect(casey.dialog).toMatchObject({ kind: 'stall', stallId: 'igloo-gear' });
  });

  it('every other NPC has a plain line dialog', () => {
    const talkers: NpcId[] = [
      'ian',
      'ian-team-room-2',
      'chelsea',
      'casey',
      'josh',
      'tom',
      'michael',
      'anthony',
    ];
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
