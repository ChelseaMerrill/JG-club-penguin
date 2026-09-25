import { describe, expect, it } from 'vitest';
import { NPCS, type NpcId } from '../../npcs/npcs';
import { getNpcMotion } from '../../npcs/npc-motions';
import { depthForTile, tileToScreen } from '../rooms/iso';
import { transformPoint } from './css-keyframes';
import { createNpcMotion, NpcClickPause } from './npc-motion';

const ORIGIN = { x: 800, y: 250 }; // the standard Room grid origin
const BRANDON_REST = tileToScreen({ col: 4, row: 6 }, ORIGIN); // (700, 525)

function brandon() {
  const motion = createNpcMotion(getNpcMotion('brandon'), BRANDON_REST, ORIGIN, {
    reducedMotion: false,
  });
  if (!motion) throw new Error('expected Brandon to have a motion');
  return motion;
}

describe('NPC motion (#113)', () => {
  it("follows the design's path in Stage pixels from the NPC's slot point", () => {
    const motion = brandon();
    expect(motion.roams).toBe(true);
    expect(motion.pose().point).toEqual({ x: 700, y: 525 });

    // mkBrandonGallop's 20% stop, translate(150px, 75px), 5.2s into 26s.
    motion.advance(5_200);
    expect(motion.pose().point.x).toBeCloseTo(850);
    expect(motion.pose().point.y).toBeCloseTo(600);
    expect(motion.pose().moving).toBe(true);
  });

  it('sorts by the tile under its current point, like a Penguin', () => {
    const motion = brandon();
    expect(motion.pose().depth).toBeCloseTo(depthForTile({ col: 4, row: 6 }));
    motion.advance(5_200);
    // (850, 600) is the centre of tile { col: 7, row: 6 }.
    expect(motion.pose().depth).toBeCloseTo(depthForTile({ col: 7, row: 6 }));
  });

  it('loops the path forever', () => {
    const once = brandon();
    once.advance(5_000);
    const looped = brandon();
    looped.advance(5_000 + 26_000 * 2);
    expect(looped.pose().point.x).toBeCloseTo(once.pose().point.x);
    expect(looped.pose().point.y).toBeCloseTo(once.pose().point.y);
  });

  it('pauses where it is and resumes the loop from the same point', () => {
    const motion = brandon();
    motion.advance(2_000);
    const pausedAt = motion.pose().point;

    motion.pause();
    motion.advance(6_000);
    expect(motion.pose().point).toEqual(pausedAt);
    expect(motion.pose().moving).toBe(false);
    expect(motion.paused).toBe(true);

    motion.resume();
    motion.advance(1_000);
    const reference = brandon();
    reference.advance(3_000);
    expect(motion.pose().point.x).toBeCloseTo(reference.pose().point.x);
    expect(motion.pose().point.y).toBeCloseTo(reference.pose().point.y);
  });

  it('keeps an in-place motion going while paused (Brandon still gallops)', () => {
    const motion = brandon();
    motion.pause();
    const head = { x: 0, y: -100 }; // feet-relative, straight above the feet
    const before = transformPoint(motion.pose().figure!, head);
    motion.advance(225); // half a 0.45s gallop
    const after = transformPoint(motion.pose().figure!, head);
    expect(after.x).not.toBeCloseTo(before.x);
  });

  it("rocks the figure around the design's transform-origin, expressed relative to the feet", () => {
    const motion = brandon();
    const figure = motion.pose().figure!;
    // gallop pivots on the feet (60px 120px), which is the sprite's origin.
    expect(transformPoint(figure, { x: 0, y: 0 }).x).toBeCloseTo(0);
    expect(transformPoint(figure, { x: 0, y: 0 }).y).toBeCloseTo(0);
    // rotate(-4deg) leans the head left.
    expect(transformPoint(figure, { x: 0, y: -100 }).x).toBeLessThan(-5);
  });

  it("poses nested prop layers (Anthony's rod, and the line hanging off it)", () => {
    const motion = createNpcMotion(getNpcMotion('anthony'), { x: 900, y: 575 }, ORIGIN, {
      reducedMotion: false,
    })!;
    const [rod] = motion.pose().props;
    expect(rod.children).toHaveLength(1);
    // The rod pivots on the hand (92px 96px): feet-relative (32, -24).
    const hand = transformPoint(rod.matrix, { x: 32, y: -24 });
    expect(hand.x).toBeCloseTo(32);
    expect(hand.y).toBeCloseTo(-24);
    // cast starts at rotate(-35deg): the rod tip (118, 10) swings left of straight.
    expect(transformPoint(rod.matrix, { x: 58, y: -110 }).x).toBeLessThan(58);
  });

  it('does nothing under prefers-reduced-motion, or for an NPC with no designed motion', () => {
    expect(
      createNpcMotion(getNpcMotion('brandon'), BRANDON_REST, ORIGIN, { reducedMotion: true }),
    ).toBeNull();
    expect(
      createNpcMotion(getNpcMotion('kevin'), BRANDON_REST, ORIGIN, { reducedMotion: false }),
    ).toBeNull();
  });

  it('gives every Roof Deck NPC with a designed motion its motion', () => {
    const moving = (Object.keys(NPCS) as NpcId[]).filter(
      (id) => NPCS[id].roomId === 'roof-deck' && getNpcMotion(id),
    );
    expect(moving.sort()).toEqual(['anthony', 'brandon', 'millie', 'tristin']);
  });

  it('compiles every motion in the registry, and only for known NPCs', () => {
    for (const id of Object.keys(NPCS) as NpcId[]) {
      const spec = getNpcMotion(id);
      if (!spec) continue;
      expect(() =>
        createNpcMotion(spec, BRANDON_REST, ORIGIN, { reducedMotion: false }),
      ).not.toThrow();
    }
    expect(getNpcMotion('not-an-npc')).toBeUndefined();
  });
});

describe('NpcClickPause: a clicked roaming NPC waits for its dialog (#113)', () => {
  function setup(roaming: string[] = ['brandon', 'tristin']) {
    const paused = new Set<string>();
    const pauser = new NpcClickPause({
      roams: (id) => roaming.includes(id),
      pause: (id) => paused.add(id),
      resume: (id) => paused.delete(id),
    });
    return { pauser, paused };
  }

  it('pauses a roaming NPC on click, keeps it paused through its dialog, resumes on close', () => {
    const { pauser, paused } = setup();
    pauser.clicked('brandon');
    expect([...paused]).toEqual(['brandon']);

    pauser.settle({ arrivalPending: true });
    expect([...paused]).toEqual(['brandon']);

    pauser.dialogOpened('brandon');
    pauser.settle({ arrivalPending: false });
    expect([...paused]).toEqual(['brandon']);

    pauser.dialogClosed('brandon');
    expect([...paused]).toEqual([]);
  });

  it('resumes if the walk to it ends without its dialog opening (re-routed, blocked, another overlay)', () => {
    const { pauser, paused } = setup();
    pauser.clicked('brandon');
    pauser.settle({ arrivalPending: false });
    expect([...paused]).toEqual([]);
  });

  it('resumes the previously clicked NPC when another NPC is clicked first', () => {
    const { pauser, paused } = setup();
    pauser.clicked('brandon');
    pauser.clicked('tristin');
    expect([...paused]).toEqual(['tristin']);
  });

  it('never pauses an NPC that does not roam', () => {
    const { pauser, paused } = setup();
    pauser.clicked('josh');
    expect([...paused]).toEqual([]);
    pauser.dialogOpened('josh');
    pauser.dialogClosed('josh');
    expect([...paused]).toEqual([]);
  });

  it('keeps a dialog-open NPC paused when it is clicked again', () => {
    const { pauser, paused } = setup();
    pauser.clicked('brandon');
    pauser.dialogOpened('brandon');
    pauser.clicked('brandon');
    pauser.settle({ arrivalPending: false });
    expect([...paused]).toEqual(['brandon']);
  });
});
