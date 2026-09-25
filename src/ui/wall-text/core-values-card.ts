import { CORE_VALUE_WORDS } from '../../game/rooms/definitions/town-center';
import type { OverlayManager } from '../hud/overlay-manager';

/** The HUD `OverlayManager` id this card registers under (#77 D7). */
export const CORE_VALUES_OVERLAY_ID = 'core-values';

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
 * 1600x900 Stage, legible at any window size down to 1024x576. Its four
 * words/colours come from `CORE_VALUE_WORDS`
 * (`src/game/rooms/definitions/town-center.ts`), the same array the wall
 * poster itself builds from (#77 review round 1 nit 10), so the two can never
 * drift apart.
 *
 * Registers with the shared HUD `OverlayManager` (`overlays`) under
 * `CORE_VALUES_OVERLAY_ID` (D7) so Escape, opening another HUD overlay (e.g.
 * MENU), and this card's own close button/backdrop click all close it the
 * same way. Moves focus to its own close button on open, and restores focus
 * to whatever had it before on close (#77 review round 1 fix 3), the same
 * modal-focus discipline `src/ui/penguin-creator.ts` and the minigame shell
 * already follow.
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
  // #77 review round 1 nit 9: "CLOSE" (Anton, always present -- unlike the
  // '×' multiplication sign this replaces, which Anton doesn't ship a glyph
  // for) rather than an icon font/SVG, matching how every other text button
  // in this app (MENU, IGLOO, EMOTE, ...) already reads.
  closeButton.textContent = 'CLOSE';

  const heading = document.createElement('h2');
  heading.className = 'core-values-card__heading';
  heading.textContent = 'CORE VALUES';

  const badgeRow = document.createElement('div');
  badgeRow.className = 'core-values-card__badges';
  for (const { word, colour } of CORE_VALUE_WORDS) {
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

  // #77 review round 1 fix 3: whatever had focus right before `open()`, so
  // `hide()` can put it back regardless of which of the four close paths
  // (Escape, close button, backdrop click, another overlay opening) fired.
  let previouslyFocused: HTMLElement | null = null;

  function hide(): void {
    root.hidden = true;
    previouslyFocused?.focus();
    previouslyFocused = null;
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
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.hidden = false;
      overlays.open(CORE_VALUES_OVERLAY_ID, hide);
      closeButton.focus();
    },
    destroy() {
      overlays.close(CORE_VALUES_OVERLAY_ID);
      root.remove();
    },
  };
}
