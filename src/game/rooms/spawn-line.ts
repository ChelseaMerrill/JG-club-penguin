import type { RoomId } from '../../contracts';

export interface SpawnLineDeps {
  /** The Room the Session just spawned into. */
  spawnRoomId: RoomId;
  /** Whether that Session is still the current one (the sign-in generation is unchanged). */
  isCurrent: () => boolean;
  /** The Room the navigator is in now, which a quick door may already have changed. */
  currentRoomId: () => RoomId | null;
  /** A Room's `spawnLine`, or `undefined` when it has none. */
  lineFor: (roomId: RoomId) => string | undefined;
  /** Shows `text` as the own Penguin's local bubble; whether it was shown. */
  say: (text: string) => boolean;
}

/**
 * Says the spawn Room's `spawnLine` once, as the own Penguin's local-only
 * bubble (#169: the Lobby's "stairs or elevator?"). Called once per spawn,
 * after the own Penguin is revealed, so a later entry into the same Room
 * never repeats it. Says nothing when the Session has been superseded (a
 * sign-out or a newer sign-in), when the Player has already left the spawn
 * Room, or when that Room has no line. Never sent on the Room channel.
 * Returns whether the line was shown.
 */
export function saySpawnLine(deps: SpawnLineDeps): boolean {
  if (!deps.isCurrent()) return false;
  if (deps.currentRoomId() !== deps.spawnRoomId) return false;
  const line = deps.lineFor(deps.spawnRoomId);
  if (!line) return false;
  return deps.say(line);
}
