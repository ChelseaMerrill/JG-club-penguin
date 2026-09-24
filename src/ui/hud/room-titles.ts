import type { RoomId } from '../../contracts';

/** A Room's HUD header text: the big title and the small subtitle beneath it. */
export interface RoomTitle {
  title: string;
  subtitle: string;
}

/**
 * Title/subtitle text taken verbatim from the five prototype Room designs
 * (`design/Room 01 Town Center.dc.html` and its siblings `Room 02 Dev Pit`,
 * `Room 03 The Icebox` (RoomId `the-melt`), `Room 05 Roof Deck` (rendered
 * title "THE MARKET" -- the design's Room 05 content was reworked into a
 * marketplace after the file was named) and `Room 06 Igloo`.
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
    subtitle: 'JG HQ · 108 STATE ST · FLOOR 5 · 4 PENGUINS HERE',
  },
  'dev-pit': {
    title: 'DEV PIT',
    subtitle: 'TEAM RMS 1–4 · FLOOR 5 · 4 PENGUINS HERE · BUILD PASSING',
  },
  'the-melt': {
    title: 'THE ICEBOX',
    subtitle: 'CONFERENCE · 604 SF · GLASS WALL · KICKOFF IN 04:32',
  },
  'roof-deck': {
    title: 'THE MARKET',
    subtitle: 'ROOF DECK MARKETPLACE · SPEND YOUR TOKENS · 12°F · 9 SHOPPERS',
  },
  igloo: {
    title: 'YOUR IGLOO',
    subtitle: 'PLAYER HOME · 1 PENGUIN · 1 HEXLE · 6 FURNITURE SLOTS',
  },
};

export function resolveRoomTitle(roomId: RoomId): RoomTitle {
  return ROOM_TITLES[roomId];
}
