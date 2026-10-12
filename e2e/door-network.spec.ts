import { mkdirSync, rmSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { RoomId, Tile } from '../src/contracts';
import { npcLayout } from '../src/game/npcs/npc-layout';
import { bathroom } from '../src/game/rooms/definitions/bathroom';
import { devPit } from '../src/game/rooms/definitions/dev-pit';
import { igloo } from '../src/game/rooms/definitions/igloo';
import { officeHallway } from '../src/game/rooms/definitions/office-hallway';
import { roofDeck } from '../src/game/rooms/definitions/roof-deck';
import { teamRoom1 } from '../src/game/rooms/definitions/team-room-1';
import { teamRoom2 } from '../src/game/rooms/definitions/team-room-2';
import { teamRoom3 } from '../src/game/rooms/definitions/team-room-3';
import { teamRoom4 } from '../src/game/rooms/definitions/team-room-4';
import { theIcebox } from '../src/game/rooms/definitions/the-icebox';
import { theMelt } from '../src/game/rooms/definitions/the-melt';
import { theMullet } from '../src/game/rooms/definitions/the-mullet';
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDefinition, RoomDoor } from '../src/game/rooms/room-definition';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';
import { waitForElevatorHidden } from './support/elevator';
import type { RoomDebugInfo } from './support/room-debug-types';

/**
 * #170's door network: every door and exit pill of every HQ Room, clicked
 * from the Room's spawn tile, goes to the Room its design links and lands on
 * the matching door; locked ones show UNDER CONSTRUCTION with no walk and no
 * Room change. The expectations are this file's own design table (RT2-8),
 * not the Room definitions: only the hotspots come from those. The Stairwell
 * floors are `remaining-rooms.spec.ts`'s. One screenshot per exit goes to
 * `test-results/170-b-door-network/`.
 */

test.use({ viewport: { width: GAME_WIDTH, height: GAME_HEIGHT } });

const BOOT_TIMEOUT = 15_000;
const WALK_TIMEOUT = 20_000;
const SHOTS = 'test-results/170-b-door-network';
const HIT_AREA = npcLayout({ kind: 'human' }).hitArea;

type Kind = 'door' | 'pill';

/** [label, kind, target Room (`null` = locked), landing tile in the target]. */
type Exit = [string, Kind, RoomId | null, Tile | null];

const t = (col: number, row: number): Tile => ({ col, row });

/** The design's links and #170 D8's landings, Room by Room, in `doors` order. */
const DESIGN: [RoomDefinition, Exit[]][] = [
  [
    townCenter,
    [
      ['KITCHEN', 'door', 'the-melt', t(0, 6)],
      ['THE HALLWAY', 'door', 'office-hallway', t(0, 2)],
      ['STAIRWELL', 'door', 'stairwell-5', t(0, 7)],
      ['ELEVATOR · ROOF DECK', 'door', 'roof-deck', t(4, 9)],
      ['KITCHEN', 'pill', 'the-melt', t(0, 6)],
    ],
  ],
  [
    officeHallway,
    [
      ['TOWN CENTER', 'door', 'town-center', t(10, 0)],
      ['TEAM ROOM 1', 'door', 'team-room-1', t(6, 0)],
      ['TEAM ROOM 2', 'door', 'team-room-2', t(5, 0)],
      ['TEAM ROOM 3', 'door', 'team-room-3', t(5, 0)],
      ['TEAM ROOM 4', 'door', 'team-room-4', t(5, 0)],
      ['BATHROOM', 'door', 'bathroom', t(7, 0)],
      ['DEV PIT', 'door', 'dev-pit', t(0, 1)],
      ['TOWN CENTER', 'pill', 'town-center', t(10, 0)],
      ['DEV PIT', 'pill', 'dev-pit', t(0, 1)],
    ],
  ],
  [
    devPit,
    [
      ['THE ICEBOX', 'door', 'the-icebox', t(10, 0)],
      ['THE HALLWAY', 'door', 'office-hallway', t(11, 0)],
      ['THE HALLWAY', 'pill', 'office-hallway', t(11, 0)],
      ['THE MULLET', 'pill', 'the-mullet', t(13, 0)],
    ],
  ],
  [
    theIcebox,
    [
      ['DEV PIT', 'door', 'dev-pit', t(1, 0)],
      ['DEV PIT', 'pill', 'dev-pit', t(1, 0)],
    ],
  ],
  [
    theMelt,
    [
      ['TOWN CENTER', 'door', 'town-center', t(2, 0)],
      ['ROOF DECK', 'door', 'roof-deck', t(6, 9)],
      ['TOWN CENTER', 'pill', 'town-center', t(2, 0)],
      ['ROOF DECK', 'pill', 'roof-deck', t(6, 9)],
    ],
  ],
  [
    roofDeck,
    [
      ['KITCHEN', 'door', 'the-melt', t(10, 0)],
      ['KITCHEN', 'pill', 'the-melt', t(10, 0)],
      ['ELEVATOR', 'pill', 'town-center', t(0, 7)],
      ['STAIRS', 'pill', 'stairwell-5', t(2, 0)],
    ],
  ],
  [
    theMullet,
    [
      ['HALLWAY B', 'door', null, null],
      ['DEV PIT', 'door', 'dev-pit', t(11, 2)],
      ['HALLWAY B', 'pill', null, null],
      ['DEV PIT', 'pill', 'dev-pit', t(11, 2)],
    ],
  ],
  [
    bathroom,
    [
      ['THE HALLWAY', 'door', 'office-hallway', t(9, 0)],
      ['THE HALLWAY', 'pill', 'office-hallway', t(9, 0)],
    ],
  ],
  ...[teamRoom1, teamRoom2, teamRoom3, teamRoom4].map((room, index): [RoomDefinition, Exit[]] => [
    room,
    [
      ['THE HALLWAY', 'door', 'office-hallway', t(1 + 2 * index, 0)],
      ['THE HALLWAY', 'pill', 'office-hallway', t(1 + 2 * index, 0)],
    ],
  ]),
  [
    igloo,
    [
      ['TOWN CENTER', 'door', 'town-center', t(6, 8)],
      ['TOWN CENTER', 'pill', 'town-center', t(6, 8)],
    ],
  ],
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function debugInfo(page: Page): Promise<RoomDebugInfo | undefined> {
  return page.evaluate(() => window.__roomDebug);
}

async function clickStagePoint(page: Page, point: { x: number; y: number }): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('canvas not visible');
  await page.mouse.click(
    canvasBox.x + (point.x * canvasBox.width) / GAME_WIDTH,
    canvasBox.y + (point.y * canvasBox.height) / GAME_HEIGHT,
  );
}

/** Enters `roomId` on its spawn tile (by way of another Room when already there). */
async function enterAtSpawn(page: Page, room: RoomDefinition): Promise<void> {
  const go = async (id: RoomId) => {
    await page.evaluate((target) => window.__roomDebug?.changeRoom?.(target), id);
    await expect
      .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT })
      .toBe(id);
    await waitForElevatorHidden(page);
  };
  if ((await debugInfo(page))?.roomId === room.id) {
    await go(room.id === 'office-hallway' ? 'town-center' : 'office-hallway');
  }
  await go(room.id);
  await expect
    .poll(async () => (await debugInfo(page))?.localPenguin?.tile)
    .toEqual(room.spawnTile);
}

/**
 * A point on `door`'s hotspot that no walking NPC's click zone covers right
 * now (NPCs are hit-tested before doors): the centre where it's clear.
 */
async function clearDoorPoint(page: Page, door: RoomDoor): Promise<{ x: number; y: number }> {
  const npcs = Object.values((await debugInfo(page))?.npcs ?? {});
  const covered = (x: number, y: number) =>
    npcs.some(
      (npc) =>
        Math.abs(x - (npc.x + HIT_AREA.centerX)) <= HIT_AREA.width / 2 + 12 &&
        Math.abs(y - (npc.y + HIT_AREA.centerY)) <= HIT_AREA.height / 2 + 12,
    );
  const { x, y, width, height } = door.hotspot;
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.5, 0.3],
    [0.5, 0.7],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.25, 0.25],
    [0.75, 0.75],
  ]) {
    const point = { x: x + width * fx, y: y + height * fy };
    if (!covered(point.x, point.y)) return point;
  }
  return { x: x + width / 2, y: y + height / 2 };
}

for (const [room, exits] of DESIGN) {
  test(`${room.id}: every door and pill goes where its design links, landing on the matching door`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    const dir = `${SHOTS}/${room.id}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    await page.goto('/?asPlayer');
    await expect
      .poll(async () => (await debugInfo(page))?.localPenguin, { timeout: BOOT_TIMEOUT })
      .not.toBeUndefined();

    expect(
      room.doors.map((door) => [door.label, door.kind ?? 'door']),
      `${room.id}'s exits, in order`,
    ).toEqual(exits.map(([label, kind]) => [label, kind]));

    for (const [index, [label, kind, target, landing]] of exits.entries()) {
      const door = room.doors[index]!;
      const name = `${room.id} / ${label} (${kind})`;
      await enterAtSpawn(page, room);
      const before = await debugInfo(page);

      await clickStagePoint(page, await clearDoorPoint(page, door));
      const file = `${dir}/${String(index).padStart(2, '0')}-${kind}-${label.replace(/[^A-Z0-9]+/gi, '-').toLowerCase()}.png`;

      if (target === null) {
        await expect
          .poll(async () => (await debugInfo(page))?.lockedHint, {
            timeout: WALK_TIMEOUT,
            intervals: [50],
            message: name,
          })
          .toBe(label);
        await page.screenshot({ path: file });
        const after = await debugInfo(page);
        expect(after?.roomId, name).toBe(room.id);
        expect(after?.localPenguin?.tile, name).toEqual(before?.localPenguin?.tile);
        expect(after?.localPenguinMoveLog?.length, name).toBe(before?.localPenguinMoveLog?.length);
        // Let the hint clear before the next exit.
        await expect
          .poll(async () => (await debugInfo(page))?.lockedHint, { timeout: 15_000 })
          .toBeNull();
        continue;
      }

      // #170 D9: an Elevator door asks which floor first; pick the one it links to.
      const floor = door.floorChoices?.find((choice) => choice.targetRoomId === target)?.floor;
      if (floor) {
        await page
          .getByRole('dialog', { name: 'ELEVATOR · PICK A FLOOR' })
          .getByRole('button', { name: new RegExp(`^${floor} /`) })
          .click({ timeout: WALK_TIMEOUT });
      }

      await expect
        .poll(async () => (await debugInfo(page))?.roomId, { timeout: WALK_TIMEOUT, message: name })
        .toBe(target);
      await waitForElevatorHidden(page);
      await expect
        .poll(async () => (await debugInfo(page))?.localPenguin?.tile, { message: name })
        .toEqual(landing);
      await page.screenshot({ path: file });
    }

    expect(errors).toEqual([]);
  });
}
