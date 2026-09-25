import { expect, test, type Page } from '@playwright/test';
import { computeDebugOverlay, type DebugOverlayMarker } from '../src/game/rooms/debug-overlay';
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
import { townCenter } from '../src/game/rooms/definitions/town-center';
import type { RoomDefinition } from '../src/game/rooms/room-definition';
import { ROOM_IDS, type RoomId } from '../src/contracts';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/game/stage-size';

// Imports each definition module directly rather than
// `src/game/rooms/registry.ts`'s `getRoomDefinition`: the registry's
// module-load-time `assertValidRoomDefinitions` guard reads
// `import.meta.env.DEV`/`MODE`, which only Vite (not Playwright's plain
// Node/TS execution) defines — the same reason `room-framework.spec.ts`
// avoids importing `dev-room-hook.ts` directly.
const ROOM_DEFINITIONS: Record<RoomId, RoomDefinition> = {
  'town-center': townCenter,
  'dev-pit': devPit,
  'the-melt': theMelt,
  'roof-deck': roofDeck,
  igloo,
  'the-icebox': theIcebox,
  'office-hallway': officeHallway,
  'team-room-1': teamRoom1,
  'team-room-2': teamRoom2,
  'team-room-3': teamRoom3,
  'team-room-4': teamRoom4,
  bathroom,
};

/** Fails the test on any uncaught page error or console error. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/**
 * Hides the signed-out Landing page, the same way
 * `e2e/smoke.spec.ts` does, so the Room underneath is fully visible for the
 * screenshot. None of these Rooms touch auth, so every visit here is
 * signed-out.
 */
async function hideLandingPage(page: Page): Promise<void> {
  await expect(page.locator('#ui .landing')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#ui .landing')!.hidden = true;
  });
}

/**
 * Draws `markers` (#16 D8's debug overlay: every walkable-mask tile, door,
 * NPC slot, furniture slot and hotspot, in 1600x900 stage-pixel coordinates)
 * as an SVG layer positioned exactly over the game canvas, scaled with it via
 * a matching `viewBox`. This never touches `RoomScene.ts` or any app code —
 * `src/game/rooms/debug-overlay.ts` only computes plain marker data, and this
 * function injects it directly into the page for the screenshot, entirely
 * from the test side.
 */
async function drawDebugOverlay(page: Page, markers: DebugOverlayMarker[]): Promise<void> {
  const canvasBox = await page.locator('#game canvas').boundingBox();
  if (!canvasBox) throw new Error('game canvas has no bounding box');

  await page.evaluate(
    ({ markers, canvasBox, gameWidth, gameHeight }) => {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${gameWidth} ${gameHeight}`);
      svg.style.position = 'fixed';
      svg.style.left = `${canvasBox.x}px`;
      svg.style.top = `${canvasBox.y}px`;
      svg.style.width = `${canvasBox.width}px`;
      svg.style.height = `${canvasBox.height}px`;
      svg.style.zIndex = '99999';
      svg.style.pointerEvents = 'none';
      svg.id = 'debug-grid-overlay';

      for (const marker of markers) {
        if (marker.kind === 'tile') {
          const polygon = document.createElementNS(NS, 'polygon');
          polygon.setAttribute('points', marker.points);
          polygon.setAttribute(
            'fill',
            marker.walkable ? 'rgba(0,189,255,0.28)' : 'rgba(255,0,80,0.35)',
          );
          polygon.setAttribute('stroke', marker.walkable ? '#00BDFF' : '#FF0050');
          polygon.setAttribute('stroke-width', '1');
          svg.appendChild(polygon);
        } else if (marker.kind === 'door' || marker.kind === 'hotspot') {
          const rect = document.createElementNS(NS, 'rect');
          rect.setAttribute('x', String(marker.x));
          rect.setAttribute('y', String(marker.y));
          rect.setAttribute('width', String(marker.width));
          rect.setAttribute('height', String(marker.height));
          rect.setAttribute('fill', 'none');
          rect.setAttribute('stroke', marker.kind === 'door' ? '#FFD400' : '#7CFF00');
          rect.setAttribute('stroke-width', '4');
          svg.appendChild(rect);
          const text = document.createElementNS(NS, 'text');
          text.setAttribute('x', String(marker.x + 4));
          text.setAttribute('y', String(marker.y + 16));
          text.setAttribute('fill', marker.kind === 'door' ? '#FFD400' : '#7CFF00');
          text.setAttribute('font-size', '16');
          text.textContent = marker.label;
          svg.appendChild(text);
        } else {
          const circle = document.createElementNS(NS, 'circle');
          circle.setAttribute('cx', String(marker.x));
          circle.setAttribute('cy', String(marker.y));
          circle.setAttribute('r', marker.kind === 'npc' ? '10' : '8');
          circle.setAttribute('fill', marker.kind === 'npc' ? '#FF00E5' : '#FFA500');
          svg.appendChild(circle);
          const text = document.createElementNS(NS, 'text');
          text.setAttribute('x', String(marker.x + 12));
          text.setAttribute('y', String(marker.y));
          text.setAttribute('fill', marker.kind === 'npc' ? '#FF00E5' : '#FFA500');
          text.setAttribute('font-size', '14');
          text.textContent = marker.label;
          svg.appendChild(text);
        }
      }

      document.body.appendChild(svg);
    },
    { markers, canvasBox, gameWidth: GAME_WIDTH, gameHeight: GAME_HEIGHT },
  );
}

for (const roomId of ROOM_IDS) {
  // Named to match its `test-results/room-<id>/` output folder (#16 fix 6).
  test(`room-${roomId}`, async ({ page }) => {
    const errors = collectErrors(page);

    const imageResponse = page.waitForResponse(
      (response) => response.url().endsWith(`rooms/${roomId}.png`),
      { timeout: 15_000 },
    );

    await page.goto(`/?room=${roomId}`);
    const canvas = page.locator('#game canvas');
    await expect(canvas).toBeVisible();
    await hideLandingPage(page);

    const response = await imageResponse;
    expect(response.ok()).toBe(true);

    await page.screenshot({ path: `test-results/room-${roomId}/screenshot.png` });

    const markers = computeDebugOverlay(ROOM_DEFINITIONS[roomId]);
    await drawDebugOverlay(page, markers);
    await page.screenshot({ path: `test-results/room-${roomId}/grid.png` });

    expect(errors).toEqual([]);
  });
}
