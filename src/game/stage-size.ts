/**
 * The fixed Stage resolution every screen is authored on. Kept Phaser-free
 * (unlike `game/config.ts`) so consumers such as `src/ui/stage.ts` can import
 * it without pulling in Phaser, which reads `window` at import time.
 */
export const GAME_WIDTH = 1600;
export const GAME_HEIGHT = 900;
