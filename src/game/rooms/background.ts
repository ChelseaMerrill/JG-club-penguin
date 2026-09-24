import type { RoomBackground } from './room-definition';

/**
 * What `RoomScene` should draw for a Room's `background`: the procedural
 * isometric floor (drawn from `walkable`) or the exported design image
 * loaded under `background.key` (#13 D3). Factored out of `RoomScene` as a
 * pure decision so the branch is unit-testable without booting Phaser.
 */
export type BackgroundDrawPlan = { kind: 'procedural' } | { kind: 'image'; key: string };

export function planBackgroundDraw(background: RoomBackground): BackgroundDrawPlan {
  return background.kind === 'image'
    ? { kind: 'image', key: background.key }
    : { kind: 'procedural' };
}
