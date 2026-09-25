import type { Facing, PenguinLook } from './penguin';
import type { RoomId, Tile } from './rooms';

/**
 * `room:<roomId>`, except the Igloo: `room:igloo:<playerId>`, since a Player
 * alone in their own Igloo still has a Room channel of one.
 */
export function roomChannelKey(roomId: RoomId, playerId: string): string {
  return roomId === 'igloo' ? `room:igloo:${playerId}` : `room:${roomId}`;
}

/**
 * Producer: #28 (`channel.track()`). Consumers: #28, #43. Carries the full
 * look, including `name`; never query `players` for other Penguins (#9 D1).
 */
export interface PresencePayload {
  playerId: string;
  look: PenguinLook;
  tile: Tile;
  facing: Facing;
}

/**
 * Producer/consumer: #28 bus; #43, #44.
 */
export interface RoomBroadcastMap {
  /** Producer/consumer: #43. */
  move: { playerId: string; target: Tile };
  /** Producer/consumer: #44. `sentAt` is epoch milliseconds. */
  chat: { playerId: string; text: string; sentAt: number };
  /**
   * Producer/consumer: #28, internal to the Room channel. Sent after every
   * acknowledged `track()` outside the Igloo, and once in reply to a hello
   * from a Penguin not yet shown, so a Penguin appears before Presence
   * propagates. A hint only: Presence stays the source of truth.
   */
  'presence:hello': PresencePayload;
  /**
   * Producer/consumer: #28, internal to the Room channel. Sent on a Room
   * leave or `stop()` while joined (never on a reconnect), so the Penguin
   * disappears before Presence propagates the leave.
   */
  'presence:bye': { playerId: string };
}

/**
 * Producer/consumer: #28 bus; #43, #44.
 */
export type RoomBroadcastEvent = keyof RoomBroadcastMap;

/**
 * Reserved for #47 (emote) and #53 (snowball); not implemented. Because
 * these names are not keys of `RoomBroadcastMap`, sending one today is a
 * compile-time type error until those tickets add them.
 */
export type ReservedBroadcastEvent = 'emote' | 'snowball:throw' | 'snowball:hit';
