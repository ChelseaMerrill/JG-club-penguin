/**
 * The eight HUD Emotes (#47): a one-off expression a Penguin shows to
 * everyone in its Room for `EMOTE_DURATION_MS`, picked from the HUD's EMOTE
 * picker (`design/Club JenGuin HUD Menus.dc.html`'s HUD-EMOTE screen). Not
 * the same as an Idle animation (`IdleEmote`, `./penguin.ts`), which stays
 * untouched by this ticket. Kebab-case like `BadgeId` (`./game-events.ts`).
 *
 * Producer: the HUD's EMOTE picker (`src/ui/hud/emote-picker.ts`), sent via
 * `src/emotes/emote-controller.ts`. Consumers: `src/realtime/room-channel.ts`
 * (wire validation, alongside `move`/`chat`), `src/emotes/emote-rules.ts`
 * (the `PenguinAnim` each one plays).
 */
export const EMOTES = [
  'wave',
  'dance',
  'laugh',
  'sit',
  'thumbs-up',
  'brb',
  'jg-flash',
  'ship-it',
] as const;

export type EmoteId = (typeof EMOTES)[number];

/** Narrows an unknown wire value to a known `EmoteId`; an unknown id (e.g. from a newer client) is dropped, never rendered. */
export function isEmoteId(v: unknown): v is EmoteId {
  return typeof v === 'string' && (EMOTES as readonly string[]).includes(v);
}

/**
 * How long a picked Emote plays before the Penguin returns to its normal
 * idle/walk animation (#47), on both the sender's own Penguin and every
 * remote Penguin that receives the broadcast.
 */
export const EMOTE_DURATION_MS = 2000;
