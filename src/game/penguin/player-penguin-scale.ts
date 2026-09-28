// #131: in-Room Player Penguins (`penguin-sprite.ts`'s `createPenguin` --
// yours, the debug Penguin and every remote Penguin `RoomScene.ts` builds
// with it) draw at the design's own scale rather than 1:1 of the 120x130
// design box. `design/Room 01 Town Center.dc.html`'s "You" figure is
// `<svg width="69.6" ... viewBox="0 0 120 130">`: `69.6 / 120 = 0.58`.
// Applied with `sprite.setScale` around the sprite's own feet-anchor origin,
// which keeps the feet pinned to the same Stage point (Phaser scales a
// GameObject's display size around its fractional origin, not its top-left).
// Everything else positioned off the sprite's own frame size -- the chat
// bubble anchor and the snow hat's position/drawn size below -- scales by
// this same constant so it still sits correctly against the smaller figure;
// the name tag (anchored under the feet, not off the frame) does not. The
// Penguin Creator preview, the landing-page crowd and NPCs (#113, a separate
// branch) are untouched -- none of them call this `createPenguin`.
//
// Kept in its own module, separate from `penguin-sprite.ts` (which imports
// `phaser` as a runtime value and therefore requires a DOM environment just
// to load), so it can be imported by Playwright spec files: those load
// directly under plain Node, where importing `phaser` throws (`window is not
// defined`) (#131 review fix).
export const PLAYER_PENGUIN_SCALE = 0.58;
