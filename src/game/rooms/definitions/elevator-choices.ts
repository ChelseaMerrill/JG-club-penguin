import type { FloorChoice } from '../room-definition';

/**
 * The Lobby chip on every Elevator picker (#170 D9). Locked (no target Room)
 * until the Lobby is built (#169), when a later change gives it a target and
 * a landing on both pickers. `entryTile` is unused while locked.
 */
export const LOBBY_FLOOR_CHOICE: FloorChoice = {
  floor: 'L',
  label: 'LOBBY · UNDER CONSTRUCTION',
  targetRoomId: null,
  entryTile: { col: 0, row: 0 },
};
