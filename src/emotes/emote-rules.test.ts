import { describe, expect, it } from 'vitest';
import { EMOTES } from '../contracts';
// From the leaf `poses.ts`, not the `../game/penguin` barrel: that barrel
// also re-exports `penguin-sprite.ts`, which imports Phaser and needs a
// `window` global this plain-Node test file doesn't set up (no
// `@vitest-environment jsdom` pragma).
import { PENGUIN_FRAMES } from '../game/penguin/poses';
import { EMOTE_TO_ANIM } from './emote-rules';

describe('EMOTE_TO_ANIM', () => {
  it('maps every EmoteId to a known PenguinAnim', () => {
    for (const emoteId of EMOTES) {
      expect(Object.keys(PENGUIN_FRAMES)).toContain(EMOTE_TO_ANIM[emoteId]);
    }
  });

  it('reuses the existing idle anims for wave/dance/laugh/sit (#31), rather than inventing new ones', () => {
    expect(EMOTE_TO_ANIM.wave).toBe('WAVE');
    expect(EMOTE_TO_ANIM.dance).toBe('DANCE');
    expect(EMOTE_TO_ANIM.laugh).toBe('LAUGH');
    expect(EMOTE_TO_ANIM.sit).toBe('SIT');
  });

  it('maps the four Emote-only picks to their own new poses, each distinct from one another and from WALK/every idle anim', () => {
    const anims = [
      EMOTE_TO_ANIM['thumbs-up'],
      EMOTE_TO_ANIM.brb,
      EMOTE_TO_ANIM['jg-flash'],
      EMOTE_TO_ANIM['ship-it'],
    ];

    expect(new Set(anims).size).toBe(anims.length);
    for (const anim of anims) {
      expect(['WALK', 'WADDLE', 'WAVE', 'DANCE', 'LAUGH', 'SIT']).not.toContain(anim);
    }
  });
});
