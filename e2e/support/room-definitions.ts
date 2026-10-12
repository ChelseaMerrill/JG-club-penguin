import type { RoomId } from '../../src/contracts';
import { bathroom } from '../../src/game/rooms/definitions/bathroom';
import { devPit } from '../../src/game/rooms/definitions/dev-pit';
import { igloo } from '../../src/game/rooms/definitions/igloo';
import { latamCafe } from '../../src/game/rooms/definitions/latam-cafe';
import { latamDiscoHall } from '../../src/game/rooms/definitions/latam-disco-hall';
import { latamFutebolField } from '../../src/game/rooms/definitions/latam-futebol-field';
import { lobby } from '../../src/game/rooms/definitions/lobby';
import { officeHallway } from '../../src/game/rooms/definitions/office-hallway';
import { remoteLounge } from '../../src/game/rooms/definitions/remote-lounge';
import { roofDeck } from '../../src/game/rooms/definitions/roof-deck';
import {
  stairwell0,
  stairwell1,
  stairwell2,
  stairwell3,
  stairwell4,
  stairwell5,
} from '../../src/game/rooms/definitions/stairwell';
import { teamRoom1 } from '../../src/game/rooms/definitions/team-room-1';
import { teamRoom2 } from '../../src/game/rooms/definitions/team-room-2';
import { teamRoom3 } from '../../src/game/rooms/definitions/team-room-3';
import { teamRoom4 } from '../../src/game/rooms/definitions/team-room-4';
import { theIcebox } from '../../src/game/rooms/definitions/the-icebox';
import { theMelt } from '../../src/game/rooms/definitions/the-melt';
import { theMullet } from '../../src/game/rooms/definitions/the-mullet';
import { townCenter } from '../../src/game/rooms/definitions/town-center';
import type { RoomDefinition } from '../../src/game/rooms/room-definition';

// Imports each definition module directly rather than
// `src/game/rooms/registry.ts`'s `getRoomDefinition`: the registry's
// module-load-time `assertValidRoomDefinitions` guard reads
// `import.meta.env.DEV`/`MODE`, which only Vite (not Playwright's plain
// Node/TS execution) defines — the same reason `room-framework.spec.ts`
// avoids importing `dev-room-hook.ts` directly.
export const ROOM_DEFINITIONS: Record<RoomId, RoomDefinition> = {
  'town-center': townCenter,
  'dev-pit': devPit,
  'the-melt': theMelt,
  'roof-deck': roofDeck,
  igloo,
  'the-icebox': theIcebox,
  'office-hallway': officeHallway,
  'team-room-1': teamRoom1,
  'team-room-2': teamRoom2,
  'team-room-3': teamRoom3,
  'team-room-4': teamRoom4,
  bathroom,
  'the-mullet': theMullet,
  lobby,
  'stairwell-0': stairwell0,
  'stairwell-1': stairwell1,
  'stairwell-2': stairwell2,
  'stairwell-3': stairwell3,
  'stairwell-4': stairwell4,
  'stairwell-5': stairwell5,
  'remote-lounge': remoteLounge,
  'latam-cafe': latamCafe,
  'latam-disco-hall': latamDiscoHall,
  'latam-futebol-field': latamFutebolField,
};
