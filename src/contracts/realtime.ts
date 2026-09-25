import type { EmoteId } from './emotes';
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
 * Chat text length limit (#44): the HUD chat field's `maxlength`, and the
 * length a longer message is cut to before sending rather than rejected
 * outright. The single copy `src/realtime/room-channel.ts` (wire validation)
 * and `src/chat/` (the field and its rules) both use, instead of two copies
 * silently drifting apart.
 */
export const CHAT_TEXT_MAX = 120;

/**
 * Producer/consumer: #28 bus; #43, #44.
 */
export interface RoomBroadcastMap {
  /** Producer/consumer: #43. */
  move: { playerId: string; target: Tile };
  /** Producer/consumer: #44. `sentAt` is epoch milliseconds. */
  chat: { playerId: string; text: string; sentAt: number };
  /**
   * Producer/consumer: #47. A one-off Emote pick, played on the sender's
   * Penguin for `EMOTE_DURATION_MS` (`./emotes.ts`) and broadcast so every
   * other Penguin in the Room plays it too.
   */
  emote: { playerId: string; emoteId: EmoteId };
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
  /**
   * Producer/consumer: #53. Sent by the thrower's client when a snowball is
   * thrown. `throwId` is sender-unique, `[A-Za-z0-9]{1,16}`. `target` is the
   * aimed Tile (never pixels), snapped from the reticle.
   */
  'snowball:throw': { playerId: string; throwId: string; target: Tile };
  /**
   * Producer/consumer: #53. Sent only by the thrower's client, once hit
   * detection on its own client picks a hit for `throwId`. `targetId` is the
   * playerId of the Penguin hit, in the same Room; never the thrower's own
   * `playerId` (the parser rejects `targetId === playerId`).
   */
  'snowball:hit': { playerId: string; throwId: string; targetId: string };
}

/**
 * Producer/consumer: #28 bus; #43, #44, #47, #53.
 */
export type RoomBroadcastEvent = keyof RoomBroadcastMap;
