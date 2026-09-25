import type { RoomId } from '../../contracts';

/**
 * A physical floor of 108 State St. `'L'` is the lobby, `'R'` is the Roof
 * Deck's own floor above 5 (#52 D2). Ordered low to high in `FLOOR_ORDER`,
 * never alphabetically (`'R'` sorts before the digits).
 */
export type FloorId = 'L' | '1' | '2' | '3' | '4' | '5' | 'R';

/** Every floor, lobby to roof, in physical (not string) order (#52 D1). */
export const FLOOR_ORDER: readonly FloorId[] = ['L', '1', '2', '3', '4', '5', 'R'];

/**
 * Which floor each Room sits on, or `null` for a Room with no floor at all
 * (#52 D2): the Igloo is the Player's own home, reached from the HUD, not a
 * room inside 108 State St, so there is never an elevator to or from it.
 * Town Center, Dev Pit and The Melt (the Kitchen) are all floor 5 -- "JG HQ
 * IS ON 5" (the Elevator design's own tip text) -- and the Roof Deck is one
 * floor above that. A `Record` over `RoomId` (rather than a `RoomDefinition`
 * field, #52 D1) keeps this data out of `definitions/*.ts`, which #36 and
 * #100 both edit concurrently; the compiler still forces every new `RoomId`
 * to get an entry here.
 */
export const ROOM_FLOORS: Record<RoomId, FloorId | null> = {
  'town-center': '5',
  'dev-pit': '5',
  'the-melt': '5',
  // Reached by a door straight from Town Center, like the Dev Pit and The Melt (#51).
  'the-icebox': '5',
  'roof-deck': 'R',
  igloo: null,
};

/** Whether `a` and `b` are both real (non-null) floors and differ -- the Elevator's own show condition (#52 D3). */
export function floorsDiffer(a: FloorId | null, b: FloorId | null): boolean {
  return a !== null && b !== null && a !== b;
}

/** `'up'` when `to` sits above `from` in `FLOOR_ORDER`, `'down'` otherwise. */
export function direction(from: FloorId, to: FloorId): 'up' | 'down' {
  return FLOOR_ORDER.indexOf(to) > FLOOR_ORDER.indexOf(from) ? 'up' : 'down';
}

/** The Elevator heading's own floor name: `'THE ROOF'` for `'R'`, `'FLOOR <id>'` otherwise (#52 D6). */
export function floorLabel(floor: FloorId): string {
  return floor === 'R' ? 'THE ROOF' : `FLOOR ${floor}`;
}
