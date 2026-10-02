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
  'roof-deck': 'R',
  igloo: null,
  // #51: THE ICEBOX is on the JG HQ floor with the other office Rooms.
  'the-icebox': '5',
  // #51: the Hallway, Team Rooms 1-4 and the Bathroom are on the JG HQ floor
  // with the other office Rooms.
  'office-hallway': '5',
  'team-room-1': '5',
  'team-room-2': '5',
  'team-room-3': '5',
  'team-room-4': '5',
  bathroom: '5',
  // #51 slice 3: THE MULLET is the JG HQ floor's mezzanine.
  'the-mullet': '5',
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

/** How long the Elevator ride takes per floor crossed: 1.2s (#163). */
export const MS_PER_FLOOR = 1200;

/** How many floors a ride from `from` to `to` crosses: the absolute `FLOOR_ORDER` distance (#163). */
export function floorsCrossed(from: FloorId, to: FloorId): number {
  return Math.abs(FLOOR_ORDER.indexOf(to) - FLOOR_ORDER.indexOf(from));
}

/** The ride's length: `msPerFloor` for each floor crossed (5 to R 1.2s, L to 5 6s, L to R 7.2s; #163). */
export function rideDurationMs(from: FloorId, to: FloorId, msPerFloor = MS_PER_FLOOR): number {
  return floorsCrossed(from, to) * msPerFloor;
}

/** The floors strictly between `from` and `to`, in travel order (#163). */
export function floorsBetween(from: FloorId, to: FloorId): FloorId[] {
  const fromIndex = FLOOR_ORDER.indexOf(from);
  const toIndex = FLOOR_ORDER.indexOf(to);
  const step = toIndex > fromIndex ? 1 : -1;
  const between: FloorId[] = [];
  for (let i = fromIndex + step; i !== toIndex && i >= 0 && i < FLOOR_ORDER.length; i += step) {
    between.push(FLOOR_ORDER[i]!);
  }
  return between;
}
