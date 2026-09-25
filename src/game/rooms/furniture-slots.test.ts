import { describe, expect, it } from 'vitest';
import type { IglooSlot } from '../../persistence/progress-store';
import { iglooSlotForSlotId, slotIdForIglooSlot } from './furniture-slots';

describe('iglooSlotForSlotId', () => {
  it('maps "slot-1".."slot-6" to the matching IglooSlot number', () => {
    expect(iglooSlotForSlotId('slot-1')).toBe(1);
    expect(iglooSlotForSlotId('slot-2')).toBe(2);
    expect(iglooSlotForSlotId('slot-3')).toBe(3);
    expect(iglooSlotForSlotId('slot-4')).toBe(4);
    expect(iglooSlotForSlotId('slot-5')).toBe(5);
    expect(iglooSlotForSlotId('slot-6')).toBe(6);
  });

  it('returns null for anything that is not one of the six Igloo slot ids', () => {
    expect(iglooSlotForSlotId('slot-0')).toBeNull();
    expect(iglooSlotForSlotId('slot-7')).toBeNull();
    expect(iglooSlotForSlotId('slot-10')).toBeNull();
    expect(iglooSlotForSlotId('trophy-case')).toBeNull();
    expect(iglooSlotForSlotId('')).toBeNull();
    expect(iglooSlotForSlotId('slot-')).toBeNull();
  });
});

describe('slotIdForIglooSlot', () => {
  it('is the inverse of iglooSlotForSlotId for every Igloo slot', () => {
    for (const slot of [1, 2, 3, 4, 5, 6] as const satisfies readonly IglooSlot[]) {
      expect(iglooSlotForSlotId(slotIdForIglooSlot(slot))).toBe(slot);
    }
  });
});
