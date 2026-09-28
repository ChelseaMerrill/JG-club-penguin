import { describe, expect, it } from 'vitest';
import { IGLOO_SLOTS } from '../../persistence/progress-store';
import { iglooSlotForSlotId, slotIdForIglooSlot } from './furniture-slots';

describe('iglooSlotForSlotId', () => {
  it('maps "slot-1".."slot-11" to the matching IglooSlot number', () => {
    for (const slot of IGLOO_SLOTS) {
      expect(iglooSlotForSlotId(`slot-${slot}`)).toBe(slot);
    }
  });

  it('returns null for anything that is not one of the 11 Igloo slot ids', () => {
    expect(iglooSlotForSlotId('slot-0')).toBeNull();
    expect(iglooSlotForSlotId('slot-12')).toBeNull();
    expect(iglooSlotForSlotId('slot-01')).toBeNull();
    expect(iglooSlotForSlotId('slot-100')).toBeNull();
    expect(iglooSlotForSlotId('trophy-case')).toBeNull();
    expect(iglooSlotForSlotId('')).toBeNull();
    expect(iglooSlotForSlotId('slot-')).toBeNull();
  });
});

describe('slotIdForIglooSlot', () => {
  it('is the inverse of iglooSlotForSlotId for every Igloo slot', () => {
    for (const slot of IGLOO_SLOTS) {
      expect(iglooSlotForSlotId(slotIdForIglooSlot(slot))).toBe(slot);
    }
  });
});
