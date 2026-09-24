import { describe, expect, it } from 'vitest';
import { createLocalPenguinController, facingForStep } from './controller';

function fullyWalkable(columns: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => true));
}

describe('facingForStep', () => {
  it('faces right moving toward increasing col', () => {
    expect(facingForStep({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe('right');
  });

  it('faces left moving toward increasing row', () => {
    expect(facingForStep({ col: 0, row: 0 }, { col: 0, row: 1 })).toBe('left');
  });

  it('faces left moving toward decreasing col', () => {
    expect(facingForStep({ col: 1, row: 0 }, { col: 0, row: 0 })).toBe('left');
  });

  it('faces right moving toward decreasing row', () => {
    expect(facingForStep({ col: 0, row: 1 }, { col: 0, row: 0 })).toBe('right');
  });
});

describe('createLocalPenguinController', () => {
  const walkable = fullyWalkable(6, 6);

  it('starts at the given tile with the default facing', () => {
    const controller = createLocalPenguinController(walkable, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 1, row: 1 },
    });

    expect(controller.state).toEqual({
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 1, row: 1 },
      facing: 'right',
    });
    expect(controller.isMoving()).toBe(false);
    expect(controller.nextTile()).toBeNull();
  });

  it('moveTo sets state.target and returns the path when reachable', () => {
    const controller = createLocalPenguinController(walkable, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 0, row: 0 },
    });

    const path = controller.moveTo({ col: 2, row: 0 });

    expect(path).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ]);
    expect(controller.state.target).toEqual({ col: 2, row: 0 });
    expect(controller.isMoving()).toBe(true);
    expect(controller.nextTile()).toEqual({ col: 1, row: 0 });
  });

  it('moveTo returns null and leaves state untouched when the target is unreachable', () => {
    const blocked = fullyWalkable(4, 4);
    blocked[0][0] = true; // start tile
    blocked[0][1] = false; // right neighbor walled off
    blocked[1][0] = false; // down neighbor walled off
    const controller = createLocalPenguinController(blocked, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 0, row: 0 },
    });

    const result = controller.moveTo({ col: 3, row: 3 });

    expect(result).toBeNull();
    expect(controller.state.target).toBeUndefined();
    expect(controller.isMoving()).toBe(false);
  });

  it('arriveAtNextTile advances the tile and clears target on the final step', () => {
    const controller = createLocalPenguinController(walkable, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 0, row: 0 },
    });
    controller.moveTo({ col: 2, row: 0 });

    expect(controller.arriveAtNextTile()).toEqual({ col: 1, row: 0 });
    expect(controller.state.tile).toEqual({ col: 1, row: 0 });
    expect(controller.state.target).toEqual({ col: 2, row: 0 });
    expect(controller.isMoving()).toBe(true);

    expect(controller.arriveAtNextTile()).toEqual({ col: 2, row: 0 });
    expect(controller.state.tile).toEqual({ col: 2, row: 0 });
    expect(controller.state.target).toBeUndefined();
    expect(controller.isMoving()).toBe(false);
    expect(controller.nextTile()).toBeNull();
  });

  it('arriveAtNextTile is a no-op when nothing is moving', () => {
    const controller = createLocalPenguinController(walkable, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 3, row: 3 },
    });

    expect(controller.arriveAtNextTile()).toEqual({ col: 3, row: 3 });
    expect(controller.state.tile).toEqual({ col: 3, row: 3 });
  });

  it('setFacing updates state.facing directly', () => {
    const controller = createLocalPenguinController(walkable, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 0, row: 0 },
    });

    controller.setFacing('left');

    expect(controller.state.facing).toBe('left');
  });

  it('a new moveTo mid-walk re-routes from the current tile, replacing the old path', () => {
    const controller = createLocalPenguinController(walkable, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 0, row: 0 },
    });
    controller.moveTo({ col: 4, row: 0 });
    controller.arriveAtNextTile(); // now at (1, 0), still walking toward (4, 0)

    const rerouted = controller.moveTo({ col: 1, row: 3 });

    expect(rerouted![0]).toEqual({ col: 1, row: 0 });
    expect(controller.state.target).toEqual({ col: 1, row: 3 });
  });

  it('stop cancels the active path and clears target in place', () => {
    const controller = createLocalPenguinController(walkable, {
      playerId: 'p1',
      roomId: 'town-center',
      tile: { col: 0, row: 0 },
    });
    controller.moveTo({ col: 2, row: 0 });
    controller.arriveAtNextTile();

    controller.stop();

    expect(controller.isMoving()).toBe(false);
    expect(controller.state.target).toBeUndefined();
    expect(controller.state.tile).toEqual({ col: 1, row: 0 });
  });
});
