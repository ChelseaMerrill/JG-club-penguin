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

  it('renders a "TITLE TBD" design title as a null title', () => {
    // Chelsea Merrill and Ann Marie Berdar are both "ROLE TBD · SEND ME THIS
    // ONE" in design/build/humans.js's title field, the same unresolved
    // placeholder as the design's "TITLE TBD" (#36 D1).
    expect(NPCS.chelsea.title).toBeNull();
    expect(NPCS['ann-marie'].title).toBeNull();
  });

  it('includes Ian Ballard in Dev Pit with a Bug Squash dialog', () => {
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
    });
  });

  it('includes Chelsea Merrill in The Melt with a Pancake Flip dialog', () => {
    const chelsea = NPCS.chelsea;
    expect(chelsea.name).toBe('Chelsea Merrill');
    expect(chelsea.roomId).toBe('the-melt');
    expect(chelsea.kind).toBe('human');
    expect(chelsea.dialog).toMatchObject({
      kind: 'minigame',
      minigameId: 'pancake-flip',
      actionLabel: 'GRAB THE SPATULA',
      declineLabel: 'I BURN TOAST',
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
