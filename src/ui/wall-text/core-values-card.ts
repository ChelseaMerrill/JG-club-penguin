import type { HexColor } from '../../contracts';
import type { OverlayManager } from '../hud/overlay-manager';

/** The HUD `OverlayManager` id this card registers under (#77 D7). */
export const CORE_VALUES_OVERLAY_ID = 'core-values';

interface CoreValueBadge {
  word: string;
  colour: HexColor;
}

// The same four words/colours as Town Center's wall poster
// (`src/game/rooms/definitions/town-center.ts`'s `CORE_VALUES_WALL_TEXT`),
// duplicated rather than imported: this card is a standalone UI component,
// not tied to any one `RoomDefinition`. Keep the two in sync if the poster's
// words or colours ever change.
const CORE_VALUE_BADGES: readonly CoreValueBadge[] = [
  { word: 'SERVE', colour: '#F4F4F4' },
  { word: 'GRIND', colour: '#00BDFF' },
  { word: 'GROW', colour: '#F4F4F4' },
  { word: 'INSPIRE', colour: '#00BDFF' },
];

export interface CoreValuesCard {
  open(): void;
  destroy(): void;
}

/**
 * A readable Core Values card (#77 scope change, `[SCOPE CHANGE] #77` on the
 * issue): the wall poster's own labels stay small enough to fit their
 * hexagons (D1-D4), so clicking the poster
 * (`src/ui/wall-text/wall-text.ts`'s `.wall-text__poster` button, D6) opens
 * this card instead -- the heading and all four words at Anton 32px+ on the
 * 1600x900 Stage, legible at any window size down to 1024x576.
 *
 * Registers with the shared HUD `OverlayManager` (`overlays`) under
 * `CORE_VALUES_OVERLAY_ID` (D7) so Escape, opening another HUD overlay (e.g.
 * MENU), and this card's own close button/backdrop click all close it the
 * same way.
 */
export function createCoreValuesCard(layer: HTMLElement, overlays: OverlayManager): CoreValuesCard {
  const root = document.createElement('div');
  root.className = 'core-values-card';
  root.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'core-values-card__panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Core Values');

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'core-values-card__close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';

  const heading = document.createElement('h2');
  heading.className = 'core-values-card__heading';
  heading.textContent = 'CORE VALUES';

  const badgeRow = document.createElement('div');
  badgeRow.className = 'core-values-card__badges';
  for (const { word, colour } of CORE_VALUE_BADGES) {
    const badge = document.createElement('div');
    badge.className = 'core-values-card__badge';
    badge.style.background = colour;
    const label = document.createElement('span');
    label.className = 'core-values-card__badge-label';
    label.textContent = word;
    badge.append(label);
    badgeRow.append(badge);
  }

  panel.append(closeButton, heading, badgeRow);
  root.append(panel);
  layer.append(root);

  function hide(): void {
    root.hidden = true;
  }

  closeButton.addEventListener('click', () => {
    overlays.close(CORE_VALUES_OVERLAY_ID);
    hide();
  });

  // A click that lands on the backdrop itself (not bubbled up from the
  // panel) closes the card -- the standard "click outside" modal pattern.
  root.addEventListener('click', (event) => {
    if (event.target === root) {
      overlays.close(CORE_VALUES_OVERLAY_ID);
      hide();
    }
  });

  return {
    open() {
      root.hidden = false;
      overlays.open(CORE_VALUES_OVERLAY_ID, hide);
    },
    destroy() {
      overlays.close(CORE_VALUES_OVERLAY_ID);
      root.remove();
    },
  };
}
