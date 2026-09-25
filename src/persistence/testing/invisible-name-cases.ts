/**
 * Names built from invisible/control/format characters #70's red-team
 * rounds 1 and 2 require both the SQL `leaderboard()` function (the
 * migration's own char class) and the in-memory fake's
 * `isBlankLeaderboardName` to treat identically as blank. Shared by
 * `sql-leaderboard.test.ts` (PGlite) and `in-memory-leaderboard.test.ts` so
 * a gap between the two can't hide behind duplicated, drifting literals.
 * Round 2 (2026-09-25) additions: Ogham space mark, the rest of the Unicode
 * space separators, line/paragraph separators, the "specials" range, and
 * four supplementary-plane format-control ranges. Every codepoint below
 * uses the `\u{...}` string-literal form (not `\uXXXX`) even inside the
 * BMP, so every entry stays readable as plain hex here.
 *
 * Five of these (U+2000-U+200A, U+2028, U+2029, U+205F, U+3000) are
 * themselves already rejected as a *sole* `penguin_name` by #27's own
 * `players_penguin_name_check` (`!~ '^\s|\s$'`): Postgres's `\s`, unlike
 * JS's, does treat that specific set of Unicode space separators as
 * leading/trailing whitespace, even though `[:space:]`/`\s` is not
 * Unicode-aware for the rest of this list (confirmed empirically against
 * PGlite: Ogham space mark U+1680 and narrow no-break space U+202F, both
 * also Unicode "space separator" category, are *not* rejected by it). So
 * those five are wrapped in a zero-width space on each side below --
 * itself part of this same blank-name set, on both the SQL and the fake
 * side -- to make an insertable row that still ends up entirely blank once
 * stripped, the same way a real forged name could combine an
 * accepted leading/trailing character with a rejected one in the middle.
 */
export interface BlankNameCase {
  label: string;
  name: string;
}

const ZWSP = '\u{200B}';

export const BLANK_NAME_CASES: readonly BlankNameCase[] = [
  { label: 'NBSP U+00A0', name: '\u{00A0}' },
  { label: 'soft hyphen U+00AD', name: '\u{00AD}' },
  { label: 'combining grapheme joiner U+034F', name: '\u{034F}' },
  { label: 'Arabic letter mark U+061C', name: '\u{061C}' },
  { label: 'Hangul filler U+115F', name: '\u{115F}' },
  { label: 'Ogham space mark U+1680', name: '\u{1680}' },
  { label: 'zero-width space U+200B', name: ZWSP },
  {
    label: 'en quad U+2000 (2000-200A range, wrapped)',
    name: ZWSP + '\u{2000}' + ZWSP,
  },
  { label: 'line separator U+2028 (wrapped)', name: ZWSP + '\u{2028}' + ZWSP },
  { label: 'paragraph separator U+2029 (wrapped)', name: ZWSP + '\u{2029}' + ZWSP },
  { label: 'narrow no-break space x3 U+202F', name: '\u{202F}\u{202F}\u{202F}' },
  {
    label: 'medium mathematical space U+205F (wrapped)',
    name: ZWSP + '\u{205F}' + ZWSP,
  },
  { label: 'word joiner U+2060', name: '\u{2060}' },
  { label: 'Braille blank pattern U+2800', name: '\u{2800}' },
  { label: 'ideographic space U+3000 (wrapped)', name: ZWSP + '\u{3000}' + ZWSP },
  { label: 'Hangul filler U+3164', name: '\u{3164}' },
  { label: 'variation selector U+FE00', name: '\u{FE00}' },
  { label: 'zero-width no-break space/BOM U+FEFF', name: '\u{FEFF}' },
  { label: 'specials U+FFF0', name: '\u{FFF0}' },
  { label: 'halfwidth Hangul filler U+FFA0', name: '\u{FFA0}' },
  { label: 'Egyptian hieroglyph format control U+13430', name: '\u{13430}' },
  { label: 'Shorthand format control U+1BCA0', name: '\u{1BCA0}' },
  { label: 'musical symbol format control U+1D173', name: '\u{1D173}' },
  { label: 'tag space U+E0020', name: '\u{E0020}' },
];
