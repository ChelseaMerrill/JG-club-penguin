/**
 * Contract B-1: per-Room Presence channels and the Room broadcast bus.
 * Consumes the #26 contract stubs from `src/contracts/`.
 */
import { EMOTES, EYES, HATS, PATTERNS } from '../contracts/penguin';
import type { Facing, PenguinLook, Tile } from '../contracts/penguin';
import type {
  ChatEvent,
  MoveEvent,
  PresencePayload,
  RoomBroadcastEvent,
} from '../contracts/realtime';
import { presenceChannelKey } from '../contracts/rooms';
import type { RoomEnterEvent, RoomId } from '../contracts/rooms';
import type { GameEmitter } from '../contracts/game-events';

/** Status values a `PresenceChannelLike.subscribe` callback can be invoked with. */
export type PresenceChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/** The narrow slice of a Supabase Realtime channel that `createRoomChannel` depends on. The adapter (D2) implements this against `@supabase/supabase-js`. */
export interface PresenceChannelLike {
  subscribe(cb: (status: PresenceChannelStatus) => void): unknown;
  track(payload: PresencePayload): Promise<unknown>;
  untrack(): Promise<unknown>;
  presenceState(): Record<string, Array<Record<string, unknown>>>;
  onPresenceSync(cb: () => void): void;
  onBroadcast(cb: (payload: unknown) => void): void;
  send(payload: RoomBroadcastEvent): Promise<unknown>;
}

/** The narrow slice of a Supabase Realtime client that `createRoomChannel` depends on. */
export interface RealtimeClientLike {
  channel(name: string, opts: { presenceKey: string }): PresenceChannelLike;
  removeChannel(ch: PresenceChannelLike): Promise<unknown>;
}

/** Where validated remote Presence is rendered. Implemented by the A-3 renderer. */
export interface RemotePenguinView {
  upsert(p: PresencePayload): void;
  remove(playerId: string): void;
  clear(): void;
}

export interface RoomChannelOptions {
  client: RealtimeClientLike;
  events: GameEmitter;
  playerId: string;
  look: PenguinLook;
  view: RemotePenguinView;
}

export interface RoomChannel {
  setLook(look: PenguinLook): void;
  setTile(tile: Tile, facing?: Facing): void;
  send(event: RoomBroadcastEvent): Promise<boolean>;
  on<T extends RoomBroadcastEvent['type']>(
    type: T,
    handler: (event: Extract<RoomBroadcastEvent, { type: T }>) => void,
  ): () => void;
  currentRoom(): RoomId | null;
  stop(): Promise<void>;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const FACINGS: readonly Facing[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

function isHex(v: unknown): boolean {
  return typeof v === 'string' && HEX_RE.test(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isTile(v: unknown): v is Tile {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return isInt(t.col) && isInt(t.row);
}

function isFacing(v: unknown): v is Facing {
  return typeof v === 'string' && (FACINGS as readonly string[]).includes(v);
}

function isLook(v: unknown): v is PenguinLook {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.name === 'string' &&
    l.name.length <= 40 &&
    isHex(l.body) &&
    isHex(l.cap) &&
    isHex(l.beak) &&
    isHex(l.feet) &&
    isHex(l.belly) &&
    (HATS as readonly string[]).includes(l.hat as string) &&
    (PATTERNS as readonly string[]).includes(l.pattern as string) &&
    (EYES as readonly string[]).includes(l.eyes as string) &&
    (EMOTES as readonly string[]).includes(l.emote as string)
  );
}

/**
 * Validates and narrows an unknown Presence meta into a `PresencePayload`,
 * or returns `null` if it does not conform. Checking a meta's `playerId`
 * against the presence key it was filed under needs the key, which this
 * function is not given (its signature is fixed by contract); that check is
 * done by the sync handler below instead.
 */
export function parsePresencePayload(u: unknown): PresencePayload | null {
  if (typeof u !== 'object' || u === null) return null;
  const p = u as Record<string, unknown>;
  if (typeof p.playerId !== 'string' || p.playerId.length === 0) return null;
  if (!isLook(p.look)) return null;
  if (!isTile(p.tile)) return null;
  if (!isFacing(p.facing)) return null;
  return {
    playerId: p.playerId,
    look: p.look as PenguinLook,
    tile: p.tile,
    facing: p.facing,
  };
}

function isMoveEvent(u: unknown): u is MoveEvent {
  if (typeof u !== 'object' || u === null) return false;
  const p = u as Record<string, unknown>;
  return p.type === 'move' && typeof p.playerId === 'string' && isTile(p.target);
}

function isChatEvent(u: unknown): u is ChatEvent {
  if (typeof u !== 'object' || u === null) return false;
  const p = u as Record<string, unknown>;
  return (
    p.type === 'chat' &&
    typeof p.playerId === 'string' &&
    typeof p.text === 'string' &&
    p.text.length <= 120 &&
    typeof p.sentAt === 'number'
  );
}

function parseBroadcastEvent(u: unknown): RoomBroadcastEvent | null {
  if (isMoveEvent(u)) return u;
  if (isChatEvent(u)) return u;
  return null;
}

type BroadcastHandler = (event: RoomBroadcastEvent) => void;

/**
 * Joins the Presence channel for whichever Room is currently entered,
 * tracking the local look/tile/facing and mirroring remote Penguins into
 * `view`. Also carries the Room's typed movement/chat broadcast bus. See
 * issue #28 for the full behavioral contract.
 */
export function createRoomChannel(options: RoomChannelOptions): RoomChannel {
  const { client, events, playerId, view } = options;

  let look = options.look;
  let tile: Tile = { col: 0, row: 0 };
  let facing: Facing = 's';
  let channel: PresenceChannelLike | null = null;
  let subscribed = false;
  let currentRoomId: RoomId | null = null;
  let shownIds = new Set<string>();

  const listeners = new Map<RoomBroadcastEvent['type'], Set<BroadcastHandler>>();

  // Every channel operation (leave's untrack/removeChannel, enter's channel
  // creation) runs through this single queue so a leave always finishes
  // before the next enter starts, even when both fire synchronously.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = queue.then(fn);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function buildPayload(): PresencePayload {
    return { playerId, look, tile, facing };
  }

  function handleSync(ch: PresenceChannelLike): void {
    const state = ch.presenceState();
    const nextIds = new Set<string>();
    for (const key of Object.keys(state)) {
      if (key === playerId) continue;
      const metas = state[key];
      if (!metas || metas.length === 0) continue;
      const lastMeta = metas[metas.length - 1];
      const parsed = parsePresencePayload(lastMeta);
      if (!parsed) continue;
      if (parsed.playerId !== key) continue;
      nextIds.add(key);
      view.upsert(parsed);
    }
    for (const id of shownIds) {
      if (!nextIds.has(id)) view.remove(id);
    }
    shownIds = nextIds;
  }

  function handleBroadcast(payload: unknown): void {
    const event = parseBroadcastEvent(payload);
    if (!event) return;
    if (event.playerId === playerId) return;
    const handlers = listeners.get(event.type);
    if (!handlers || handlers.size === 0) return;
    for (const handler of Array.from(handlers)) {
      handler(event);
    }
  }

  async function doLeave(): Promise<void> {
    const ch = channel;
    channel = null;
    subscribed = false;
    currentRoomId = null;
    shownIds = new Set();
    if (ch) {
      await ch.untrack();
      await client.removeChannel(ch);
    }
    view.clear();
  }

  function doEnter(payload: RoomEnterEvent): void {
    tile = payload.entryTile;
    currentRoomId = payload.roomId;
    const name = presenceChannelKey(payload.roomId, playerId);
    const ch = client.channel(name, { presenceKey: playerId });
    channel = ch;
    subscribed = false;
    ch.onPresenceSync(() => handleSync(ch));
    ch.onBroadcast((message) => handleBroadcast(message));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' && channel === ch) {
        subscribed = true;
        void ch.track(buildPayload());
      }
    });
  }

  const unsubscribeLeave = events.on('room:leave', () => {
    void enqueue(() => doLeave());
  });
  const unsubscribeEnter = events.on('room:enter', (payload) => {
    void enqueue(() => doEnter(payload));
  });

  return {
    setLook(newLook: PenguinLook): void {
      look = newLook;
      if (channel && subscribed) {
        void channel.track(buildPayload());
      }
    },
    setTile(newTile: Tile, newFacing?: Facing): void {
      tile = newTile;
      if (newFacing) facing = newFacing;
      if (channel && subscribed) {
        void channel.track(buildPayload());
      }
    },
    async send(event: RoomBroadcastEvent): Promise<boolean> {
      if (!channel) return false;
      await channel.send(event);
      return true;
    },
    on<T extends RoomBroadcastEvent['type']>(
      type: T,
      handler: (event: Extract<RoomBroadcastEvent, { type: T }>) => void,
    ): () => void {
      const set = listeners.get(type) ?? new Set<BroadcastHandler>();
      const wrapped = handler as BroadcastHandler;
      set.add(wrapped);
      listeners.set(type, set);
      return () => {
        set.delete(wrapped);
      };
    },
    currentRoom(): RoomId | null {
      return currentRoomId;
    },
    async stop(): Promise<void> {
      await enqueue(() => doLeave());
      unsubscribeLeave();
      unsubscribeEnter();
    },
  };
}
