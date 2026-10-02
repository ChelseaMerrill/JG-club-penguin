import type { NpcId } from '../npcs';
import type { NpcMotionSpec } from './types';

/**
 * The Roof Deck's NPC motions (#113), copied verbatim from `design/Room 05
 * Roof Deck.dc.html`'s `<style>` block and each NPC's `animation:` style.
 *
 * Left out, because they don't belong to an NPC: `hop` (the Hexles
 * bouncing on Kevin's counter, and the Hexle pet following the design's
 * sample "You" Penguin), `mkYou` (that sample Player Penguin), `idle` (the
 * vendors' bob, which #36's own idle bob already covers), `say` (#36's
 * bubbles) and `blink` (the HUD/door arrow). Also left out: `mkTristin`,
 * since Tristin is a Penguin in the design and so isn't placed (#133: only
 * Players appear as Penguins), and `mkAnthony` with his casting rod: #146
 * took Anthony off the Roof Deck to stand still at the door he guards (his
 * figure keeps its static `fishingRod` prop).
 */
export const ROOF_DECK_MOTIONS: Partial<Record<NpcId, NpcMotionSpec>> = {
  // Brandon's gallop and Millie's walk went with them: they left the Market
  // (owner request, 2026-10-02, Track D).
};
