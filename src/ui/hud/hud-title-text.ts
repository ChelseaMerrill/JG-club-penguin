/**
 * Renders the HUD title (`.hud__title`, owner feedback 2026-10-13: "LATAM
 * CAFÉ title: the É is larger than the other letters").
 *
 * Root cause, confirmed by reading `design/assets/bumbastika.ttf`'s own cmap
 * with `opentype.js`: Bumbastika (`--font-game-display`, this title's own
 * font) has no glyph for ANY accented Latin letter -- `É`, `é`, and every
 * other letter in the Latin-1 Supplement block all resolve to glyph index 0,
 * the font's own `.notdef` box, not a real letterform. Lacking a glyph, the
 * browser's own per-character font fallback (standard CSS font-matching, not
 * a bug) draws that one character with the title's second font instead,
 * `--font-display` (Anton) -- a different, much heavier display face at the
 * same declared `font-size`, which reads visibly bigger than Bumbastika's own
 * letters around it.
 *
 * Rather than lose the accent (falling back to plain "CAFE") or hand-tune a
 * `font-size-adjust` ratio against a font-fallback quirk that could drift
 * with a future browser release, this keeps the base letter in Bumbastika
 * itself -- guaranteeing it matches every other letter exactly, since it's
 * the same glyph in the same font -- and draws the acute accent as a small
 * CSS shape above it (`.hud__title-accent`, `src/style.css`): a span-level
 * fix, never a second font. Scoped to the acute accent only (the only
 * diacritic any Room's `title` actually uses today, `LATAM CAFÉ`); a future
 * title with a different diacritic would hit the same Bumbastika gap and
 * need the same treatment, flagged here rather than silently handled.
 */
const COMBINING_ACUTE = '́';

/** Sets `el`'s HUD title text, replacing a Bumbastika-unsupported "letter + acute" pair with a span-drawn accent mark. */
export function renderHudTitleText(el: HTMLElement, text: string): void {
  const decomposed = Array.from(text.normalize('NFD'));
  if (!decomposed.includes(COMBINING_ACUTE)) {
    el.textContent = text;
    el.removeAttribute('aria-label');
    return;
  }

  // The accessible name stays the real, accented string even though the
  // visual markup below splits it into a base letter plus a drawn accent.
  el.setAttribute('aria-label', text);
  el.replaceChildren();
  for (let i = 0; i < decomposed.length; i += 1) {
    const ch = decomposed[i];
    if (ch === COMBINING_ACUTE) continue; // consumed by the preceding base letter, below
    if (decomposed[i + 1] === COMBINING_ACUTE) {
      const span = document.createElement('span');
      span.className = 'hud__title-accent';
      span.textContent = ch;
      el.append(span);
    } else {
      el.append(document.createTextNode(ch));
    }
  }
}
