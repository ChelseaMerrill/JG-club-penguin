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

/**
 * At most 16 keys under a round's `stats` (the SQL also caps it at 2 kB),
 * each at most `STATS_MAX_KEY_LENGTH` characters.
 */
export const STATS_MAX_KEYS = 16;

/** Each key under a round's `stats` is at most this many characters. */
export const STATS_MAX_KEY_LENGTH = 32;

/**
 * Interval rule (#27 RT3, option A): a round less than this many seconds
 * after the previous round of the same Minigame is `round_too_soon`.
 * Otherwise the payout is at most
 * `floor(cap * min(1, secondsSincePreviousRound / durationSeconds))`.
 */
export const MIN_ROUND_INTERVAL_SECONDS = 10;

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

/** Beystadium pays this for a match win (design: `tokens = youWins >= 2 ? 60 : 15`). */
export const BEYSTADIUM_WIN_TOKENS = 60;
/** Beystadium pays this for a match loss. */
export const BEYSTADIUM_LOSS_TOKENS = 15;

/**
 * The Beystadium `record_round` branch's extra stats checks (beyond the
 * shared whole-number/key-count ones): `won` is 0 or 1 and is 1 exactly
 * when `roundsWon` is 2; `roundsWon`/`roundsLost` are 0-2 and never both 2;
 * `bey` is 0-2. A missing key counts as 0, as everywhere else.
 */
function beystadiumStatsValid(stats: Readonly<Record<string, number>>): boolean {
  const won = stat(stats, 'won');
  const roundsWon = stat(stats, 'roundsWon');
  const roundsLost = stat(stats, 'roundsLost');
  return (
    (won === 0 || won === 1) &&
    roundsWon <= 2 &&
    roundsLost <= 2 &&
    !(roundsWon === 2 && roundsLost === 2) &&
    (won === 1) === (roundsWon === 2) &&
    stat(stats, 'bey') <= 2
  );
}

interface MinigameRuleBase {
  id: MinigameId;
  /** The round's maximum Token payout. */
  cap: number;
  /** The Minigame's round length; the payout clamp scales by it. */
  durationSeconds: number;
  badgeId: BadgeId;
  rawPayout(score: number, stats: Readonly<Record<string, number>>): number;
  rawBest(score: number, stats: Readonly<Record<string, number>>): number;
  /** Extra per-Minigame stats checks; `false` rejects the round as
   *  `invalid_stats`. Omitted when the shared checks are enough. */
  validStats?(stats: Readonly<Record<string, number>>): boolean;
}

/** A Badge earned by one round's `rawBest` reaching `badgeThreshold`. */
export interface ThresholdBadgeRule extends MinigameRuleBase {
  badgeKind: 'threshold';
  badgeThreshold: number;
}

/** A Badge earned by the Player's `badgeMatchWins`-th recorded match win in
 *  total (the current round included), whatever any one round scored. */
export interface MatchWinsBadgeRule extends MinigameRuleBase {
  badgeKind: 'match-wins';
  badgeMatchWins: number;
  isMatchWin(stats: Readonly<Record<string, number>>): boolean;
}

/**
 * One Minigame's payout rule, mirroring #27's `record_round` exactly:
 * `rawPayout` is floored at 0 and capped at `cap` for the round's Token
 * award; `rawBest` (compared against the Player's stored personal best,
 * and, for a `'threshold'` Badge, against `badgeThreshold`) is never
 * floored or capped.
 */
export type MinigameRule = ThresholdBadgeRule | MatchWinsBadgeRule;

/**
 * The payout table decided 2026-09-24 (issue #27), one rule per Minigame,
 * plus Beystadium's (owner-approved defaults, 2026-09-25).
 * `MinigameStatsMap`'s keys (#26) match the `stats` keys read here.
 * `satisfies` (not a `Record<MinigameId, MinigameRule>` annotation) keeps
 * each entry's own Badge kind, so `MINIGAME_RULES['coffee-rush']
 * .badgeThreshold` still reads directly.
 */
export const MINIGAME_RULES = {
  'bug-squash': {
    id: 'bug-squash',
    cap: 250,
    durationSeconds: 60,
    badgeId: 'exterminator',
    badgeKind: 'threshold',
    badgeThreshold: 500,
    rawPayout: (score) => Math.floor(score / 10),
    rawBest: (score) => score,
  },
  'pancake-flip': {
    id: 'pancake-flip',
    cap: 400,
    durationSeconds: 90,
    badgeId: 'breakfast-club',
    badgeKind: 'threshold',
    badgeThreshold: 20,
    rawPayout: (_score, stats) =>
      10 * stat(stats, 'golden') + 5 * stat(stats, 'flipNow') - 5 * stat(stats, 'burnt'),
    rawBest: (_score, stats) => stat(stats, 'stacked'),
  },
  'coffee-rush': {
    id: 'coffee-rush',
    cap: 400,
    durationSeconds: 90,
    badgeId: 'barista',
    badgeKind: 'threshold',
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
    durationSeconds: 120,
    badgeId: 'brain-freeze',
    badgeKind: 'threshold',
    badgeThreshold: 200,
    rawPayout: (_score, stats) => snowConeRaw(stats),
    rawBest: (_score, stats) => Math.max(snowConeRaw(stats), 0),
  },
  // A match takes roughly 30-90 s; `durationSeconds` 45 is the anti-farm
  // clamp's window (see the Beystadium migration's header), not a timer:
  // back-to-back matches can never earn more than one 60-Token cap per 45 s.
  beystadium: {
    id: 'beystadium',
    cap: BEYSTADIUM_WIN_TOKENS,
    durationSeconds: 45,
    badgeId: 'let-it-rip',
    badgeKind: 'match-wins',
    badgeMatchWins: 3,
    isMatchWin: (stats) => stat(stats, 'won') === 1,
    validStats: beystadiumStatsValid,
    rawPayout: (_score, stats) =>
      stat(stats, 'won') === 1 ? BEYSTADIUM_WIN_TOKENS : BEYSTADIUM_LOSS_TOKENS,
    rawBest: (_score, stats) => stat(stats, 'strikes'),
  },
} satisfies Record<MinigameId, MinigameRule>;

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
