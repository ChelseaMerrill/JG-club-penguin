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
  /** #143: the Igloo Badge Quest's "talk to Casey" step, without driving the NPC dialog. */
  markCaseyTalked(): Promise<void>;
  /** #143: hangs (or empties, with `null`) an Igloo slot without driving the Igloo editor. */
  setSlot(slot: number, itemId: string | null): Promise<void>;
  /** #141: Nicole's coffee as the Player sees it, and whether the cup is drawn in the flipper. */
  coffee(): { carrying: boolean; secondsLeft: number | null; cupRendered: boolean };
  /**
   * #141: moves the dev store's clock (the stand-in server's now()) and the
   * countdown's clock on by `ms`, so a spec can let the coffee go cold
   * without waiting a real minute.
   */
  advanceClock(ms: number): void;
  /** #141: the store's saved Token balance (the HUD shows it only after the first change in a dev boot). */
  balance(): Promise<number>;
  /** #141: talks to Nicole, asks Tom and delivers through the same store, for specs that only need the Quest done. */
  finishCoffeeRun(): Promise<void>;
  /**
   * #142: talks to Linda, starts and submits a pitch through the same store,
   * for specs that only need the Quest done. `advanceClock` (shared with
   * #141) lets a spec expire the pitch overlay's own 60 s countdown without
   * waiting a real minute.
   */
  finishPitchHack(): Promise<void>;
  /** #140: the "pair with a JGer" Quest's "talk to Paul" step, without driving his dialog. */
  markPaulTalked(): Promise<void>;
  /** #140: the "check the CI board" step, without clicking the Dev Pit hotspot. */
  markCiBoardChecked(): Promise<void>;
  /** #140: the "pair-with-jger" step, without waiting out the real 10 s next to anyone. */
  markPaired(): Promise<void>;
  /** #140: "report back to Paul"; rejects with `quest_steps_incomplete` unless steps 1-4 are already met. */
  reportToPaul(): Promise<void>;
  /**
   * #140: the "pair with a JGer" Quest's saved steps right now (step id ->
   * met), straight from `ProgressStore.questProgress()` -- so a two-browser
   * spec can assert the real, Presence-driven pairing detection flipped
   * `pair-with-jger` without caring whether a step toast fired this run (a
   * shared, persistent real-account test user may already have it set from
   * an earlier run).
   */
  pairFlakyTestSteps(): Promise<Record<string, boolean>>;
}
