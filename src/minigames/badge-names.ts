import type { BadgeId } from '../contracts';
import { badgeDefinition } from '../persistence/badge-catalog';

/**
 * Display names for "Badge unlocked: <name>" (the done screen's panel, the
 * badge toast and #138's Badge popup), taken verbatim from the designs
 * (`design/Minigame Bug Squash.dc.html`'s "Exterminator", `design/Minigame
 * Pancake Flip.dc.html`'s "Breakfast Club", `design/Trophy Case.dc.html`'s
 * tile titles for the rest; Coffee Rush's "Barista" and Snow Cone Stand's
 * "Brain Freeze" follow the same title-casing convention). They match the
 * catalog's `name` column (`public.badges`, #138).
 */
const BADGE_NAMES: Record<BadgeId, string> = {
  exterminator: 'Exterminator',
  'breakfast-club': 'Breakfast Club',
  barista: 'Barista',
  'brain-freeze': 'Brain Freeze',
  'first-waddle': 'First Waddle',
  snowmageddon: 'Snowmageddon',
  'ship-it': 'Ship It',
  'rail-rider': 'Rail Rider',
  'hexle-parent': 'Hexle Parent',
  'interior-penguin': 'Interior Penguin',
  'night-owl': 'Night Owl',
  'mullet-mania': 'Mullet Mania',
  'let-it-rip': 'Let It Rip',
  'stair-master': 'Stair Master',
  'phish-fry': 'Phish Fry',
};

/**
 * The display name for `badgeId`. An id this build has no name for (a Badge
 * a later migration added) falls back to the catalog's `name`, then the id.
 */
export function badgeDisplayName(badgeId: BadgeId | string): string {
  return (
    (BADGE_NAMES as Record<string, string>)[badgeId] ?? badgeDefinition(badgeId)?.name ?? badgeId
  );
}
