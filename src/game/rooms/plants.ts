/**
 * Potted plants placed on a Room's floor (owner request, 2026-10-02, Track D:
 * "add some plants around the market"), a Room decoration, not an NPC.
 * Authored, not from a design: an isometric pot in the Rooms' own palette
 * (the `#0C4B5F` outline, the Market counters' `#0a3d4d`/`#072e3b` faces and
 * `#00BDFF` trim) with a leafy plant in the greens the designs already use
 * (Casey's `#2FB59A`, Jory's `#1f6b4a`). Its tile is unwalkable, so Penguins
 * walk round it, and it sorts with that tile like any Penguin or NPC.
 */

/** The plant's texture viewBox: 80 x 100, its pot's floor point at (40, 92). */
export const PLANT_VIEWBOX = { width: 80, height: 100 } as const;
/** Where the pot touches the floor in the viewBox: the sprite's origin, at its tile's point. */
export const PLANT_FOOT = { x: 40, y: 92 } as const;

export function renderPlantSvg(): string {
  const scale = 2;
  const { width, height } = PLANT_VIEWBOX;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * scale}" height="${height * scale}">` +
    // Shadow, then the pot's two faces and its rim (an isometric box).
    '<ellipse cx="40" cy="92" rx="24" ry="7" fill="#000" opacity=".35"/>' +
    '<polygon points="20,62 40,72 40,94 22,85" fill="#0a3d4d" stroke="#0C4B5F" stroke-width="2" stroke-linejoin="round"/>' +
    '<polygon points="60,62 40,72 40,94 58,85" fill="#072e3b" stroke="#0C4B5F" stroke-width="2" stroke-linejoin="round"/>' +
    '<polygon points="40,52 62,62 40,72 18,62" fill="#0C4B5F" stroke="#0C4B5F" stroke-width="2" stroke-linejoin="round"/>' +
    '<polygon points="40,55 56,62 40,69 24,62" fill="#3b2a1a"/>' +
    '<path d="M20 64 L40 74 L60 64" fill="none" stroke="#00BDFF" stroke-width="2"/>' +
    // Leaves, back to front.
    '<path d="M40 62 C30 50 22 38 24 22 C34 30 40 44 40 62 Z" fill="#1f6b4a" stroke="#0C4B5F" stroke-width="1.8"/>' +
    '<path d="M40 62 C50 50 58 38 56 22 C46 30 40 44 40 62 Z" fill="#1f6b4a" stroke="#0C4B5F" stroke-width="1.8"/>' +
    '<path d="M40 62 C38 44 40 24 40 8 C46 20 46 44 40 62 Z" fill="#2FB59A" stroke="#0C4B5F" stroke-width="1.8"/>' +
    '<path d="M40 62 C30 56 16 52 10 42 C22 40 34 48 40 62 Z" fill="#2FB59A" stroke="#0C4B5F" stroke-width="1.8"/>' +
    '<path d="M40 62 C50 56 64 52 70 42 C58 40 46 48 40 62 Z" fill="#2FB59A" stroke="#0C4B5F" stroke-width="1.8"/>' +
    '<path d="M40 60 L40 14 M40 60 L26 28 M40 60 L54 28" stroke="#0C4B5F" stroke-width="1" opacity=".5" fill="none"/>' +
    '</svg>'
  );
}
