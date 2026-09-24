import type { BadgeId } from '../contracts';

/**
 * Display names for the done screen's "Badge unlocked: <name>" panel, taken
 * verbatim from the designs (`design/Minigame Bug Squash.dc.html`'s
 * "Exterminator", `design/Minigame Pancake Flip.dc.html`'s "Breakfast
 * Club"; Coffee Rush's "Barista" and Snow Cone Stand's "Brain Freeze" follow
 * the same title-casing convention ahead of #39/#46 building those designs'
 * own done screens).
 */
const BADGE_NAMES: Record<BadgeId, string> = {
  exterminator: 'Exterminator',
  'breakfast-club': 'Breakfast Club',
  barista: 'Barista',
  'brain-freeze': 'Brain Freeze',
};

export function badgeDisplayName(badgeId: BadgeId): string {
  return BADGE_NAMES[badgeId];
}
