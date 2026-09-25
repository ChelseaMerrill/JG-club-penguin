/// <reference types="node" />
// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents, type RoomId } from '../../contracts';
import { townCenter } from '../../game/rooms/definitions/town-center';
import type { RoomHotspot, RoomWallText } from '../../game/rooms/room-definition';
import {
  createWallText,
  HEADING_FONT_SIZE_PX,
  HEADING_LETTER_SPACING_PX,
  LABEL_FONT_SIZE_PX,
  LABEL_LETTER_SPACING_PX,
  type WallText,
  type WallTextDeps,
} from './wall-text';

// `scripts/` sits directly under the repo root, same as
// `scripts/penguin-text-to-paths.ts`'s own `ANTON_PATH` (#62).
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const ANTON_PATH = path.resolve(currentDir, '../../../scripts/fonts/anton/Anton-Regular.ttf');

/**
 * Measures `text`'s rendered advance width the way Chromium's own SVG/DOM
 * text layout applies `letter-spacing`: every glyph's advance plus
 * `letterSpacing`, including after the trailing glyph. Mirrors
 * `scripts/penguin-text-to-paths.ts`'s `layoutTextPath` measurement (#62
 * review fix 2 established this exact rule).
 */
function measureWidth(
  font: opentype.Font,
  text: string,
  fontSize: number,
  letterSpacing: number,
): number {
  const chars = Array.from(text);
  const scale = fontSize / font.unitsPerEm;
  const advances = chars.map((ch) => font.charToGlyph(ch).advanceWidth * scale);
  return advances.reduce((sum, advance) => sum + advance, 0) + letterSpacing * chars.length;
}

describe("Town Center's Core Values poster fits its hexagons (#77)", () => {
  it('measures the heading and every value label at or under its own maxWidth', async () => {
    const buffer = await readFile(ANTON_PATH);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    const font = opentype.parse(arrayBuffer);
    const blocks = townCenter.wallText ?? [];
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      const isHeading = block.id === 'heading';
      const fontSize = isHeading ? HEADING_FONT_SIZE_PX : LABEL_FONT_SIZE_PX;
      const letterSpacing = isHeading ? HEADING_LETTER_SPACING_PX : LABEL_LETTER_SPACING_PX;
      const width = measureWidth(font, block.text, fontSize, letterSpacing);

      expect(width).toBeLessThanOrEqual(block.maxWidth);
    }
  });

  it("reproduces the design's own baked font-size/letter-spacing overflowing INSPIRE's hexagon, confirming the bug this ticket fixes", async () => {
    const buffer = await readFile(ANTON_PATH);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    const font = opentype.parse(arrayBuffer);
    const inspire = (townCenter.wallText ?? []).find((block) => block.id === 'inspire');
    expect(inspire).toBeDefined();

    // The design's own `<text font-size="6.5" letter-spacing="1">INSPIRE</text>`.
    const designWidth = measureWidth(font, 'INSPIRE', 6.5, 1);

    expect(designWidth).toBeGreaterThan(inspire!.maxWidth);
  });
});

describe('createWallText', () => {
  let instance: WallText | undefined;
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.append(root);
  });

  afterEach(() => {
    instance?.destroy();
    instance = undefined;
  });

  function fixture(id: string, text: string): RoomWallText {
    return { id, text, x: 100, y: 50, colour: '#F4F4F4', maxWidth: 40, skewY: 0.5 };
  }

  function hotspotFixture(): RoomHotspot {
    return {
      id: 'core-values-poster',
      label: 'Core values',
      rect: { x: 10, y: 20, width: 100, height: 80 },
    };
  }

  /** Fills in `resolvePosterHotspot`/`onPosterClick` defaults (#77 D5/D6) so each test only overrides what it cares about. */
  function deps(overrides: Partial<WallTextDeps> & Pick<WallTextDeps, 'resolve'>): WallTextDeps {
    return {
      resolvePosterHotspot: () => undefined,
      onPosterClick: vi.fn(),
      ...overrides,
    };
  }

  it("renders the current Room's labels at boot (SPAWN_ROOM_ID, town-center)", () => {
    const resolve = (roomId: RoomId): readonly RoomWallText[] =>
      roomId === 'town-center' ? [fixture('serve', 'SERVE')] : [];
    instance = createWallText(root, deps({ resolve }));

    const labels = root.querySelectorAll('.wall-text__label');
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toBe('SERVE');
  });

  it("switches to the new Room's labels on room:enter", () => {
    const resolve = (roomId: RoomId): readonly RoomWallText[] =>
      roomId === 'dev-pit' ? [fixture('a', 'A'), fixture('b', 'B')] : [fixture('serve', 'SERVE')];
    instance = createWallText(root, deps({ resolve }));

    gameEvents.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });

    const labels = Array.from(root.querySelectorAll('.wall-text__label'));
    expect(labels.map((el) => el.textContent)).toEqual(['A', 'B']);
  });

  it("positions a label with the design's own skew/anchor transform", () => {
    const resolve = (): readonly RoomWallText[] => [fixture('serve', 'SERVE')];
    instance = createWallText(root, deps({ resolve }));

    const span = root.querySelector('.wall-text__label') as HTMLElement;
    expect(span.style.transform).toContain('matrix(1, 0.5, 0, 1, 100, 50)');
    expect(span.style.transform).toContain('translate(-50%, -50%)');
    expect(span.dataset.wallTextId).toBe('serve');
  });

  it('gives only the heading block the heading font-size/letter-spacing', () => {
    const resolve = (): readonly RoomWallText[] => [
      fixture('heading', 'CORE VALUES'),
      fixture('serve', 'SERVE'),
    ];
    instance = createWallText(root, deps({ resolve }));

    const [heading, serve] = Array.from(root.querySelectorAll('.wall-text__label'));
    expect((heading as HTMLElement).style.fontSize).toBe(`${HEADING_FONT_SIZE_PX}px`);
    expect((heading as HTMLElement).style.letterSpacing).toBe(`${HEADING_LETTER_SPACING_PX}px`);
    expect((serve as HTMLElement).style.fontSize).toBe(`${LABEL_FONT_SIZE_PX}px`);
    expect((serve as HTMLElement).style.letterSpacing).toBe(`${LABEL_LETTER_SPACING_PX}px`);
  });

  it('destroy() unsubscribes from room:enter and removes its root', () => {
    const resolve = (): readonly RoomWallText[] => [fixture('serve', 'SERVE')];
    const wallText = createWallText(root, deps({ resolve }));

    wallText.destroy();
    expect(root.querySelector('.wall-text')).toBeNull();

    // No throw and no re-render after destroy.
    expect(() =>
      gameEvents.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } }),
    ).not.toThrow();
  });

  describe('the poster button (#77 D5/D6)', () => {
    it('is absent when resolvePosterHotspot returns undefined', () => {
      instance = createWallText(root, deps({ resolve: () => [] }));

      expect(root.querySelector('.wall-text__poster')).toBeNull();
    });

    it('exists, positioned from the hotspot rect, only in the Room that has one', () => {
      const resolvePosterHotspot = (roomId: RoomId): RoomHotspot | undefined =>
        roomId === 'town-center' ? hotspotFixture() : undefined;
      instance = createWallText(root, deps({ resolve: () => [], resolvePosterHotspot }));

      const button = root.querySelector('.wall-text__poster') as HTMLElement;
      expect(button).not.toBeNull();
      expect(button.style.left).toBe('10px');
      expect(button.style.top).toBe('20px');
      expect(button.style.width).toBe('100px');
      expect(button.style.height).toBe('80px');
      expect(button.getAttribute('aria-label')).toBe('Read the JG core values');

      gameEvents.emit('room:enter', { roomId: 'dev-pit', entryTile: { col: 0, row: 0 } });
      expect(root.querySelector('.wall-text__poster')).toBeNull();
    });

    it('calls onPosterClick when clicked', () => {
      const onPosterClick = vi.fn();
      instance = createWallText(
        root,
        deps({ resolve: () => [], resolvePosterHotspot: () => hotspotFixture(), onPosterClick }),
      );

      (root.querySelector('.wall-text__poster') as HTMLButtonElement).click();

      expect(onPosterClick).toHaveBeenCalledTimes(1);
    });
  });
});
