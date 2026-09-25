import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type Facing, type PenguinLook, type PresencePayload } from '../../contracts';
import { MASKED_NAME } from '../../ui/mask-names';
import type { ScreenPoint } from './iso';
import { RoomPenguinView, type PlacedPenguin } from './room-penguin-view';

/** What the fake stage (standing in for Phaser) currently shows for one Penguin. */
interface ShownPenguin {
  look: PenguinLook;
  point: ScreenPoint;
  depth: number;
  facing: Facing;
  destroyed: boolean;
  bubble: string | null;
}

/** A fake rendering stage: records every Penguin placed on it and its current state. */
function createFakeStage() {
  const placed: ShownPenguin[] = [];
  const place = (
    look: PenguinLook,
    point: ScreenPoint,
    depth: number,
    facing: Facing,
  ): PlacedPenguin => {
    const shown: ShownPenguin = { look, point, depth, facing, destroyed: false, bubble: null };
    placed.push(shown);
    return {
      setLook: (next) => {
        shown.look = next;
      },
      setFacing: (next) => {
        shown.facing = next;
      },
      moveTo: (nextPoint, nextDepth) => {
        shown.point = nextPoint;
        shown.depth = nextDepth;
      },
      say: (text) => {
        shown.bubble = text;
      },
      destroy: () => {
        shown.destroyed = true;
      },
    };
  };
  return { place, placed, live: () => placed.filter((p) => !p.destroyed) };
}

// Town Center's grid origin (tile {0,0}'s north corner).
const TOWN_CENTER_ORIGIN = { x: 800, y: 250 };
// Dev Pit-style second origin, to prove a Room switch re-projects.
const OTHER_ORIGIN = { x: 700, y: 200 };

const PEBBLE: PenguinLook = { ...DEFAULT_LOOK, name: 'Pebble', body: '#E8483B' };

function payload(overrides: Partial<PresencePayload> = {}): PresencePayload {
  return {
    playerId: 'player-b',
    look: PEBBLE,
    tile: { col: 3, row: 5 },
    facing: 'right',
    ...overrides,
  };
}

function attachedView(search = '') {
  const stage = createFakeStage();
  const view = new RoomPenguinView({ search });
  view.attach(stage.place, TOWN_CENTER_ORIGIN);
  return { stage, view };
}

describe('RoomPenguinView', () => {
  it('shows a remote Penguin standing on the centre of its tile, with its look and facing', () => {
    const { stage, view } = attachedView();

    view.upsert(payload({ facing: 'left' }));

    // Tile {3,5}: north corner (800 + (3-5)*50, 250 + 8*25) = (700, 450),
    // centre 25px lower. Screen row 8, col 3 sorts at depth 8003.
    expect(stage.live()).toEqual([
      {
        look: PEBBLE,
        point: { x: 700, y: 475 },
        depth: 8003,
        facing: 'left',
        destroyed: false,
        bubble: null,
      },
    ]);
  });

  it('updates an already-shown Penguin in place instead of placing a second one', () => {
    const { stage, view } = attachedView();
    const renamed: PenguinLook = { ...PEBBLE, name: 'Waddles', body: '#3A4046', emote: 'DANCE' };

    view.upsert(payload());
    view.upsert(payload({ look: renamed, tile: { col: 6, row: 1 }, facing: 'left' }));

    // Tile {6,1}: north corner (800 + 5*50, 250 + 7*25) = (1050, 425).
    expect(stage.placed).toHaveLength(1);
    expect(stage.live()).toEqual([
      {
        look: renamed,
        point: { x: 1050, y: 450 },
        depth: 7006,
        facing: 'left',
        destroyed: false,
        bubble: null,
      },
    ]);
  });

  it('destroys a removed Penguin and ignores a Player it never showed', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));
    view.upsert(payload({ playerId: 'player-c', tile: { col: 4, row: 4 } }));

    view.remove('player-b');
    view.remove('never-shown');

    expect(stage.live().map((p) => p.point)).toEqual([{ x: 800, y: 475 }]);
  });

  it('clears every remote Penguin and the local Penguin', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));
    view.showLocal(payload({ playerId: 'player-a', tile: { col: 4, row: 4 } }));

    view.clear();

    expect(stage.placed).toHaveLength(2);
    expect(stage.live()).toEqual([]);
  });

  it('does not draw a remote Penguin whose payload has an empty name (#75)', () => {
    const { stage, view } = attachedView();

    view.upsert(payload({ look: { ...PEBBLE, name: '' } }));

    expect(stage.placed).toHaveLength(0);
  });

  it('hides an already-shown Penguin that goes nameless, rather than showing it blank (#75)', () => {
    const { stage, view } = attachedView();
    view.upsert(payload());

    view.upsert(payload({ look: { ...PEBBLE, name: '' } }));

    expect(stage.live()).toEqual([]);
    expect(stage.placed).toHaveLength(1);
  });

  it('never draws a nameless local Penguin either (#75)', () => {
    const { stage, view } = attachedView();

    view.showLocal(payload({ playerId: 'player-a', look: { ...PEBBLE, name: '' } }));

    expect(stage.placed).toHaveLength(0);
  });

  it('does not draw a nameless Penguin even under ?masknames (review round 1)', () => {
    const { stage, view } = attachedView('?masknames');

    view.upsert(payload({ look: { ...PEBBLE, name: '' } }));

    expect(stage.placed).toHaveLength(0);
  });

  it('masks every name tag, including on an update, under ?masknames', () => {
    const { stage, view } = attachedView('?debug&masknames');

    view.upsert(payload());
    view.upsert(payload({ look: { ...PEBBLE, name: 'Waddles' } }));
    view.showLocal(payload({ playerId: 'player-a', look: { ...PEBBLE, name: 'Ada' } }));

    expect(stage.live().map((p) => p.look.name)).toEqual([MASKED_NAME, MASKED_NAME]);
    expect(stage.live()[0].look.body).toBe(PEBBLE.body);
  });

  it('re-shows every Penguin in the entered Room once the scene restarts for it', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));
    view.showLocal(payload({ playerId: 'player-a', tile: { col: 4, row: 4 } }));

    // The old scene's display list (and these Penguins) is torn down by Phaser.
    view.detach();
    view.upsert(payload({ playerId: 'player-c', tile: { col: 1, row: 1 } }));
    view.remove('player-b');
    const nextStage = createFakeStage();
    view.attach(nextStage.place, OTHER_ORIGIN);

    // Against origin (700, 200): tile {1,1} centre (700, 275); tile {4,4} centre (700, 425).
    expect(nextStage.live().map((p) => p.point)).toEqual([
      { x: 700, y: 425 },
      { x: 700, y: 275 },
    ]);
    expect(stage.live().filter((p) => p.destroyed)).toEqual([]);
  });

  it('says (and clears) a chat bubble above a shown remote Penguin, ignoring a Player not shown (#44)', () => {
    const { stage, view } = attachedView();
    view.upsert(payload({ playerId: 'player-b' }));

    expect(view.say('player-b', 'hello there')).toBe(true);
    expect(view.say('never-shown', 'ignored')).toBe(false);

    expect(stage.live()[0].bubble).toBe('hello there');

    expect(view.say('player-b', null)).toBe(true);

    expect(stage.live()[0].bubble).toBeNull();
  });

  it('says (and clears) a chat bubble above the local Penguin (#44)', () => {
    const { stage, view } = attachedView();
    view.showLocal(payload({ playerId: 'player-a' }));

    expect(view.sayLocal('hi')).toBe(true);

    expect(stage.live()[0].bubble).toBe('hi');

    expect(view.sayLocal(null)).toBe(true);

    expect(stage.live()[0].bubble).toBeNull();
  });

  it('sayLocal is a no-op (returns false) while the local Penguin is not shown', () => {
    const { view } = attachedView();

    expect(view.sayLocal('hi')).toBe(false);
  });

  it('notifies onBubbleChange(playerId, null) when a remote Penguin is removed (#44 review fix F1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);
    view.upsert(payload({ playerId: 'player-b' }));
    view.say('player-b', 'hello there');

    view.remove('player-b');

    expect(changes).toEqual([['player-b', null]]);
  });

  it('notifies onBubbleChange(playerId, null) for every shown Penguin on clear() (#44 review fix F1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.upsert(payload({ playerId: 'player-b' }));
    view.showLocal(payload({ playerId: 'player-a', tile: { col: 4, row: 4 } }));
    view.say('player-b', 'hi');
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.clear();

    expect(changes).toEqual(
      expect.arrayContaining([
        ['player-b', null],
        ['player-a', null],
      ]),
    );
  });

  it('notifies onBubbleChange(playerId, null) for every placed Penguin on detach() (#44 review fix F1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.upsert(payload({ playerId: 'player-b' }));
    view.say('player-b', 'hi');
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.detach();

    expect(changes).toEqual([['player-b', null]]);
  });

  it('clears a shown chat bubble and notifies onBubbleChange when a Penguin goes nameless (review round 1)', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.upsert(payload({ playerId: 'player-b' }));
    view.say('player-b', 'hello there');
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.upsert(payload({ playerId: 'player-b', look: { ...PEBBLE, name: '' } }));

    expect(changes).toEqual([['player-b', null]]);
    expect(view.say('player-b', 'still there?')).toBe(false);
  });

  it('never notifies onBubbleChange for a Player never shown', () => {
    const { view } = attachedView();
    const changes: Array<[string, string | null]> = [];
    view.onBubbleChange = (playerId, text) => changes.push([playerId, text]);

    view.remove('never-shown');

    expect(changes).toEqual([]);
  });
});
