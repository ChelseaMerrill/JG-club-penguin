import { gameEvents, type RoomId } from '../../contracts';
import type { RoomHotspot, RoomWallText } from '../../game/rooms/room-definition';

/**
 * The `RoomWallText.id` every Room definition uses for its heading block
 * (#77 D2): the only field that distinguishes a heading from a value label,
 * since `RoomWallText` deliberately carries no `kind` field of its own.
 * Exported (#77 review round 1 nit 10) so tests compare against this
 * constant rather than repeating the `'heading'` literal.
 */
export const HEADING_BLOCK_ID = 'heading';

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

/**
 * #77 review round 1 nit 7: shifts a value label's own vertical centre down
 * by 3.5 local (pre-shear) px, so it centres in its hexagon's real vertical
 * middle instead of sitting on the design's text-baseline anchor. Derived
 * from `definitions/town-center.ts`'s own `VALUE_LABEL_ABOVE_ANCHOR` (6.5)
 * and `VALUE_LABEL_BELOW_ANCHOR` (13.5): the hexagon's true centre sits
 * `(13.5 - 6.5) / 2 = 3.5`px below the anchor. The heading has no hexagon of
 * its own (D2/D4's comment), so it keeps sitting on its own anchor
 * unshifted.
 */
export const VALUE_LABEL_VERTICAL_CENTER_OFFSET_PX = 3.5;

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
  /**
   * The Room to show at boot, before any `room:enter` (#77 review round 1
   * fix 1): `RoomScene` itself boots from `resolveRoomIdFromLocation`
   * (`?room=`), not always `SPAWN_ROOM_ID`, so this overlay must match --
   * otherwise Town Center's poster text/button render over whatever Room
   * `?room=` actually loads in dev/e2e. `main.ts` passes
   * `resolveRoomIdFromLocation(window.location)` here.
   */
  initialRoomId: RoomId;
}

export interface WallText {
  /**
   * Toggles the poster button's own interactivity/focusability (#77 review
   * round 1 fix 2): `tabIndex = -1` and `inert` until a Session is active,
   * so it's neither reachable by keyboard nor announced to assistive tech
   * while there's nothing for it to open. `main.ts` calls this from the same
   * places it tracks its own Session state (`startSession`/`endSession`).
   * The wall labels themselves stay visible regardless -- only the button's
   * own affordance changes.
   */
  setSessionActive(active: boolean): void;
  destroy(): void;
}

/** Applies one `RoomWallText` block's text, colour, size, skew and (for a value label) vertical centring offset to `span`. */
function styleBlock(span: HTMLSpanElement, block: RoomWallText): void {
  const isHeading = block.id === HEADING_BLOCK_ID;
  const centerOffset = isHeading ? 0 : VALUE_LABEL_VERTICAL_CENTER_OFFSET_PX;
  span.textContent = block.text;
  span.dataset.wallTextId = block.id;
  span.style.color = block.colour;
  span.style.fontSize = `${isHeading ? HEADING_FONT_SIZE_PX : LABEL_FONT_SIZE_PX}px`;
  span.style.letterSpacing = `${isHeading ? HEADING_LETTER_SPACING_PX : LABEL_LETTER_SPACING_PX}px`;
  // `translate(-50%, -50%)` (own box, applied first) centres the span on its
  // own anchor both axes -- matching the design's `text-anchor="middle"` --
  // then `translate(0, centerOffset)` (still pre-shear/local space) recentres
  // a value label in its hexagon's real vertical middle (#77 review round 1
  // nit 7), before `matrix(1, skewY, 0, 1, x, y)` shears and places the
  // whole thing, the same transform the design's own
  // `<text transform="matrix(1 skewY 0 1 x y)">` used (#77 D3). CSS applies a
  // transform list right-to-left, so both translates really do run before
  // the matrix.
  span.style.transform = `matrix(1, ${block.skewY}, 0, 1, ${block.x}, ${block.y}) translate(0, ${centerOffset}px) translate(-50%, -50%)`;
}

/** `tabIndex`/`inert` for the poster button, reflecting whether a Session is active (#77 review round 1 fix 2). */
function applyButtonAccessibility(button: HTMLButtonElement, sessionActive: boolean): void {
  button.tabIndex = sessionActive ? 0 : -1;
  button.inert = !sessionActive;
}

/**
 * Draws a Room's `wallText` (#77 D2/D3: Town Center's Core Values poster, and
 * any future Room signage) as live DOM text absolutely positioned inside
 * `layer` (the `#ui` overlay, Stage pixels since `#ui` is itself Stage-scaled
 * -- see `src/ui/stage.ts`). Unlike the Room's baked PNG background, this
 * stays sharp with the page's own web fonts at every window size.
 *
 * Shows `deps.initialRoomId`'s text immediately (matching whatever Room
 * `RoomScene` itself boots into) and re-renders on every `room:enter`.
 * `pointer-events: none` throughout (`.wall-text`'s own CSS) so it never
 * blocks a canvas click -- except the one `.wall-text__poster` button
 * `resolvePosterHotspot` adds (#77 D5/D6, a scope-change follow-up: the wall
 * labels stay small enough to fit their hexagons, so a click opens a
 * properly legible Core Values card instead), which opts back into
 * `pointer-events: auto` the same way `.hud`'s own widgets do.
 */
export function createWallText(layer: HTMLElement, deps: WallTextDeps): WallText {
  const root = document.createElement('div');
  root.className = 'wall-text';
  let sessionActive = false;

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
      applyButtonAccessibility(button, sessionActive);
      // Stops here rather than falling through to the canvas underneath
      // (the same reasoning `.hud`'s own widgets rely on): a real DOM
      // button is the hit target Playwright/the browser picks at this
      // point, so `RoomScene`'s click-to-move handler on the canvas never
      // sees this click.
      button.addEventListener('click', () => deps.onPosterClick());
      root.append(button);
    }
  }

  render(deps.initialRoomId);
  layer.append(root);

  const unsubscribe = gameEvents.on('room:enter', ({ roomId }) => render(roomId));

  return {
    setSessionActive(active) {
      sessionActive = active;
      const button = root.querySelector<HTMLButtonElement>('.wall-text__poster');
      if (button) applyButtonAccessibility(button, active);
    },
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
