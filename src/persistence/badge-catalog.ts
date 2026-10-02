import type { BadgeId } from '../contracts/game-events';
import type { BadgeDefinition } from './progress-store';

/**
 * The Badge catalog, exactly as #138's migration seeds `public.badges`
 * (`supabase/migrations/20260927000000_badges.sql`), in `sort_order`. The
 * in-memory fake serves it from `loadAll`; the real stores read the table.
 * `badge-catalog.test.ts` compares the id, name, order and how-to-earn line
 * with the migration's seed, so the two can't drift apart.
 */
export const BADGE_CATALOG: readonly (BadgeDefinition & { id: BadgeId })[] = [
  { id: 'first-waddle', name: 'First Waddle', howToEarn: 'LOG IN', sortOrder: 1, available: true },
  {
    id: 'snowmageddon',
    name: 'Snowmageddon',
    howToEarn: '5 SNOWBALL HITS / DAY',
    sortOrder: 2,
    available: false,
  },
  {
    id: 'ship-it',
    name: 'Ship It',
    howToEarn: 'FINISH THE MAIN QUEST',
    sortOrder: 3,
    available: true,
  },
  {
    id: 'breakfast-club',
    name: 'Breakfast Club',
    howToEarn: '20 STACKED · PANCAKE FLIP',
    sortOrder: 4,
    available: true,
  },
  {
    id: 'brain-freeze',
    name: 'Brain Freeze',
    howToEarn: '200 TOKENS · SNOW CONES',
    sortOrder: 5,
    available: true,
  },
  {
    id: 'exterminator',
    name: 'Exterminator',
    howToEarn: '500 · BUG SQUASH',
    sortOrder: 6,
    available: true,
  },
  {
    id: 'barista',
    name: 'Barista',
    howToEarn: '15 CUPS · COFFEE RUSH',
    sortOrder: 7,
    available: true,
  },
  {
    id: 'rail-rider',
    name: 'Rail Rider',
    howToEarn: 'SLIDE THE STAIRWELL',
    sortOrder: 8,
    available: false,
  },
  {
    id: 'hexle-parent',
    name: 'Hexle Parent',
    howToEarn: 'ADOPT A HEXLE',
    sortOrder: 9,
    available: false,
  },
  {
    id: 'interior-penguin',
    name: 'Interior Penguin',
    howToEarn: '6 IGLOO ITEMS',
    sortOrder: 10,
    available: true,
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    howToEarn: 'ONLINE 2–5 AM ET',
    sortOrder: 11,
    available: true,
  },
  {
    id: 'mullet-mania',
    name: 'Mullet Mania',
    howToEarn: 'HIGH SCORE · ARCADE',
    sortOrder: 12,
    available: false,
  },
  {
    id: 'let-it-rip',
    name: 'Let It Rip',
    howToEarn: 'WIN 3 BEY MATCHES',
    sortOrder: 13,
    available: true,
  },
  {
    id: 'stair-master',
    name: 'Stair Master',
    howToEarn: 'CLIMB THE STAIRWELL',
    sortOrder: 14,
    available: true,
  },
  {
    id: 'phish-fry',
    name: 'Phish Fry',
    howToEarn: '10 PHISHING ANSWERS IN A ROW',
    sortOrder: 15,
    available: true,
  },
];

/**
 * Badges a later issue has turned on with its own migration
 * (`update public.badges set available = true where id = ...`). #138's seed
 * leaves them `false`; each issue that flips one adds its id here and sets
 * the matching `BADGE_CATALOG` entry's `available` to true, so the catalog
 * test keeps matching both migrations.
 */
export const BADGE_AVAILABILITY_OVERRIDES: ReadonlySet<BadgeId> = new Set<BadgeId>([
  // #121: 20260928000000_beystadium.sql turns Let It Rip on.
  'let-it-rip',
  // #146: 20260928020000_phishing_quiz.sql turns Phish Fry on.
  'phish-fry',
  // #51 slice 4: 20260929000000_stair_climb.sql turns Stair Master on.
  'stair-master',
]);

/** The catalog row for `badgeId`, if there is one. */
export function badgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return BADGE_CATALOG.find((badge) => badge.id === badgeId);
}
