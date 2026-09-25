import type { NpcBubbleLine } from '../../npcs/npcs';

/**
 * The shared visible window every Room design's generic `say` bubble uses
 * (`@keyframes say { 0%,4% {0} 7%,26% {1} 29%,100% {0} }`): fully shown from
 * 7% to 26% of the line's period. A line with its own keyframes (Town
 * Center's `sayDarrin`, `saySyd`, `sayJon`, `sayJory`) carries its own
 * `window` instead (#113).
 */
export const DEFAULT_BUBBLE_WINDOW: readonly [number, number] = [0.07, 0.26];

export interface BubbleSchedule {
  /** Ms from Room load until the line first shows. */
  firstShowMs: number;
  /** Ms the line stays shown each cycle. */
  visibleMs: number;
  /** Ms between two consecutive shows. */
  periodMs: number;
}

/**
 * When `line` shows and for how long, replaying the design's CSS animation:
 * `delayS` is its `animation-delay` (typically negative, "already elapsed at
 * load"), normalized into one period, and the line next opens at the start
 * of its visible window. Pure, so the timing is unit-tested without Phaser.
 */
export function bubbleSchedule(line: NpcBubbleLine): BubbleSchedule {
  const periodMs = line.periodS * 1000;
  const [start, end] = line.window ?? DEFAULT_BUBBLE_WINDOW;
  const windowStartMs = start * periodMs;
  const elapsedAtLoadMs = (((-line.delayS * 1000) % periodMs) + periodMs) % periodMs;
  let firstShowMs = windowStartMs - elapsedAtLoadMs;
  if (firstShowMs < 0) firstShowMs += periodMs;
  return {
    firstShowMs: Math.round(firstShowMs * 1000) / 1000,
    visibleMs: Math.round((end - start) * periodMs * 1000) / 1000,
    periodMs,
  };
}
