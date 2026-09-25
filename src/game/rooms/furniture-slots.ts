import { isIglooSlot, type IglooSlot } from '../../persistence/progress-store';

/**
 * The only shape `igloo.ts`'s `furnitureSlots` ever uses for a
 * `RoomFurnitureSlot.id` (#41): `"slot-1"` through `"slot-6"`.
 */
const SLOT_ID_PATTERN = /^slot-([1-6])$/;

/**
 * Maps a Room's `RoomFurnitureSlot.id` (e.g. `"slot-3"`) to the matching
 * `ProgressStore` `IglooSlot` number (`3`), or `null` for anything else (a
 * malformed id, or a Room hotspot/door id that happens to pass through
 * here). The one explicit bridge between the Igloo's Room-data slot ids and
 * `ProgressStore.setSlot`'s numeric `IglooSlot` (#41 resolved decision 1).
 */
export function iglooSlotForSlotId(slotId: string): IglooSlot | null {
  const match = SLOT_ID_PATTERN.exec(slotId);
  if (!match) return null;
  const parsed = Number(match[1]);
  return isIglooSlot(parsed) ? parsed : null;
}

/** The inverse of `iglooSlotForSlotId`: the Room slot id for a `ProgressStore` slot number. */
export function slotIdForIglooSlot(slot: IglooSlot): string {
  return `slot-${slot}`;
}
