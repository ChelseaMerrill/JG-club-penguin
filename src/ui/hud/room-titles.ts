import type { RoomId } from '../../contracts';

/** A Room's HUD header text: the big title and the small subtitle beneath it. */
export interface RoomTitle {
  title: string;
  subtitle: string;
}

/**
 * Title/subtitle text taken verbatim from the five prototype Room designs:
 * `design/Room 01 Town Center.dc.html`, `Room 02 Dev Pit`, `Room 04 Kitchen`
 * (RoomId `the-melt`, rendered title "THE MELT"), `Room 05 Roof Deck`
 * (rendered title "THE MARKET" -- the design's Room 05 content was reworked
 * into a marketplace after the file was named) and `Room 06 Igloo`.
 *
 * Subtitles keep only the designs' static descriptors (location, floor,
 * purpose); any live-looking figure the designs hard-coded ("4 PENGUINS
 * HERE", "BUILD PASSING", "9 SHOPPERS", a countdown) is dropped rather than
 * shipped as a fake number the prototype never actually computes. The
 * Igloo's "1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS" stays: those are fixed
 * capacity facts about a Player's own Igloo, not a live headcount.
 *
 * This is the injected `resolveRoomTitle` (#32 D3) for both the real HUD
 * wiring (`src/main.ts`) and the test-only hook
 * (`src/ui/hud/dev-hud-hook.ts`), so the two never drift apart. #13's
 * `getRoomDefinition` replaces this file entirely once it lands (whichever
 * of #13/#32 merges second does the swap).
 */
const ROOM_TITLES: Record<RoomId, RoomTitle> = {
  'town-center': {
    title: 'TOWN CENTER',
    subtitle: 'JG HQ · 108 STATE ST · FLOOR 5',
  },
  'dev-pit': {
    title: 'DEV PIT',
    subtitle: 'TEAM RMS 1–4 · FLOOR 5',
  },
  'the-melt': {
    title: 'THE MELT',
    subtitle: 'KITCHEN · FLOOR 5',
  },
  'roof-deck': {
    title: 'THE MARKET',
    subtitle: 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS',
  },
  igloo: {
    title: 'YOUR IGLOO',
    subtitle: 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS',
  },
};

export function resolveRoomTitle(roomId: RoomId): RoomTitle {
  return ROOM_TITLES[roomId];
}
