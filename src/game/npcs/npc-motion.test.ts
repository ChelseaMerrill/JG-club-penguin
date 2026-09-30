import { describe, expect, it } from 'vitest';
import { NPCS, type NpcId } from '../../npcs/npcs';
import { getNpcMotion } from '../../npcs/npc-motions';
import { depthForTile, tileToScreen } from '../rooms/iso';
import { ROOM_DEFINITIONS } from '../rooms/registry';
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

  it('poses nested prop layers (a casting rod, and the line hanging off it)', () => {
    // The Roof Deck design's casting rod, Anthony's until #146 stood him still
    // at the door he guards; kept here as the one nested-layer example.
    const castingRod: Parameters<typeof createNpcMotion>[0] = {
      props: [
        {
          svg: '<path d="M92 96 L118 10" stroke="#C9A366" stroke-width="3.5"/>',
          motion: {
            keyframes:
              '@keyframes cast { 0%,100% { transform: rotate(-35deg);} 40% { transform: rotate(25deg);} 60% { transform: rotate(20deg);} }',
            animation: 'cast 3s ease-in-out infinite',
            transformOrigin: '92px 96px',
          },
          children: [
            {
              svg: '<path d="M118 10 L118 70" stroke="#F4F4F4" stroke-width="1.2"/>',
              motion: {
                keyframes:
                  '@keyframes line { 0%,100% { transform: rotate(20deg);} 40% { transform: rotate(-30deg);} 60% { transform: rotate(-24deg);} }',
                animation: 'line 3s ease-in-out infinite',
                transformOrigin: '118px 10px',
              },
            },
          ],
        },
      ],
    };
    const motion = createNpcMotion(castingRod, { x: 900, y: 575 }, ORIGIN, {
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

  it("fades a prop layer with its design animation's opacity, nested layers included", () => {
    // A camera that fades in (like Team Room 1's `jup`) holding a flash that
    // blinks on its own (`jflash`); a layer without a motion stays opaque.
    const spec: Parameters<typeof createNpcMotion>[0] = {
      props: [
        {
          svg: '<rect x="34" y="30" width="52" height="32"/>',
          motion: {
            keyframes: '@keyframes fade { 0% { opacity:0; } 50%,100% { opacity:1; } }',
            animation: 'fade 2s linear infinite',
          },
          children: [
            {
              svg: '<circle cx="73.5" cy="36.5" r="22"/>',
              motion: {
                keyframes: '@keyframes blink { 0%,100% { opacity:0; } 50% { opacity:.95; } }',
                animation: 'blink 2s linear infinite',
              },
            },
          ],
        },
        { svg: '<rect x="0" y="0" width="1" height="1"/>' },
      ],
    };
    const motion = createNpcMotion(spec, { x: 900, y: 575 }, ORIGIN, { reducedMotion: false })!;
    motion.advance(500);
    const [camera, still] = motion.pose().props;
    expect(camera.alpha).toBeCloseTo(0.5);
    expect(camera.children[0].alpha).toBeCloseTo(0.475);
    expect(still.alpha).toBe(1);
  });

  it("fades a prop layer with its design's opacity keyframes, and keeps a layer without them opaque", () => {
    const fading: Parameters<typeof createNpcMotion>[0] = {
      props: [
        {
          svg: '<ellipse cx="98" cy="30" rx="2.6" ry="2" fill="#00BDFF"/>',
          motion: {
            keyframes:
              '@keyframes note { 0% { transform: translate(0,0); opacity:0;} 50% { transform: translate(3px,-11px); opacity:1;} 100% { transform: translate(6px,-22px); opacity:0;} }',
            animation: 'note 2.4s linear infinite',
          },
          children: [{ svg: '<circle cx="0" cy="0" r="1"/>' }],
        },
      ],
    };
    const motion = createNpcMotion(fading, { x: 0, y: 0 }, ORIGIN, { reducedMotion: false })!;
    expect(motion.pose().props[0].alpha).toBeCloseTo(0);
    motion.advance(600);
    expect(motion.pose().props[0].alpha).toBeCloseTo(0.5);
    motion.advance(600);
    const [note] = motion.pose().props;
    expect(note.alpha).toBeCloseTo(1);
    expect(transformPoint(note.matrix, { x: 0, y: 0 }).y).toBeCloseTo(-11);
    expect(note.children[0].alpha).toBe(1);
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
    // #146: Anthony stands still at the door he guards, so he has none.
    expect(moving.sort()).toEqual(['brandon', 'millie']);
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

  describe('the Stage-level channel (#150)', () => {
    const REST = { x: 600, y: 475 }; // Jory's slot point in Town Center
    // A Stage-level scale about the Stage's top-left corner, as the design's
    // `jump` group gets with no transform-origin: 0% identity, 50% scaleY(.5).
    const spec = {
      stage: {
        keyframes:
          '@keyframes squash { 0%,100% { transform: scaleY(1);} 50% { transform: translateY(-10px) scaleY(.5);} }',
        animation: 'squash 1s linear infinite',
      },
    };
    function staged() {
      const motion = createNpcMotion(spec, REST, ORIGIN, { reducedMotion: false });
      if (!motion) throw new Error('expected a stage-only spec to have a motion');
      return motion;
    }

    it('creates a motion for a spec with only a stage track, identity at rest', () => {
      const motion = staged();
      expect(motion.roams).toBe(false);
      expect(motion.pose().figure).toBeNull();
      const feet = transformPoint(motion.pose().stage!, { x: 0, y: 0 });
      expect(feet.x).toBeCloseTo(0);
      expect(feet.y).toBeCloseTo(0);
    });

    it("re-expresses the Stage-space transform relative to the NPC's rest point", () => {
      const motion = staged();
      motion.advance(500);
      // Stage y' = 0.5 * y - 10, so the feet (Stage y 475) land at 227.5,
      // 247.5 px up; a point 100 px above the feet lands 50 px above that.
      const feet = transformPoint(motion.pose().stage!, { x: 0, y: 0 });
      const above = transformPoint(motion.pose().stage!, { x: 0, y: -100 });
      expect(REST.y + feet.y).toBeCloseTo(227.5);
      expect(REST.y + above.y).toBeCloseTo(177.5);
      expect(feet.x).toBeCloseTo(0);
    });

    it('keeps the NPC on its slot and keeps playing while paused (dialog open)', () => {
      const motion = staged();
      motion.pause();
      motion.advance(500);
      expect(motion.pose().point).toEqual(REST);
      expect(motion.pose().moving).toBe(false);
      const feet = transformPoint(motion.pose().stage!, { x: 0, y: 0 });
      expect(REST.y + feet.y).toBeCloseTo(227.5);
    });

    it('does nothing under prefers-reduced-motion', () => {
      expect(createNpcMotion(spec, REST, ORIGIN, { reducedMotion: true })).toBeNull();
      expect(
        createNpcMotion(getNpcMotion('jory'), REST, ORIGIN, { reducedMotion: true }),
      ).toBeNull();
    });
  });

  it('only gives a motion to an NPC placed in its own Room (a motion for an unplaced NPC is dead data)', () => {
    for (const id of Object.keys(NPCS) as NpcId[]) {
      if (!getNpcMotion(id)) continue;
      const room = ROOM_DEFINITIONS.find((candidate) => candidate.id === NPCS[id].roomId);
      expect(
        room?.npcSlots.map((slot) => slot.npcId),
        `"${id}" has a motion but no slot in ${NPCS[id].roomId}`,
      ).toContain(id);
    }
  });
});

describe('NpcClickPause: a clicked roaming NPC waits for its dialog (#113)', () => {
  function setup(roaming: string[] = ['brandon', 'anthony']) {
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
    pauser.clicked('anthony');
    expect([...paused]).toEqual(['anthony']);
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
