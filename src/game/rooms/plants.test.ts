// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { roofDeck } from './definitions/roof-deck';
import { renderPlantSvg } from './plants';
import { ROOM_DEFINITIONS } from './registry';

describe('potted plants', () => {
  it('puts five round the Market (owner request, 2026-10-02)', () => {
    expect(roofDeck.plants).toHaveLength(5);
  });

  it('stands every plant on an unwalkable tile of its own, clear of every NPC', () => {
    for (const room of ROOM_DEFINITIONS) {
      for (const tile of room.plants ?? []) {
        const label = `${room.id} plant at ${tile.col},${tile.row}`;
        expect(room.walkable[tile.row]?.[tile.col], label).toBe(false);
        expect(
          room.npcSlots.some((slot) => slot.tile.col === tile.col && slot.tile.row === tile.row),
          label,
        ).toBe(false);
      }
    }
  });

  it('draws a valid SVG in the Rooms palette', () => {
    const svg = renderPlantSvg();
    expect(
      new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror'),
    ).toBeNull();
    expect(svg).toContain('#0C4B5F');
    expect(svg).toContain('#2FB59A');
  });
});
