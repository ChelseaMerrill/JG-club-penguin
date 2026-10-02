import type { RoomId, Tile } from '../../contracts';

/**
 * The Stairwell's six floors (#51 slice 4, A2), floor 0 (the lobby level) to
 * floor 5 (the JG HQ floor): one Room per Stairwell floor, indexed by its
 * floor number.
 */
export const STAIRWELL_ROOMS = [
  'stairwell-0',
  'stairwell-1',
  'stairwell-2',
  'stairwell-3',
  'stairwell-4',
  'stairwell-5',
] as const satisfies readonly RoomId[];

/** A Stairwell floor's number: 0 is the lobby level, 5 the JG HQ floor. */
export type StairwellFloor = 0 | 1 | 2 | 3 | 4 | 5;

/** Where a Room change came from (S4-D2, RT2-7): a door, the Stairwell keys, the Map, or anything else. */
export type RoomChangeSource = 'door' | 'keys' | 'map' | 'spawn';

/** Whether `roomId` is one of the Stairwell's floors. */
export function isStairwellRoom(roomId: RoomId | null): boolean {
  return stairwellFloorOf(roomId) !== null;
}

/** `roomId`'s Stairwell floor number, or `null` for any other Room. */
export function stairwellFloorOf(roomId: RoomId | null): StairwellFloor | null {
  const index = (STAIRWELL_ROOMS as readonly (RoomId | null)[]).indexOf(roomId);
  return index < 0 ? null : (index as StairwellFloor);
}

/**
 * Whether a move between `from` and `to` is by the stairs (S4-D6): between
 * two Stairwell floors, or between floor 5 and the Roof Deck by its flight
 * up (S4-D11). `room-navigator.ts` shows no Elevator for one.
 */
export function isStairsMove(from: RoomId, to: RoomId): boolean {
  if (isStairwellRoom(from) && isStairwellRoom(to)) return true;
  return (
    (from === 'stairwell-5' && to === 'roof-deck') || (from === 'roof-deck' && to === 'stairwell-5')
  );
}

/**
 * The Stairs Challenge flight a Room change logs (S4-D2, amended by UD-5), or
 * `null` for none:
 * - entering floor 0 is `0`, a (re)start, only from the Map, or through a
 *   door from a Room outside the Stairwell (the Lobby, once #169 adds it);
 * - entering floor k (1-5) is `k` only straight from floor k-1, by a door or
 *   the Stairwell keys;
 * - nothing else logs anything: descending, arriving on floor 5 from Town
 *   Center or the Roof Deck, a Map arrival on floors 1-5, or a spawn.
 */
export function flightFor(
  leaving: RoomId | null,
  entering: RoomId,
  source: RoomChangeSource,
): StairwellFloor | null {
  const floor = stairwellFloorOf(entering);
  if (floor === null) return null;
  if (floor === 0) {
    if (source === 'map') return 0;
    if (source === 'door' && leaving !== null && !isStairwellRoom(leaving)) return 0;
    return null;
  }
  if (source !== 'door' && source !== 'keys') return null;
  return stairwellFloorOf(leaving) === floor - 1 ? floor : null;
}

/**
 * The tile just inside floor 5's ROOF DECK door (S4-D11): its hotspot's
 * bottom-centre (905, 415), on floor 5's grid. #170's STAIRS pill on the
 * Roof Deck lands here.
 */
export const STAIRWELL_ROOF_SILL: Tile = { col: 2, row: 0 };
