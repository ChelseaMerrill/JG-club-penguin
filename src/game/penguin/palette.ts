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

/**
 * The Creator's `--stage-bg` and the dark Room floors (#79 D1). The surface
 * a silhouette (feet) and, when the body itself doesn't clear
 * `MIN_CONTRAST` against it, the body outline are checked against.
 *
 * A simplification, noted for #79 review round 1 nit 10: in the Creator
 * itself (`design/Penguin Creator.dc.html`), the figure doesn't sit on flat
 * `#0e1013` -- it sits on a 45%-opacity black shadow ellipse and, behind
 * that, a 35%-opacity `#0C4B5F` (teal) hexagon, both painted over the
 * `#0e1013` page background. The real, composited backdrop right behind the
 * Penguin is therefore a touch lighter and more teal-tinted than this flat
 * value (which direction that shifts a given contrast check depends on
 * whether the checked colour is itself light or dark), not the exact
 * colour every pixel behind the figure actually is.
 */
export const BACKDROP = '#0e1013';
