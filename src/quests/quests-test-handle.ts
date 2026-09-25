/**
 * Test-only handle `main.ts` exposes as `window.__questsTest` in dev and
 * Playwright preview builds (#46). Its own file, like
 * `minigame-test-handle.ts`, so e2e specs can import the type without
 * `import.meta.env`. Rounds and purchases go through the same Quest-aware
 * store the Minigame shell and the Market use, so the quest engine sees them
 * exactly as it sees real play; it exists only because Pancake Flip's 20
 * stacked and Snow Cone Stand's 200 Tokens can't be played out reliably in
 * e2e.
 */
export interface QuestsTestHandle {
  recordRound(minigameId: string, score: number, stats: Record<string, number>): Promise<void>;
  purchase(itemId: string): Promise<void>;
}
