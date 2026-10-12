import type { NpcDefinition } from './npcs';

/**
 * The lines an NPC's dialog can show (#144 D1): its own `dialogLines`, then
 * the texts of this appearance's `idleLines` (its Room design's bubbles),
 * minus any `dialogOmit` near-duplicate, with exact repeats removed. The
 * order is first-seen; it doesn't matter to `pickDialogLine`, which is random.
 * A `dialog.kind === 'none'` NPC (owner request, 2026-10-09) has no
 * `dialogLines` at all; its dialog never opens (`npc-dialog.ts` skips it), so
 * this never actually gets called for one, but returns an empty pool rather
 * than throwing if it ever is.
 */
export function dialogLinePool(npc: NpcDefinition): string[] {
  const omit = new Set(npc.dialogOmit ?? []);
  const pool: string[] = [];
  for (const text of [...(npc.dialogLines ?? []), ...npc.idleLines.map((line) => line.text)]) {
    if (omit.has(text) || pool.includes(text)) continue;
    pool.push(text);
  }
  return pool;
}

/**
 * One line from `pool`, picked uniformly from every line except `previous`,
 * so the same line never shows twice in a row (#144 D3). A one-line pool
 * always returns that line.
 */
export function pickDialogLine(
  pool: readonly string[],
  previous: string | undefined,
  random: () => number = Math.random,
): string {
  const choices = pool.length > 1 ? pool.filter((line) => line !== previous) : pool;
  const index = Math.min(choices.length - 1, Math.floor(random() * choices.length));
  const line = choices[index];
  if (line === undefined) throw new Error('pickDialogLine: empty pool');
  return line;
}
