/**
 * Name masking for recorded proof videos: with a `masknames` URL param, every
 * rendered Penguin name (Phaser sprites and the debug overlay alike) is
 * replaced by `MASKED_NAME`.
 */
export const MASKED_NAME = '•••';

export function isMaskNamesEnabled(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has('masknames');
}

/** Returns `name`, or `MASKED_NAME` when masking is on. */
export function maskName(name: string, search: string = window.location.search): string {
  return isMaskNamesEnabled(search) ? MASKED_NAME : name;
}
