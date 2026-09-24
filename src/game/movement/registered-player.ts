import { DEFAULT_LOOK, type PenguinLook } from '../../contracts';

/**
 * The minimal shape #14 needs from `game.registry.get('player')` (see
 * `src/auth/player.ts`'s `Player`), declared locally so movement code
 * doesn't import the auth module. `id` is optional here — even though the
 * real `Player.id` is always present — so a partial test-only object (e.g.
 * `dev-room-hook.ts`'s `setRegisteredPlayer` debug hook) still type-checks.
 */
export interface RegisteredPlayer {
  id?: string;
  look: PenguinLook;
}

/**
 * Placeholder `PenguinState.playerId` for the local Penguin before a Player
 * has signed in, or when a registered Player has no `id` (#14 D4, review
 * fix 4).
 */
export const LOCAL_PLAYER_ID = 'local';

/**
 * `registered?.look ?? DEFAULT_LOOK` (#14 D3, review fix 1), pulled out as a
 * pure function so `RoomScene`'s sign-in look resolution is unit-testable
 * without a Phaser Scene.
 */
export function resolveRegisteredLook(registered: RegisteredPlayer | undefined): PenguinLook {
  return registered?.look ?? DEFAULT_LOOK;
}

/**
 * `registered?.id ?? LOCAL_PLAYER_ID` (review fix 4), same reasoning as
 * `resolveRegisteredLook`.
 */
export function resolveRegisteredPlayerId(registered: RegisteredPlayer | undefined): string {
  return registered?.id ?? LOCAL_PLAYER_ID;
}
