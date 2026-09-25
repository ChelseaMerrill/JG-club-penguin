import { type RoomId } from '../contracts';
import { hasRoomDefinition } from '../game/rooms/registry';

/**
 * One card from `design/Club JenGuin Map.dc.html`'s "JG HQ MAP" grid,
 * reproduced in the design's own order (#33 D1, revision 2).
 */
export interface MapRoomTile {
  /** The design's card number, e.g. `'01'` or `'15'`. Not itself a `RoomId`: several numbers have no `RoomDefinition` yet. */
  number: string;
  /** The design's Bumbastika "NN · NAME" label, kept verbatim (Q3). */
  label: string;
  /** The design's Anton subtitle, kept verbatim (Q3). */
  subtitle: string;
  /** The Room this tile navigates to, or `null` for a design card with no `RoomDefinition` built yet. */
  roomId: RoomId | null;
}

/**
 * The design's 16 numbered cards, minus 05B (the day variant of 05 THE
 * MARKET / Roof Deck) and 14 ELEVATOR (a loading screen, stretch #52): 14
 * tiles, in the design's own document order. `00 · TOP WORKPLACES` is a
 * decorative plaque, not one of the design's "16 ROOMS", and was never a
 * candidate tile.
 */
export const MAP_ROOMS: readonly MapRoomTile[] = [
  {
    number: '01',
    label: '01 · TOWN CENTER',
    subtitle: 'TOWN CENTER (LOBBY)',
    roomId: 'town-center',
  },
  { number: '02', label: '02 · DEV PIT', subtitle: 'OPEN DESKS', roomId: 'dev-pit' },
  { number: '03', label: '03 · THE ICEBOX', subtitle: 'CONFERENCE · 604 SF', roomId: null },
  {
    number: '04',
    label: '04 · THE KITCHEN',
    subtitle: 'KITCHEN (BREAK ROOM)',
    // Q6: the design's card already reads THE KITCHEN; the underlying Room
    // id/HUD title stay `the-melt`/"THE MELT" until #92 renames them.
    roomId: 'the-melt',
  },
  {
    number: '05',
    label: '05 · THE MARKET',
    subtitle: 'ROOF DECK MARKETPLACE',
    roomId: 'roof-deck',
  },
  { number: '06', label: '06 · YOUR IGLOO', subtitle: 'PLAYER HOME', roomId: 'igloo' },
  { number: '07', label: '07 · TEAM ROOM 4', subtitle: 'THE POD · 350 SF', roomId: null },
  { number: '08', label: '08 · TEAM ROOM 1', subtitle: 'AI LAB · 337 SF', roomId: null },
  { number: '09', label: '09 · TEAM ROOM 2', subtitle: 'UX STUDIO · 292 SF', roomId: null },
  { number: '10', label: '10 · TEAM ROOM 3', subtitle: 'DATA CAVE · 287 SF', roomId: null },
  { number: '11', label: '11 · THE CORRIDOR', subtitle: 'TEAM ROOMS 1–9', roomId: null },
  { number: '12', label: '12 · THE SLIDE', subtitle: 'STAIRWELL · 5 FLIGHTS', roomId: null },
  { number: '13', label: '13 · THE THAW ROOM', subtitle: 'BATHROOM (JOKE)', roomId: null },
  {
    number: '15',
    label: '15 · THE MULLET',
    subtitle: 'MEZZANINE · AFTER-PARTY',
    roomId: null,
  },
] as const;

/**
 * Whether `tile` is clickable: it names a `RoomId` and that Room has a
 * registered `RoomDefinition` (#15's disabled-door rule, applied to the Map).
 * Every other tile shows COMING SOON.
 */
export function isMapTileClickable(tile: MapRoomTile): boolean {
  return tile.roomId !== null && hasRoomDefinition(tile.roomId);
}
