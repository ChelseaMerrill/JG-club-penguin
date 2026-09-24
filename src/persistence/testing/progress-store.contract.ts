import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, PENGUIN_NAME_MAX, type PenguinLook } from '../../contracts/penguin';
import type { BadgeId, MinigameId, MinigameStatsMap } from '../../contracts/game-events';
import { IGLOO_GEAR_CATALOG } from '../minigame-rules';
import type { IglooSlot, ProgressStore, ShopItem } from '../progress-store';

/** One fresh Player, wired to whichever `ProgressStore` implementation is under test. */
export interface ProgressStoreHarness {
  store: ProgressStore;
  /** Makes `seconds` seconds appear to have passed since every earlier round. */
  advanceSeconds(seconds: number): Promise<void>;
}

function sortById(items: readonly ShopItem[]): ShopItem[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

const NEUTRAL_PANCAKE_STATS: MinigameStatsMap['pancake-flip'] = {
  golden: 0,
  flipNow: 0,
  raw: 0,
  burnt: 0,
  stacked: 0,
};

/**
 * The one behavioral suite every `ProgressStore` implementation must pass:
 * the in-memory fake (`createInMemoryProgressStore`) and the real store
 * (built on #27's `saved_progress` migration, run here against PGlite).
 * `makeHarness` must give each test its own fresh Player.
 */
export function describeProgressStoreContract(
  name: string,
  makeHarness: () => Promise<ProgressStoreHarness>,
): void {
  describe(name, () => {
    it('starts a fresh Player with 100 Tokens, the default look, and nothing earned or owned', async () => {
      const { store } = await makeHarness();

      const snapshot = await store.loadAll();

      expect(snapshot.tokens).toBe(100);
      expect(snapshot.look).toEqual(DEFAULT_LOOK);
      expect(snapshot.profileCreatedAt).toBeNull();
      expect(snapshot.badges).toEqual([]);
      expect(snapshot.bests).toEqual({});
      expect(snapshot.ownedItems).toEqual([]);
      expect(snapshot.slots).toEqual({ 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
      expect(sortById(snapshot.catalog)).toEqual(sortById(IGLOO_GEAR_CATALOG));
    });

    it('round-trips a saved look and keeps profileCreatedAt after a second save', async () => {
      const { store } = await makeHarness();
      const look: PenguinLook = { ...DEFAULT_LOOK, name: 'Chilly' };

      await store.saveLook(look);
      const first = await store.loadAll();
      expect(first.look).toEqual(look);
      expect(first.profileCreatedAt).not.toBeNull();

      await store.saveLook({ ...look, name: 'Chilly II' });
      const second = await store.loadAll();
      expect(second.look.name).toBe('Chilly II');
      expect(second.profileCreatedAt).toBe(first.profileCreatedAt);
    });

    const invalidLooks: Array<[string, PenguinLook]> = [
      ['an empty name', { ...DEFAULT_LOOK, name: '' }],
      ['a name with a leading space', { ...DEFAULT_LOOK, name: ' Chilly' }],
      ['a 17 character name', { ...DEFAULT_LOOK, name: 'a'.repeat(PENGUIN_NAME_MAX + 1) }],
      [
        'an invalid belly color',
        { ...DEFAULT_LOOK, name: 'Chilly', belly: 'red' as PenguinLook['belly'] },
      ],
      ['an invalid hat', { ...DEFAULT_LOOK, name: 'Chilly', hat: 'TOP HAT' as PenguinLook['hat'] }],
    ];
    it.each(invalidLooks)('rejects saveLook with %s as invalid_look', async (_label, look) => {
      const { store } = await makeHarness();

      await expect(store.saveLook(look)).rejects.toMatchObject({ code: 'invalid_look' });
    });

    it('accepts 16 emoji as the name, counted in code points rather than UTF-16 units', async () => {
      const { store } = await makeHarness();
      const look: PenguinLook = { ...DEFAULT_LOOK, name: '😀'.repeat(16) };

      await expect(store.saveLook(look)).resolves.toBeUndefined();
      expect((await store.loadAll()).look.name).toBe(look.name);
    });

    it('Pancake Flip: 2 golden and 5 burnt pays 0, not a negative amount', async () => {
      const { store } = await makeHarness();

      const result = await store.recordRound('pancake-flip', 0, {
        ...NEUTRAL_PANCAKE_STATS,
        golden: 2,
        burnt: 5,
      });

      expect(result.tokensAwarded).toBe(0);
      expect(result.balance).toBe(100);
    });

    it('Pancake Flip: an over-cap round is capped at 400', async () => {
      const { store } = await makeHarness();

      const result = await store.recordRound('pancake-flip', 0, {
        ...NEUTRAL_PANCAKE_STATS,
        golden: 99,
      });

      expect(result.tokensAwarded).toBe(400);
      expect(result.balance).toBe(500);
    });

    it("rejects a second round of the same Minigame inside its interval, allows it after advancing time, and keeps a different Minigame's interval independent", async () => {
      const { store, advanceSeconds } = await makeHarness();

      await store.recordRound('pancake-flip', 0, NEUTRAL_PANCAKE_STATS);
      await expect(
        store.recordRound('pancake-flip', 0, NEUTRAL_PANCAKE_STATS),
      ).rejects.toMatchObject({ code: 'round_too_soon' });

      // Bug Squash's interval is independent of Pancake Flip's.
      await expect(store.recordRound('bug-squash', 10, { squashed: 1 })).resolves.toMatchObject({
        tokensAwarded: 1,
      });

      await advanceSeconds(90);
      await expect(
        store.recordRound('pancake-flip', 0, NEUTRAL_PANCAKE_STATS),
      ).resolves.toMatchObject({ tokensAwarded: 0 });
    });

    it('pays the Badge bonus once: the first round to meet the threshold, never a later one', async () => {
      const { store, advanceSeconds } = await makeHarness();
      const stacked20 = { ...NEUTRAL_PANCAKE_STATS, stacked: 20 };

      const first = await store.recordRound('pancake-flip', 0, stacked20);
      expect(first.badgeEarned).toBe(true);
      expect(first.balance).toBe(150);

      await advanceSeconds(90);
      const second = await store.recordRound('pancake-flip', 0, stacked20);
      expect(second.badgeEarned).toBe(false);
      expect(second.balance).toBe(first.balance);
    });

    it('Bug Squash: a score of 520 pays floor(score / 10), earns Exterminator, and updates the balance', async () => {
      const { store } = await makeHarness();

      const result = await store.recordRound('bug-squash', 520, { squashed: 520 });

      expect(result.tokensAwarded).toBe(52);
      expect(result.badgeEarned).toBe(true);
      expect(result.balance).toBe(202);
    });

    it('reports newBest true on the first round and false on a lower one', async () => {
      const { store, advanceSeconds } = await makeHarness();

      const first = await store.recordRound('bug-squash', 100, { squashed: 100 });
      expect(first.newBest).toBe(true);

      await advanceSeconds(60);
      const second = await store.recordRound('bug-squash', 50, { squashed: 50 });
      expect(second.newBest).toBe(false);
    });

    it('does not record a first round scoring 0 as a personal best', async () => {
      const { store } = await makeHarness();

      const result = await store.recordRound('bug-squash', 0, { squashed: 0 });
      expect(result.newBest).toBe(false);
      expect((await store.loadAll()).bests['bug-squash']).toBeUndefined();
    });

    it('rejects stats with more than 16 keys as invalid_stats', async () => {
      const { store } = await makeHarness();

      const stats = Object.fromEntries(
        Array.from({ length: 17 }, (_, i) => [`k${i}`, 0]),
      ) as unknown as MinigameStatsMap['bug-squash'];
      await expect(store.recordRound('bug-squash', 0, stats)).rejects.toMatchObject({
        code: 'invalid_stats',
      });
    });

    it('rejects a negative stat as invalid_stats', async () => {
      const { store } = await makeHarness();

      await expect(
        store.recordRound('pancake-flip', 0, { ...NEUTRAL_PANCAKE_STATS, golden: -1 }),
      ).rejects.toMatchObject({ code: 'invalid_stats' });
    });

    it('rejects a non-integer stat as invalid_stats', async () => {
      const { store } = await makeHarness();

      await expect(
        store.recordRound('pancake-flip', 0, { ...NEUTRAL_PANCAKE_STATS, golden: 1.5 }),
      ).rejects.toMatchObject({ code: 'invalid_stats' });
    });

    it('rejects a non-numeric stat as invalid_stats', async () => {
      const { store } = await makeHarness();

      const stats = {
        ...NEUTRAL_PANCAKE_STATS,
        golden: 'lots',
      } as unknown as MinigameStatsMap['pancake-flip'];
      await expect(store.recordRound('pancake-flip', 0, stats)).rejects.toMatchObject({
        code: 'invalid_stats',
      });
    });

    it('rejects an array for stats as invalid_stats', async () => {
      const { store } = await makeHarness();

      const stats = [1, 2, 3] as unknown as MinigameStatsMap['bug-squash'];
      await expect(store.recordRound('bug-squash', 0, stats)).rejects.toMatchObject({
        code: 'invalid_stats',
      });
    });

    it('rejects a 33 character stats key as invalid_stats', async () => {
      const { store } = await makeHarness();

      const stats = { ['k'.repeat(33)]: 0 } as unknown as MinigameStatsMap['bug-squash'];
      await expect(store.recordRound('bug-squash', 0, stats)).rejects.toMatchObject({
        code: 'invalid_stats',
      });
    });

    it('rejects a negative score as invalid_score', async () => {
      const { store } = await makeHarness();

      await expect(store.recordRound('bug-squash', -1, { squashed: 0 })).rejects.toMatchObject({
        code: 'invalid_score',
      });
    });

    it('rejects a non-integer score as invalid_score', async () => {
      const { store } = await makeHarness();

      await expect(store.recordRound('bug-squash', 10.5, { squashed: 0 })).rejects.toMatchObject({
        code: 'invalid_score',
      });
    });

    it('rejects an unknown Minigame id as unknown_minigame', async () => {
      const { store } = await makeHarness();

      await expect(
        store.recordRound('checkers' as MinigameId, 10, {} as never),
      ).rejects.toMatchObject({ code: 'unknown_minigame' });
    });

    it('Coffee Rush: 5 small, 5 medium and 5 large cups with 2 perfect pours pays 160 and earns Barista', async () => {
      const { store } = await makeHarness();

      const result = await store.recordRound('coffee-rush', 15, {
        small: 5,
        medium: 5,
        large: 5,
        perfect: 2,
      });

      expect(result.tokensAwarded).toBe(160);
      expect(result.badgeEarned).toBe(true);
    });

    it('Snow Cone Stand: 2 regular cone5 and 4 rush-hour cone25 pays 210 and earns Brain Freeze', async () => {
      const { store } = await makeHarness();

      const result = await store.recordRound('snow-cone-stand', 210, {
        cone5: 2,
        rushCone25: 4,
      });

      expect(result.tokensAwarded).toBe(210);
      expect(result.badgeEarned).toBe(true);
    });

    it('purchase deducts the price, then rejects an unaffordable, duplicate or unknown item', async () => {
      const { store } = await makeHarness();

      const afterDesk = await store.purchase('desk');
      expect(afterDesk.balance).toBe(20);

      await expect(store.purchase('speakers')).rejects.toMatchObject({
        code: 'insufficient_tokens',
      });
      expect((await store.loadAll()).tokens).toBe(20);

      await expect(store.purchase('desk')).rejects.toMatchObject({ code: 'already_owned' });
      await expect(store.purchase('hoverboard')).rejects.toMatchObject({ code: 'unknown_item' });
    });

    it('setSlot places, empties and moves owned Furniture, and rejects unowned items or an invalid slot', async () => {
      const { store } = await makeHarness();
      await store.purchase('beanbag');

      await store.setSlot(1, 'beanbag');
      expect((await store.loadAll()).slots[1]).toBe('beanbag');

      await expect(store.setSlot(2, 'desk')).rejects.toMatchObject({ code: 'not_owned' });

      // Moving an owned item to a new slot leaves its old slot empty.
      await store.setSlot(3, 'beanbag');
      const afterMove = await store.loadAll();
      expect(afterMove.slots[1]).toBeNull();
      expect(afterMove.slots[3]).toBe('beanbag');

      await store.setSlot(3, null);
      expect((await store.loadAll()).slots[3]).toBeNull();

      await expect(store.setSlot(7 as IglooSlot, 'beanbag')).rejects.toMatchObject({
        code: 'invalid_slot',
      });
    });

    it('reflects the look, Tokens, Badges, bests, owned Furniture and Igloo slots in loadAll', async () => {
      const { store } = await makeHarness();
      const look: PenguinLook = { ...DEFAULT_LOOK, name: 'Chilly' };

      await store.saveLook(look);
      const round = await store.recordRound('bug-squash', 520, { squashed: 520 });
      const purchaseResult = await store.purchase('beanbag');
      await store.setSlot(1, 'beanbag');

      const snapshot = await store.loadAll();
      expect(snapshot.look).toEqual(look);
      expect(snapshot.profileCreatedAt).not.toBeNull();
      expect(snapshot.tokens).toBe(purchaseResult.balance);
      expect(snapshot.tokens).toBe(round.balance - 50);
      expect(snapshot.badges).toEqual(['exterminator']);
      expect(snapshot.bests).toEqual({ 'bug-squash': 520 });
      expect(snapshot.ownedItems).toEqual(['beanbag']);
      expect(snapshot.slots).toEqual({ 1: 'beanbag', 2: null, 3: null, 4: null, 5: null, 6: null });
    });

    // Table-driven cases below use literal values from the #27 payout table
    // (2026-09-24), not `MINIGAME_RULES`, so a bug that changes both the
    // rule and the expectation together can't hide.

    const overCapCases: Array<{
      minigameId: MinigameId;
      score: number;
      stats: Record<string, number>;
      cap: number;
    }> = [
      { minigameId: 'bug-squash', score: 1_000_000, stats: { squashed: 100_000 }, cap: 250 },
      {
        minigameId: 'pancake-flip',
        score: 0,
        stats: { ...NEUTRAL_PANCAKE_STATS, golden: 100 },
        cap: 400,
      },
      { minigameId: 'coffee-rush', score: 0, stats: { large: 30 }, cap: 400 },
      { minigameId: 'snow-cone-stand', score: 0, stats: { rushCone25: 100 }, cap: 600 },
    ];
    it.each(overCapCases)(
      '$minigameId: an over-cap round pays exactly the cap ($cap)',
      async ({ minigameId, score, stats, cap }) => {
        const { store } = await makeHarness();

        const result = await store.recordRound(minigameId, score, stats as never);

        expect(result.tokensAwarded).toBe(cap);
      },
    );

    // Interval rule (#27 RT3, option A): a round less than 10 s after the
    // previous round of the same Minigame is round_too_soon; otherwise the
    // payout is at most floor(cap * min(1, elapsed / duration)).
    const durationCases: Array<{
      minigameId: MinigameId;
      durationSeconds: number;
      score: number;
      stats: Record<string, number>;
      cap: number;
    }> = [
      {
        minigameId: 'bug-squash',
        durationSeconds: 60,
        score: 1_000_000,
        stats: { squashed: 1 },
        cap: 250,
      },
      {
        minigameId: 'pancake-flip',
        durationSeconds: 90,
        score: 0,
        stats: { ...NEUTRAL_PANCAKE_STATS, golden: 100 },
        cap: 400,
      },
      { minigameId: 'coffee-rush', durationSeconds: 90, score: 0, stats: { large: 30 }, cap: 400 },
      {
        minigameId: 'snow-cone-stand',
        durationSeconds: 120,
        score: 0,
        stats: { rushCone25: 100 },
        cap: 600,
      },
    ];
    it.each(durationCases)(
      '$minigameId: a second round 9 s later is round_too_soon, 10 s later is accepted',
      async ({ minigameId, score, stats }) => {
        const { store, advanceSeconds } = await makeHarness();

        await store.recordRound(minigameId, score, stats as never);
        await advanceSeconds(9);
        await expect(store.recordRound(minigameId, score, stats as never)).rejects.toMatchObject({
          code: 'round_too_soon',
        });
        await advanceSeconds(10);
        await expect(store.recordRound(minigameId, score, stats as never)).resolves.toBeDefined();
      },
    );
    it.each(durationCases)(
      '$minigameId: half its $durationSeconds s duration after the previous round, an over-cap round pays half the cap',
      async ({ minigameId, durationSeconds, score, stats, cap }) => {
        const { store, advanceSeconds } = await makeHarness();

        await store.recordRound(minigameId, score, stats as never);
        await advanceSeconds(durationSeconds / 2);
        const result = await store.recordRound(minigameId, score, stats as never);
        expect(result.tokensAwarded).toBe(cap / 2);
      },
    );
    it.each(durationCases)(
      '$minigameId: a full $durationSeconds s after the previous round, an over-cap round pays the full cap',
      async ({ minigameId, durationSeconds, score, stats, cap }) => {
        const { store, advanceSeconds } = await makeHarness();

        await store.recordRound(minigameId, score, stats as never);
        await advanceSeconds(durationSeconds);
        const result = await store.recordRound(minigameId, score, stats as never);
        expect(result.tokensAwarded).toBe(cap);
      },
    );
    it('a small honest round shortly after the previous one is paid in full', async () => {
      const { store, advanceSeconds } = await makeHarness();

      await store.recordRound('bug-squash', 100, { squashed: 10 });
      await advanceSeconds(30);
      const result = await store.recordRound('bug-squash', 400, { squashed: 40 });
      // floor(250 * 30 / 60) = 125 allowed; 400 / 10 = 40 earned.
      expect(result.tokensAwarded).toBe(40);
    });

    const badgeThresholdCases: Array<{
      minigameId: MinigameId;
      badgeId: BadgeId;
      durationSeconds: number;
      belowThreshold: { score: number; stats: Record<string, number> };
      atThreshold: { score: number; stats: Record<string, number> };
    }> = [
      {
        minigameId: 'bug-squash',
        badgeId: 'exterminator',
        durationSeconds: 60,
        belowThreshold: { score: 499, stats: { squashed: 499 } },
        atThreshold: { score: 500, stats: { squashed: 500 } },
      },
      {
        minigameId: 'pancake-flip',
        badgeId: 'breakfast-club',
        durationSeconds: 90,
        belowThreshold: { score: 0, stats: { ...NEUTRAL_PANCAKE_STATS, stacked: 19 } },
        atThreshold: { score: 0, stats: { ...NEUTRAL_PANCAKE_STATS, stacked: 20 } },
      },
      {
        minigameId: 'coffee-rush',
        badgeId: 'barista',
        durationSeconds: 90,
        belowThreshold: { score: 0, stats: { small: 14 } },
        atThreshold: { score: 0, stats: { small: 15 } },
      },
      {
        minigameId: 'snow-cone-stand',
        badgeId: 'brain-freeze',
        durationSeconds: 120,
        // The 200-token threshold falls on a multiple of 5, the granularity
        // of every cone weight; 195 is the largest reachable value below it.
        belowThreshold: { score: 0, stats: { cone5: 39 } },
        atThreshold: { score: 0, stats: { cone5: 40 } },
      },
    ];
    it.each(badgeThresholdCases)(
      '$minigameId: earns $badgeId at the threshold but not one below it',
      async ({ minigameId, durationSeconds, belowThreshold, atThreshold }) => {
        const { store, advanceSeconds } = await makeHarness();

        const below = await store.recordRound(
          minigameId,
          belowThreshold.score,
          belowThreshold.stats as never,
        );
        expect(below.badgeEarned).toBe(false);

        await advanceSeconds(durationSeconds);
        const at = await store.recordRound(
          minigameId,
          atThreshold.score,
          atThreshold.stats as never,
        );
        expect(at.badgeEarned).toBe(true);
      },
    );

    it('Pancake Flip: flipNow pays 5 Tokens per flip', async () => {
      const { store } = await makeHarness();

      const result = await store.recordRound('pancake-flip', 0, {
        ...NEUTRAL_PANCAKE_STATS,
        flipNow: 1,
      });

      expect(result.tokensAwarded).toBe(5);
    });

    const snowConeStatWeights: Array<[key: string, tokensPerUnit: number]> = [
      ['cone5', 5],
      ['cone10', 10],
      ['cone15', 15],
      ['cone25', 25],
      ['rushCone5', 10],
      ['rushCone10', 20],
      ['rushCone15', 30],
      ['rushCone25', 50],
    ];
    it.each(snowConeStatWeights)(
      'Snow Cone Stand: one %s pays %i Tokens',
      async (key, tokensPerUnit) => {
        const { store } = await makeHarness();

        const result = await store.recordRound('snow-cone-stand', 0, { [key]: 1 });

        expect(result.tokensAwarded).toBe(tokensPerUnit);
      },
    );
  });
}
