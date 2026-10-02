/**
 * An NPC that watches the Player (owner request, 2026-10-02, Track D: Team
 * Room 2's Chris Pence "looking through his binoculars tracking the user"):
 * the NPC leans its whole figure, pivoting on its feet, toward the local
 * Penguin, further the further across the Room the Penguin is, and eases
 * into each new lean so it follows the Penguin smoothly. Pure, so it is
 * unit-tested directly; `RoomScene` applies it each frame.
 */

/** The furthest it leans, in radians (10 degrees). */
export const WATCH_MAX_LEAN = (10 * Math.PI) / 180;
/** How far across the Stage (px) the Penguin must be for the full lean. */
const WATCH_FULL_LEAN_DISTANCE = 400;
/** How quickly the lean catches up with its target: the fraction closed per second. */
const WATCH_EASE_PER_SECOND = 4;

/** The lean (radians, + leans right) toward a Penguin at `playerX`, for an NPC at `npcX`. */
export function watchTargetLean(npcX: number, playerX: number): number {
  const t = Math.max(-1, Math.min(1, (playerX - npcX) / WATCH_FULL_LEAN_DISTANCE));
  return t * WATCH_MAX_LEAN;
}

/** `current` eased toward `target` over `deltaMs`, never overshooting. */
export function easeLean(current: number, target: number, deltaMs: number): number {
  const k = Math.min(1, (WATCH_EASE_PER_SECOND * deltaMs) / 1000);
  return current + (target - current) * k;
}
