import { gameEvents, SPAWN_ROOM_ID, type RoomId } from '../../contracts';
import type { RoomHotspot, RoomWallText } from '../../game/rooms/room-definition';

/**
 * The `RoomWallText.id` every Room definition uses for its heading block
 * (#77 D2): the only field that distinguishes a heading from a value label,
 * since `RoomWallText` deliberately carries no `kind` field of its own.
 */
const HEADING_BLOCK_ID = 'heading';

// #77 D4: one shared font-size/letter-spacing for every non-heading label,
// chosen so the widest one (Town Center's INSPIRE) measures under its
// hexagon's own `maxWidth` -- see `wall-text.test.ts`, which measures every
// `RoomWallText` entry with opentype.js against these exact numbers, and
// `definitions/town-center.ts`'s comment for how `maxWidth` itself was
// derived from the design's hexagon polygons.
export const LABEL_FONT_SIZE_PX = 4.0;
export const LABEL_LETTER_SPACING_PX = 0.2;

// The heading gets its own, larger size (unchanged from the design's own
// "CORE VALUES" `font-size="10" letter-spacing="3"`, which already fit its
// much roomier backing plate).
export const HEADING_FONT_SIZE_PX = 10;
export const HEADING_LETTER_SPACING_PX = 3;

export interface WallTextDeps {
  /** Every `RoomWallText` block to draw for the given Room (`[]` if it has none). */
  resolve: (roomId: RoomId) => readonly RoomWallText[];
  /**
   * The Room's clickable poster hotspot (#77 D5/D6, scope-change follow-up),
   * `undefined` when it has none. Present only while its own Room is current
   * -- driven by this resolver's own return value, not any hard-coded Room
   * id -- so the button exists only in a Room whose `RoomDefinition` actually
   * has one.
   */
  resolvePosterHotspot: (roomId: RoomId) => RoomHotspot | undefined;
  /** Called when the poster button is clicked; opens the Core Values card. */
  onPosterClick: () => void;
}

export interface WallText {
  destroy(): void;
}

/** Applies one `RoomWallText` block's text, colour, size and skew to `span`. */
function styleBlock(span: HTMLSpanElement, block: RoomWallText): void {
  const isHeading = block.id === HEADING_BLOCK_ID;
  span.textContent = block.text;
  span.dataset.wallTextId = block.id;
  span.style.color = block.colour;
  span.style.fontSize = `${isHeading ? HEADING_FONT_SIZE_PX : LABEL_FONT_SIZE_PX}px`;
  span.style.letterSpacing = `${isHeading ? HEADING_LETTER_SPACING_PX : LABEL_LETTER_SPACING_PX}px`;
  // `translate(-50%, -50%)` (own box, applied first) centres the span on its
  // own anchor both axes -- matching the design's `text-anchor="middle"` --
  // before `matrix(1, skewY, 0, 1, x, y)` shears and places it, the same
  // transform the design's own `<text transform="matrix(1 skewY 0 1 x y)">`
  // used (#77 D3). CSS applies a transform list right-to-left, so
  // `translate` here really does run before `matrix`.
  span.style.transform = `matrix(1, ${block.skewY}, 0, 1, ${block.x}, ${block.y}) translate(-50%, -50%)`;
}

/**
 * Draws a Room's `wallText` (#77 D2/D3: Town Center's Core Values poster, and
 * any future Room signage) as live DOM text absolutely positioned inside
 * `layer` (the `#ui` overlay, Stage pixels since `#ui` is itself Stage-scaled
 * -- see `src/ui/stage.ts`). Unlike the Room's baked PNG background, this
 * stays sharp with the page's own web fonts at every window size.
 *
 * Shows `SPAWN_ROOM_ID`'s text immediately (matching the HUD's own
 * `setRoom(SPAWN_ROOM_ID)` boot behaviour) and re-renders on every
 * `room:enter`. `pointer-events: none` throughout (`.wall-text`'s own CSS)
 * so it never blocks a canvas click -- except the one `.wall-text__poster`
 * button `resolvePosterHotspot` adds (#77 D5/D6, a scope-change follow-up:
 * the wall labels stay small enough to fit their hexagons, so a click opens
 * a properly legible Core Values card instead), which opts back into
 * `pointer-events: auto` the same way `.hud`'s own widgets do.
 */
export function createWallText(layer: HTMLElement, deps: WallTextDeps): WallText {
  const root = document.createElement('div');
  root.className = 'wall-text';

  function render(roomId: RoomId): void {
    root.replaceChildren();
    for (const block of deps.resolve(roomId)) {
      const span = document.createElement('span');
      span.className = 'wall-text__label';
      styleBlock(span, block);
      root.append(span);
    }

    const hotspot = deps.resolvePosterHotspot(roomId);
    if (hotspot) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wall-text__poster';
      button.setAttribute('aria-label', 'Read the JG core values');
      button.style.left = `${hotspot.rect.x}px`;
      button.style.top = `${hotspot.rect.y}px`;
      button.style.width = `${hotspot.rect.width}px`;
      button.style.height = `${hotspot.rect.height}px`;
      // Stops here rather than falling through to the canvas underneath
      // (the same reasoning `.hud`'s own widgets rely on): a real DOM
      // button is the hit target Playwright/the browser picks at this
      // point, so `RoomScene`'s click-to-move handler on the canvas never
      // sees this click.
      button.addEventListener('click', () => deps.onPosterClick());
      root.append(button);
    }
  }

  render(SPAWN_ROOM_ID);
  layer.append(root);

  const unsubscribe = gameEvents.on('room:enter', ({ roomId }) => render(roomId));

  return {
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
