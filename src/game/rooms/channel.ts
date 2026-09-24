import { roomChannelKey, type RoomId } from '../../contracts';

/**
 * The Room's Presence channel key. Delegates to `roomChannelKey` from
 * `src/contracts` (#26 D4) rather than re-implementing the Igloo
 * per-player-channel rule here.
 */
export function getRoomChannelKey(roomId: RoomId, playerId: string): string {
  return roomChannelKey(roomId, playerId);
}
