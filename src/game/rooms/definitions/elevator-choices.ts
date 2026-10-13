import type { FloorChoice } from '../room-definition';

/**
 * The Lobby chip on every Elevator picker (#170 D9). Locked (no target Room)
 * until the Lobby is built (#169), when a later change gives it a target and
 * a landing on both pickers (and "LOBBY · STREET LEVEL" as its label). The
 * picker adds " · UNDER CONSTRUCTION" to a locked choice itself, so
 * unlocking it is only the target and the landing. `entryTile` is unused
 * while locked.
 */
export const LOBBY_FLOOR_CHOICE: FloorChoice = {
  floor: 'L',
  label: 'LOBBY',
  targetRoomId: null,
  entryTile: { col: 0, row: 0 },
};
