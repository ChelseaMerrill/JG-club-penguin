import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IGLOO_GEAR_CATALOG } from '../../persistence/minigame-rules';
import {
  FURNITURE_IMAGE_ART,
  isKnownFurnitureArtKey,
  KNOWN_FURNITURE_ART_KEYS,
} from './furniture-art';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public');

describe('isKnownFurnitureArtKey', () => {
  it('recognises every artKey in the real Igloo Gear catalog', () => {
    for (const item of IGLOO_GEAR_CATALOG) {
      expect(isKnownFurnitureArtKey(item.artKey), item.artKey).toBe(true);
    }
  });

  it('falls back (false) for an artKey with no dedicated shape', () => {
    expect(isKnownFurnitureArtKey('some-future-item')).toBe(false);
    expect(isKnownFurnitureArtKey('')).toBe(false);
  });

  it('exposes the known keys list matching the 14-item catalog exactly', () => {
    const catalogKeys = IGLOO_GEAR_CATALOG.map((item) => item.artKey).sort();
    expect(catalogKeys).toHaveLength(14);
    expect([...KNOWN_FURNITURE_ART_KEYS].sort()).toEqual(catalogKeys);
  });
});

// #135 D7: the three JG awards draw their logo, the same SVGs the Trophy
// Case already ships.
describe('FURNITURE_IMAGE_ART', () => {
  it('maps exactly the three award items to an existing public/awards SVG', () => {
    expect(Object.keys(FURNITURE_IMAGE_ART).sort()).toEqual([
      'award-bptw',
      'award-inc5000',
      'award-top-workplaces',
    ]);
    for (const [artKey, { textureKey, url }] of Object.entries(FURNITURE_IMAGE_ART)) {
      expect(url, artKey).toMatch(/^awards\/[a-z0-9-]+\.svg$/);
      expect(existsSync(path.join(PUBLIC_DIR, url)), url).toBe(true);
      expect(textureKey, artKey).toBe(`furniture-${artKey}`);
    }
  });

  it('only maps wall items, since award logos hang on the wall', () => {
    for (const artKey of Object.keys(FURNITURE_IMAGE_ART)) {
      expect(IGLOO_GEAR_CATALOG.find((item) => item.artKey === artKey)?.placement).toBe('wall');
    }
  });
});
