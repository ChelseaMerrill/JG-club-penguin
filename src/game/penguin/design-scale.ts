/**
 * `design/Penguin Creator.dc.html` line 38 displays its figure `<svg
 * viewBox="0 0 120 130">` at `width="340" height="368"`, so a CSS pixel
 * value taken from the design (the SIT seat's box, the `@keyframes`
 * `translateY`s) is `340/120` times too large for this renderer's 120x130
 * viewBox and must be divided by this scale to convert (#31 review fixes 1
 * and 2). Derived from the width pair rather than the height pair
 * (`368/130`) since the two are only equal to two decimal places (the
 * design rounds its own `368` display height down from the exact
 * `130 * (340/120) = 368.33`).
 */
export const DESIGN_TO_VIEWBOX_SCALE = 340 / 120;
