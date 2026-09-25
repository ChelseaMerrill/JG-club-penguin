/**
 * Shared design fill colours (#62 review fix 6). `render-svg.ts`'s inline
 * SVG and `scripts/penguin-text-to-paths.ts`'s path generator both read
 * `ACCENT`/`EYE_PUPIL` off this single module instead of each hardcoding
 * the same hex literals, so the "HA HA"/"JG" (`ACCENT`) and "WAR WEEK"
 * (`EYE_PUPIL`) path fills can never drift from the colours the rest of the
 * Penguin renders with. Plain string constants only -- no Phaser import --
 * so the generator (a Node script, not part of the game bundle) can import
 * this module directly.
 */
export const STROKE = '#0C4B5F';
export const EYE_WHITE = '#F4F4F4';
export const EYE_PUPIL = '#161719';
export const ACCENT = '#00BDFF';
export const SEAT_FILL = '#3a4046';
export const SNORKEL_MASK = '#F2C12E';
export const SNORKEL_LENS = '#BFE3F0';
