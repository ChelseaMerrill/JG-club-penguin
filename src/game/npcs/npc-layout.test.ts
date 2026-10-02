import { describe, expect, it } from 'vitest';
import { NPCS } from '../../npcs/npcs';
import { estimateNameplateWidth, npcBob, npcLayout, npcScale } from './npc-layout';

// Expected values are read off the Room designs' own baked markup (feet-
// relative, Stage px), not recomputed from the layout formula:
// - Town Center's Darrin Jahnel (a Human at 0.62): figure `<svg y="362.5"
//   height="80.6">`, so feet = 362.5 + 120 * 0.62 = 436.9; nameplate
//   `<rect y="337.4" height="20">`; bubble `<rect y="303.4" height="30">`.
// - Town Center's "You" (a Penguin at 0.58): `<svg y="548.66">`, feet
//   618.26; nameplate `<rect y="522.6" height="20">`.
const DARRIN_FEET = 436.9;
const DARRIN_NAMEPLATE_TOP = 337.4 - DARRIN_FEET;
const DARRIN_NAMEPLATE_BOTTOM = 357.4 - DARRIN_FEET;
const DARRIN_BUBBLE_BOTTOM = 333.4 - DARRIN_FEET;
const YOU_NAMEPLATE_TOP = 522.6 - 618.26;

describe('npcScale', () => {
  it('draws Humans at 0.62 and Penguin NPCs at 0.58, as every Room design does', () => {
    expect(npcScale({ kind: 'human' })).toBe(0.62);
    expect(npcScale({ kind: 'penguin' })).toBe(0.58);
  });

  it("uses an NPC's own scale where its Room design draws it at another size (#149)", () => {
    expect(npcScale({ kind: 'human', scale: 0.5 })).toBe(0.5);
    expect(npcScale(NPCS['jethro-team-room-1'])).toBeCloseTo(70 / 120, 10);
    expect(npcScale(NPCS.michael)).toBe(0.5);
    expect(npcScale(NPCS['jason-mullet'])).toBe(0.5);
    expect(npcScale(NPCS['jon-mullet'])).toBe(0.58);
    // Tony keeps the Human default.
    expect(npcScale(NPCS.tony)).toBe(0.62);
  });

  it("uses an NPC's own scale when its Room design draws it at another (Team Room 3's 0.58)", () => {
    expect(npcScale({ kind: 'human', scale: 0.58 })).toBe(0.58);
    expect(npcScale(NPCS['millie-team-room-3'])).toBe(0.58);
    expect(npcScale(NPCS.millie)).toBe(0.62);
  });
});

describe('npcLayout', () => {
  it("puts a Human's nameplate above the head and the bubble above the nameplate, as Town Center draws Darrin", () => {
    const layout = npcLayout({ kind: 'human' });
    expect(layout.nameplateTopY).toBeCloseTo(DARRIN_NAMEPLATE_TOP, 0);
    expect(layout.nameplateBottomY).toBeCloseTo(DARRIN_NAMEPLATE_BOTTOM, 0);
    expect(layout.bubbleBottomY).toBeCloseTo(DARRIN_BUBBLE_BOTTOM, 0);
  });

  it("puts a 0.58 Penguin's nameplate where Town Center draws one (within the design's own sub-pixel rounding)", () => {
    const penguinTop = npcLayout({ kind: 'penguin' }).nameplateTopY;
    expect(Math.abs(penguinTop - YOU_NAMEPLATE_TOP)).toBeLessThan(1.5);
  });

  it('covers the NPC from its nameplate top down to just below its feet, about 48 px wide', () => {
    const { hitArea, nameplateTopY } = npcLayout({ kind: 'human' });
    expect(hitArea.width).toBe(48);
    expect(hitArea.centerX).toBe(0);
    expect(hitArea.centerY - hitArea.height / 2).toBeCloseTo(nameplateTopY);
    expect(hitArea.centerY + hitArea.height / 2).toBeCloseTo(5);
  });

  it("still contains the e2e spec's click near a Human's head (70 px above the feet)", () => {
    const { hitArea } = npcLayout({ kind: 'human' });
    const top = hitArea.centerY - hitArea.height / 2;
    const bottom = hitArea.centerY + hitArea.height / 2;
    expect(-70).toBeGreaterThan(top);
    expect(-70).toBeLessThan(bottom);
  });
});

// #149: the Team Rooms and the Mullet draw Humans smaller. Nameplate tops are
// -(120 * scale) - 25, as in the audit's baked markup: Team Rooms 1-2's
// 70/120 = 0.5833 (`width="70"`) gives -95, Team Room 3 and the Mullet's 0.58
// gives -94.6 and Team Room 4's 0.5 gives -85.
describe('npcLayout with a per-NPC scale and nameplate offset (#149)', () => {
  it('scales the nameplate, bubble and click area with the NPC', () => {
    expect(npcLayout({ kind: 'human', scale: 70 / 120 }).nameplateTopY).toBeCloseTo(-95, 5);
    expect(npcLayout({ kind: 'human', scale: 0.58 }).nameplateTopY).toBeCloseTo(-94.6, 5);
    const small = npcLayout({ kind: 'human', scale: 0.5 });
    expect(small.scale).toBe(0.5);
    expect(small.nameplateTopY).toBeCloseTo(-85, 5);
    expect(small.nameplateBottomY).toBeCloseTo(-65, 5);
    expect(small.bubbleBottomY).toBeCloseTo(-89, 5);
    expect(small.hitArea.centerY - small.hitArea.height / 2).toBeCloseTo(-85, 5);
  });

  it('moves the nameplate, the bubble and the click area with a nameplate offset', () => {
    const base = npcLayout({ kind: 'human', scale: 0.5 });
    // Sam's nameplate is 9.5 px higher than the layout position.
    const sam = npcLayout({ kind: 'human', scale: 0.5, nameplateOffset: { y: -9.5 } });
    expect(sam.nameplateTopY).toBeCloseTo(base.nameplateTopY - 9.5, 5);
    expect(sam.nameplateBottomY).toBeCloseTo(base.nameplateBottomY - 9.5, 5);
    expect(sam.bubbleBottomY).toBeCloseTo(base.bubbleBottomY - 9.5, 5);
    expect(sam.hitArea.centerY - sam.hitArea.height / 2).toBeCloseTo(sam.nameplateTopY, 5);
    expect(sam.nameplateCenterX).toBe(0);
  });

  it("widens the click area to take in a nameplate shifted sideways (Jason's -55.5)", () => {
    const jason = npcLayout(NPCS['jason-mullet']);
    expect(jason.nameplateCenterX).toBe(-55.5);
    // The bounding box of the plain 48-wide area (-24..24) and "Jason"'s
    // nameplate (59.5 wide, -85.25..-25.75), from its top (-70) to feet + 5.
    const { hitArea } = jason;
    expect(hitArea.centerX - hitArea.width / 2).toBeCloseTo(-85.25, 5);
    expect(hitArea.centerX + hitArea.width / 2).toBeCloseTo(24, 5);
    expect(hitArea.centerY - hitArea.height / 2).toBeCloseTo(-70, 5);
    expect(hitArea.centerY + hitArea.height / 2).toBeCloseTo(5, 5);
    // With no offset x the area stays the plain 48 wide, centred on the feet.
    expect(npcLayout({ kind: 'human', scale: 0.5 }).hitArea).toMatchObject({
      centerX: 0,
      width: 48,
    });
  });

  it("keeps the click area over the figure when the nameplate is nudged down (Jon's 19 px, and further)", () => {
    // A 19 px nudge leaves the nameplate top (-75.6) above the figure top
    // (120 * 0.58 = 69.6 px up), so it still bounds the area.
    const jon = npcLayout({ kind: 'human', scale: 0.58, nameplateOffset: { y: 19 } });
    expect(jon.nameplateTopY).toBeCloseTo(-75.6, 5);
    expect(jon.hitArea.centerY - jon.hitArea.height / 2).toBeCloseTo(-75.6, 5);
    expect(jon.hitArea.centerY + jon.hitArea.height / 2).toBeCloseTo(5, 5);
    // A nudge past the figure's top leaves the figure's own top to bound it.
    const low = npcLayout({ kind: 'human', scale: 0.58, nameplateOffset: { y: 60 } });
    expect(low.hitArea.centerY - low.hitArea.height / 2).toBeCloseTo(-69.6, 5);
  });

  it("places each NPC's nameplate where its Room design does (feet-relative, from the audit)", () => {
    // Design nameplate tops relative to the feet: Millie -97.7, Casey -85.6.
    expect(npcLayout(NPCS['millie-team-room-3']).nameplateTopY).toBeCloseTo(-97.6, 1);
    expect(npcLayout(NPCS['casey-team-room-3']).nameplateTopY).toBeCloseTo(-85.6, 1);
    expect(npcLayout(NPCS['sam-team-room-4']).nameplateTopY).toBeCloseTo(-94.5, 1);
    expect(npcLayout(NPCS['jon-mullet']).nameplateTopY).toBeCloseTo(-75.6, 1);
    expect(npcLayout(NPCS['jason-mullet']).nameplateCenterX).toBe(-55.5);
  });
});

describe('estimateNameplateWidth', () => {
  it("matches the Room designs' own Human nameplate widths", () => {
    // `<rect width>`s from design/Room 01 Town Center.dc.html, Room 11
    // Office Hallway.dc.html and Room 02 Dev Pit.dc.html.
    expect(estimateNameplateWidth('Darrin Jahnel')).toBeCloseTo(119.5);
    expect(estimateNameplateWidth('Anthony Conway')).toBeCloseTo(127);
    expect(estimateNameplateWidth('Emily Smith')).toBeCloseTo(104.5);
    expect(estimateNameplateWidth('Ian')).toBeCloseTo(44.5);
  });
});

describe('npcBob', () => {
  it("bobs 3 px over the designs' 3 s idle cycle by default", () => {
    expect(npcBob({})).toEqual({ distance: 3, periodMs: 3000 });
  });

  it('keeps the NPCs their Room designs draw without an idle bob from bobbing', () => {
    expect(npcBob({ still: true })).toBeNull();
    // Each checked against its design: no `idle` (or any other animation) on
    // the figure in the Kitchen, Dev Pit, Office Hallway or Team Rooms 3-4.
    const stillInTheirDesigns = [
      'chelsea',
      'ashley',
      'emily',
      'anthony-hallway',
      'millie-team-room-3',
      'casey-team-room-3',
      'sydney-team-room-3',
      'michael',
      'sam-team-room-4',
      'ryan-team-room-4',
    ] as const;
    for (const id of stillInTheirDesigns) expect(npcBob(NPCS[id]), id).toBeNull();
    // Team Room 2's Ian bobs in his design (`bob 2.4s`). Town Center's Jory
    // still has a default bob without a motion, but her `stage` jump (#150)
    // replaces it at draw time (`designedMotion: true`).
    expect(npcBob(NPCS['ian-team-room-2'])).not.toBeNull();
    expect(npcBob(NPCS.jory)).not.toBeNull();
  });

  it("doesn't bob an NPC whose designed motion replaces it (Dev Pit Ian's walk, PR #136)", () => {
    expect(npcBob(NPCS.ian, { designedMotion: true })).toBeNull();
    expect(npcBob(NPCS.jethro, { designedMotion: true })).toBeNull();
    expect(npcBob(NPCS.ian, { designedMotion: false })).toEqual({ distance: 3, periodMs: 3000 });
  });
});
