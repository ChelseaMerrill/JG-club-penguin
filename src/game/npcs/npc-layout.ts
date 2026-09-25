import type { NpcDefinition } from '../../npcs/npcs';

/**
 * Pure, Phaser-free geometry for one NPC (#113): its draw scale, where its
 * nameplate and speech bubble sit, its click area and its idle bob. Shared by
 * `npc-sprite.ts` (drawing), `RoomScene.ts` (the click `Zone`) and the unit
 * tests, so all three derive from one set of numbers.
 *
 * Every offset is in Stage px relative to the NPC's feet anchor (negative is
 * up), traced from the Room designs' baked markup: each design draws a figure
 * as `<svg viewBox="0 0 120 130" width="120*s">` whose feet sit 120 design px
 * below its top, with a 20 px nameplate 5 px above the scaled figure and the
 * speech bubble 4 px above the nameplate (e.g. `design/Room 01 Town
 * Center.dc.html`'s Darrin Jahnel: figure `y="362.5" height="80.6"`,
 * nameplate `y="337.4"`, bubble bottom `333.4`).
 */

/** Every Room design draws Human NPCs at 0.62 (`width="74.4"`). */
export const HUMAN_NPC_SCALE = 0.62;
/** Every Room design draws Penguin NPCs at 0.58 (`width="69.6"`). */
export const PENGUIN_NPC_SCALE = 0.58;

/** Design px from the top of the figure's 120-tall box to its feet anchor (`PENGUIN_ORIGIN.y`). */
const FIGURE_HEIGHT = 120;
export const NAMEPLATE_HEIGHT = 20;
const NAMEPLATE_GAP_ABOVE_FIGURE = 5;
const BUBBLE_GAP_ABOVE_NAMEPLATE = 4;
const HIT_AREA_WIDTH = 48;
const HIT_AREA_BELOW_FEET = 5;

/** The designs' shared `@keyframes idle`: up 3 px and back over the cycle. */
const BOB_DISTANCE = 3;
const DEFAULT_BOB_PERIOD_S = 3;

export interface NpcHitArea {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface NpcLayout {
  scale: number;
  nameplateTopY: number;
  nameplateBottomY: number;
  /** Where the bubble's pill ends (its tail points down from here). */
  bubbleBottomY: number;
  hitArea: NpcHitArea;
}

export interface NpcBob {
  distance: number;
  periodMs: number;
}

/**
 * The draw scale by kind. Penguin-kind NPCs keep only this layout default:
 * they are being removed from the Rooms (only Players appear as Penguins,
 * PR #133), so #113 doesn't restyle them.
 */
export function npcScale(npc: Pick<NpcDefinition, 'kind'>): number {
  return npc.kind === 'human' ? HUMAN_NPC_SCALE : PENGUIN_NPC_SCALE;
}

export function npcLayout(npc: Pick<NpcDefinition, 'kind'>): NpcLayout {
  const scale = npcScale(npc);
  const nameplateBottomY = -FIGURE_HEIGHT * scale - NAMEPLATE_GAP_ABOVE_FIGURE;
  const nameplateTopY = nameplateBottomY - NAMEPLATE_HEIGHT;
  const hitHeight = HIT_AREA_BELOW_FEET - nameplateTopY;
  return {
    scale,
    nameplateTopY,
    nameplateBottomY,
    bubbleBottomY: nameplateTopY - BUBBLE_GAP_ABOVE_NAMEPLATE,
    hitArea: {
      centerX: 0,
      centerY: nameplateTopY + hitHeight / 2,
      width: HIT_AREA_WIDTH,
      height: hitHeight,
    },
  };
}

/**
 * The idle bob, or `null` for an NPC its design leaves still (the Kitchen's
 * Chelsea) or one with a designed motion (`npc-motions.ts`, PR #136), which
 * replaces the bob: those tracks carry the design's own bob where it has one
 * (Steven's and Ian's `idle`, the Icebox's shared `idle 1.1s`). The cycle is
 * the designs' 3 s unless the NPC carries its own `bobPeriodS`.
 */
export function npcBob(
  npc: Pick<NpcDefinition, 'still' | 'bobPeriodS'>,
  options: { designedMotion?: boolean } = {},
): NpcBob | null {
  if (npc.still || options.designedMotion) return null;
  return {
    distance: BOB_DISTANCE,
    periodMs: Math.round((npc.bobPeriodS ?? DEFAULT_BOB_PERIOD_S) * 1000),
  };
}
