import { describe, expect, it } from 'vitest';
import { IGLOO_GEAR_CATALOG } from '../../persistence/minigame-rules';
import { isKnownFurnitureArtKey, KNOWN_FURNITURE_ART_KEYS } from './furniture-art';

describe('isKnownFurnitureArtKey', () => {
  it('recognises every artKey in the real Igloo Gear catalog', () => {
    for (const item of IGLOO_GEAR_CATALOG) {
      expect(isKnownFurnitureArtKey(item.artKey)).toBe(true);
    }
  });

  it('falls back (false) for an artKey with no dedicated shape', () => {
    expect(isKnownFurnitureArtKey('some-future-item')).toBe(false);
    expect(isKnownFurnitureArtKey('')).toBe(false);
  });

  it('exposes the known keys list matching the catalog exactly', () => {
    const catalogKeys = IGLOO_GEAR_CATALOG.map((item) => item.artKey).sort();
    expect([...KNOWN_FURNITURE_ART_KEYS].sort()).toEqual(catalogKeys);
  });
});
