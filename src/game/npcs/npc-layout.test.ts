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
    // Team Room 2's Ian bobs in his design (`bob 2.4s`), and Town Center's
    // Jory keeps the default bob as a stand-in for her designed `jump`.
    expect(npcBob(NPCS['ian-team-room-2'])).not.toBeNull();
    expect(npcBob(NPCS.jory)).not.toBeNull();
  });

  it("doesn't bob an NPC whose designed motion replaces it (Dev Pit Ian's walk, PR #136)", () => {
    expect(npcBob(NPCS.ian, { designedMotion: true })).toBeNull();
    expect(npcBob(NPCS.jethro, { designedMotion: true })).toBeNull();
    expect(npcBob(NPCS.ian, { designedMotion: false })).toEqual({ distance: 3, periodMs: 3000 });
  });
});
