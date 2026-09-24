export const ROOM_IDS = ['town-center', 'dev-pit', 'the-melt', 'roof-deck', 'igloo'] as const;

export type RoomId = (typeof ROOM_IDS)[number];

export const SPAWN_ROOM_ID: RoomId = 'town-center';

/** A grid coordinate within a Room. Tile coordinates, never pixels. */
export interface Tile {
  col: number;
  row: number;
}

/**
 * Producer: #15. Consumers: #28 (switch Presence channel), #32 HUD title.
 *
 * `room:leave` always fires before `room:enter`; the first `room:enter` of a
 * Session has no preceding `room:leave`; sign-out emits `room:leave` before
 * `bindPlayer(null)`; `room:enter` fires only after `registry.player` is set.
 *
 * A Realtime reconnect emits neither event: a reconnect is not a Room
 * change, and #28 re-subscribes and re-tracks its current Room channel
 * itself.
 */
export interface RoomEventMap {
  'room:leave': { roomId: RoomId };
  'room:enter': { roomId: RoomId; entryTile: Tile };
}
