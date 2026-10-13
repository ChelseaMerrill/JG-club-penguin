/**
 * Sets display-font text whose accented letters Bumbastika can't draw
 * (owner feedback 2026-10-13: the "Ã" in "PÃO DE QUEIJO MEMORY" and the "É"
 * in "LATAM CAFÉ" render bigger than the letters around them).
 *
 * Bumbastika (`--font-game-display`) has no glyph for any accented Latin
 * letter, so the browser falls back to Anton for that one character, a
 * heavier face that reads larger at the same `font-size`. This keeps the
 * base letter in Bumbastika and draws the accent as a CSS shape above it
 * (`.display-accent`, `src/style.css`), so the letter matches its
 * neighbours exactly. Handles the acute (Á É Í Ó Ú) and tilde (Ã Õ Ñ) marks;
 * any other mark is left as text.
 */
const MARKS: Record<string, 'acute' | 'tilde'> = {
  '́': 'acute',
  '̃': 'tilde',
};

export function renderDisplayAccentText(el: HTMLElement, text: string): void {
  const chars = Array.from(text.normalize('NFD'));
  if (!chars.some((ch) => ch in MARKS)) {
    el.textContent = text;
    el.removeAttribute('aria-label');
    return;
  }
  // The accessible name stays the real, accented string.
  el.setAttribute('aria-label', text);
  el.replaceChildren();
  let plain = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const mark = MARKS[chars[i + 1] ?? ''];
    if (!mark) {
      plain += ch;
      continue;
    }
    if (plain) el.append(document.createTextNode(plain.normalize('NFC')));
    plain = '';
    const span = document.createElement('span');
    span.className = `display-accent display-accent--${mark}`;
    span.textContent = ch;
    el.append(span);
    i += 1; // the mark itself is drawn by the span
  }
  if (plain) el.append(document.createTextNode(plain.normalize('NFC')));
}
