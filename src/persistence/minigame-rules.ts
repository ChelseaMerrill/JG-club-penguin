import type { BadgeId, MinigameId } from '../contracts/game-events';
import type { ShopItem } from './progress-store';

/** Starting Token balance for a new Player (`players.tokens default 100`). */
export const STARTING_TOKENS = 100;

/** Paid once, the first time a Minigame's Badge is earned. */
export const BADGE_BONUS = 50;

/** `record_round`'s `score` bounds (`score >= 0`, capped at one million). */
export const SCORE_MIN = 0;
export const SCORE_MAX = 1_000_000;

/**
 * Bounds on every value under a round's `stats`: a whole number from 0 to
 * 100000. A negative stat would otherwise turn a penalty (Pancake Flip's
 * Burnt) into a reward.
 */
export const STAT_MIN = 0;
export const STAT_MAX = 100_000;

/** At most 16 keys under a round's `stats` (the SQL also caps it at 2 kB). */
export const STATS_MAX_KEYS = 16;

function stat(stats: Readonly<Record<string, number>>, key: string): number {
  return stats[key] ?? 0;
}

function snowConeRaw(stats: Readonly<Record<string, number>>): number {
  return (
    5 * stat(stats, 'cone5') +
    10 * stat(stats, 'cone10') +
    15 * stat(stats, 'cone15') +
    25 * stat(stats, 'cone25') +
    2 *
      (5 * stat(stats, 'rushCone5') +
        10 * stat(stats, 'rushCone10') +
        15 * stat(stats, 'rushCone15') +
        25 * stat(stats, 'rushCone25'))
  );
}

/**
 * One Minigame's payout rule, mirroring #27's `record_round` exactly:
 * `rawPayout` is floored at 0 and capped at `cap` for the round's Token
 * award; `rawBest` (compared against the Player's stored personal best,
 * and against `badgeThreshold` for the Badge) is never floored or capped.
 */
export interface MinigameRule {
  id: MinigameId;
  /** The round's maximum Token payout. */
  cap: number;
  /** Minimum time between two rounds of this Minigame. */
  intervalSeconds: number;
  badgeId: BadgeId;
  badgeThreshold: number;
  rawPayout(score: number, stats: Readonly<Record<string, number>>): number;
  rawBest(score: number, stats: Readonly<Record<string, number>>): number;
}

/**
 * The payout table decided 2026-09-24 (issue #27), one rule per Minigame.
 * `MinigameStatsMap`'s keys (#26) match the `stats` keys read here.
 */
export const MINIGAME_RULES: Record<MinigameId, MinigameRule> = {
  'bug-squash': {
    id: 'bug-squash',
    cap: 250,
    intervalSeconds: 60,
    badgeId: 'exterminator',
    badgeThreshold: 500,
    rawPayout: (score) => Math.floor(score / 10),
    rawBest: (score) => score,
  },
  'pancake-flip': {
    id: 'pancake-flip',
    cap: 400,
    intervalSeconds: 90,
    badgeId: 'breakfast-club',
    badgeThreshold: 20,
    rawPayout: (_score, stats) =>
      10 * stat(stats, 'golden') + 5 * stat(stats, 'flipNow') - 5 * stat(stats, 'burnt'),
    rawBest: (_score, stats) => stat(stats, 'stacked'),
  },
  'coffee-rush': {
    id: 'coffee-rush',
    cap: 400,
    intervalSeconds: 90,
    badgeId: 'barista',
    badgeThreshold: 15,
    rawPayout: (_score, stats) =>
      5 * stat(stats, 'small') +
      10 * stat(stats, 'medium') +
      15 * stat(stats, 'large') +
      5 * stat(stats, 'perfect'),
    rawBest: (_score, stats) => stat(stats, 'small') + stat(stats, 'medium') + stat(stats, 'large'),
  },
  'snow-cone-stand': {
    id: 'snow-cone-stand',
    cap: 600,
    intervalSeconds: 120,
    badgeId: 'brain-freeze',
    badgeThreshold: 200,
    rawPayout: (_score, stats) => snowConeRaw(stats),
    rawBest: (_score, stats) => Math.max(snowConeRaw(stats), 0),
  },
};

/**
 * The Igloo Gear catalog seeded by #27's migration (`public.shop_items`,
 * stall `igloo`). `artKey` equals `id` for every item.
 */
export const IGLOO_GEAR_CATALOG: readonly ShopItem[] = [
  { id: 'beanbag', stall: 'igloo', name: 'Beanbag', price: 50, artKey: 'beanbag' },
  {
    id: 'rgb-light-strip',
    stall: 'igloo',
    name: 'RGB Light Strip',
    price: 60,
    artKey: 'rgb-light-strip',
  },
  { id: 'desk', stall: 'igloo', name: 'Desk', price: 80, artKey: 'desk' },
  { id: 'speakers', stall: 'igloo', name: 'Speakers', price: 100, artKey: 'speakers' },
  {
    id: 'dual-monitors',
    stall: 'igloo',
    name: 'Dual Monitors',
    price: 120,
    artKey: 'dual-monitors',
  },
  { id: 'disco-ball', stall: 'igloo', name: 'Disco Ball', price: 150, artKey: 'disco-ball' },
  {
    id: 'arcade-cabinet',
    stall: 'igloo',
    name: 'Arcade Cabinet',
    price: 250,
    artKey: 'arcade-cabinet',
  },
];
