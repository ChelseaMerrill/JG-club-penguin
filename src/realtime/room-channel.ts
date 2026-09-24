/**
 * Contract B-1: per-Room Presence channels and the Room broadcast bus.
 * Consumes the #26 contract stubs from `src/contracts/`.
 */
import { EMOTES, EYES, HATS, PATTERNS } from '../contracts/penguin';
import type {
  Eyes,
  Facing,
  Hat,
  Hex,
  Pattern,
  PenguinLook,
  Tile,
  Emote,
} from '../contracts/penguin';
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
  /** Resolves the push status ('ok' | 'timed out' | 'error', or another server string). */
  send(payload: RoomBroadcastEvent): Promise<'ok' | 'timed out' | 'error' | string>;
  /**
   * Forcibly drops this channel instance client-side, independent of any
   * server round trip. Called when `removeChannel` does not resolve `'ok'`,
   * so a stale/leaked instance is never reused for the next join.
   */
  teardown(): void;
}

/** The narrow slice of a Supabase Realtime client that `createRoomChannel` depends on. */
export interface RealtimeClientLike {
  channel(name: string, opts: { presenceKey: string }): PresenceChannelLike;
  /** Resolves the leave push status ('ok' | 'timed out' | 'error', or another server string). */
  removeChannel(ch: PresenceChannelLike): Promise<'ok' | 'timed out' | 'error' | string>;
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
  /** Clock for stamping outgoing `sentAt`. Defaults to `Date.now`. */
  now?: () => number;
  /** Timer used for reconnect backoff. Defaults to the global `setTimeout`, injectable for deterministic tests. */
  setTimeout?: typeof setTimeout;
  /** Timer used to cancel a pending reconnect. Defaults to the global `clearTimeout`. */
  clearTimeout?: typeof clearTimeout;
}

/** An outgoing move, before the channel stamps `playerId`. */
export type SendableMoveEvent = Omit<MoveEvent, 'playerId'>;
/** An outgoing chat message, before the channel stamps `playerId` and `sentAt`. */
export type SendableChatEvent = Omit<ChatEvent, 'playerId' | 'sentAt'>;
/** The union of events a caller can hand to `RoomChannel.send`. */
export type SendableRoomEvent = SendableMoveEvent | SendableChatEvent;

export interface RoomChannel {
  setLook(look: PenguinLook): void;
  /**
   * Sets the tile/facing the local Player is shown at and re-tracks it.
   * Call this on Room arrival only, never once per movement step: in-Room
   * motion travels as `move` broadcasts instead (#43), not repeated tracks.
   */
  setTile(tile: Tile, facing?: Facing): void;
  send(event: SendableRoomEvent): Promise<boolean>;
  on<T extends RoomBroadcastEvent['type']>(
    type: T,
    handler: (event: Extract<RoomBroadcastEvent, { type: T }>) => void,
  ): () => void;
  currentRoom(): RoomId | null;
  /** Fires after each Room entry (with the Room id) and each leave (with `null`), for consumers like chat (#44) that must clear on Room change. */
  onRoomChange(handler: (roomId: RoomId | null) => void): () => void;
  stop(): Promise<void>;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const FACINGS: readonly Facing[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const MAX_TILE = 255;
const MAX_PLAYER_ID_LEN = 64;
const MAX_CHAT_LEN = 120;
const MAX_REMOTE_PENGUINS = 50;
const REJOIN_DELAYS_MS = [1000, 2000, 4000];
const REJOIN_MAX_DELAY_MS = 10000;

/**
 * Control, bidi and zero-width characters stripped from names before they
 * are shown: C0 controls, DEL/C1 controls, zero-width space through
 * right-to-left mark, bidi embedding/override controls, isolates, and BOM.
 */
const UNSAFE_NAME_CHARS_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

function isHex(v: unknown): v is Hex {
  return typeof v === 'string' && HEX_RE.test(v);
}

function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function isTile(v: unknown): v is Tile {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return isIntInRange(t.col, 0, MAX_TILE) && isIntInRange(t.row, 0, MAX_TILE);
}

function isFacing(v: unknown): v is Facing {
  return typeof v === 'string' && (FACINGS as readonly string[]).includes(v);
}

function isValidPlayerId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_PLAYER_ID_LEN;
}

function isValidSentAt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Strips control/bidi/zero-width characters and trims; falls back to `'Penguin'` rather than rejecting the whole Presence payload. */
function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Penguin';
  const cleaned = raw.replace(UNSAFE_NAME_CHARS_RE, '').trim();
  if (cleaned.length < 1 || cleaned.length > 40) return 'Penguin';
  return cleaned;
}

/** Validates every `PenguinLook` field except `name` (handled separately by `sanitizeName`). */
function isLookShapeValid(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
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

/** Builds a fresh `PenguinLook` containing only known keys, dropping anything else the payload carried. */
function buildLook(v: Record<string, unknown>): PenguinLook {
  return {
    name: sanitizeName(v.name),
    body: v.body as Hex,
    cap: v.cap as Hex,
    beak: v.beak as Hex,
    feet: v.feet as Hex,
    belly: v.belly as Hex,
    hat: v.hat as Hat,
    pattern: v.pattern as Pattern,
    eyes: v.eyes as Eyes,
    emote: v.emote as Emote,
  };
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
  if (!isValidPlayerId(p.playerId)) return null;
  if (!isLookShapeValid(p.look)) return null;
  if (!isTile(p.tile)) return null;
  if (!isFacing(p.facing)) return null;
  return {
    playerId: p.playerId,
    look: buildLook(p.look),
    tile: { col: p.tile.col, row: p.tile.row },
    facing: p.facing,
  };
}

/** Replaces `\r\n` and `\n` with a space, then trims. */
function normalizeChatText(raw: string): string {
  return raw.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
}

function parseMoveEvent(u: unknown): MoveEvent | null {
  if (typeof u !== 'object' || u === null) return null;
  const p = u as Record<string, unknown>;
  if (p.type !== 'move') return null;
  if (!isValidPlayerId(p.playerId)) return null;
  if (!isTile(p.target)) return null;
  return { type: 'move', playerId: p.playerId, target: { col: p.target.col, row: p.target.row } };
}

function parseChatEvent(u: unknown): ChatEvent | null {
  if (typeof u !== 'object' || u === null) return null;
  const p = u as Record<string, unknown>;
  if (p.type !== 'chat') return null;
  if (!isValidPlayerId(p.playerId)) return null;
  if (typeof p.text !== 'string') return null;
  const text = normalizeChatText(p.text);
  if (text.length < 1 || text.length > MAX_CHAT_LEN) return null;
  if (!isValidSentAt(p.sentAt)) return null;
  return { type: 'chat', playerId: p.playerId, text, sentAt: p.sentAt };
}

function parseBroadcastEvent(u: unknown): RoomBroadcastEvent | null {
  return parseMoveEvent(u) ?? parseChatEvent(u);
}

type BroadcastHandler = (event: RoomBroadcastEvent) => void;
type RoomChangeHandler = (roomId: RoomId | null) => void;

/**
 * Joins the Presence channel for whichever Room is currently entered,
 * tracking the local look/tile/facing and mirroring remote Penguins into
 * `view`. Also carries the Room's typed movement/chat broadcast bus. See
 * issue #28 for the full behavioral contract.
 */
export function createRoomChannel(options: RoomChannelOptions): RoomChannel {
  const { client, events, playerId, view } = options;
  const now = options.now ?? Date.now;
  const scheduleTimer = options.setTimeout ?? setTimeout;
  const cancelTimer = options.clearTimeout ?? clearTimeout;

  let look = options.look;
  let tile: Tile = { col: 0, row: 0 };
  let facing: Facing = 's';
  let channel: PresenceChannelLike | null = null;
  let subscribed = false;
  let currentRoomId: RoomId | null = null;
  let shownIds = new Set<string>();

  // Bumped on every enter and every leave. Callbacks registered against a
  // channel capture the generation at registration time and no-op once it
  // is stale, even if the underlying client hands back the same channel
  // instance for a reused topic (see B-2).
  let generation = 0;

  let rejoinAttempt = 0;
  let rejoinTimer: ReturnType<typeof scheduleTimer> | null = null;

  const listeners = new Map<RoomBroadcastEvent['type'], Set<BroadcastHandler>>();
  const roomChangeListeners = new Set<RoomChangeHandler>();

  // Every channel operation (leave's removeChannel, enter's channel
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

  function notifyRoomChange(roomId: RoomId | null): void {
    for (const handler of Array.from(roomChangeListeners)) {
      try {
        handler(roomId);
      } catch (err) {
        console.error('[room-channel] onRoomChange handler failed', err);
      }
    }
  }

  function cancelRejoinTimer(): void {
    if (rejoinTimer !== null) {
      cancelTimer(rejoinTimer);
      rejoinTimer = null;
    }
  }

  function nextRejoinDelay(): number {
    const delay =
      rejoinAttempt < REJOIN_DELAYS_MS.length
        ? REJOIN_DELAYS_MS[rejoinAttempt]
        : REJOIN_MAX_DELAY_MS;
    rejoinAttempt += 1;
    return delay;
  }

  function scheduleRejoin(): void {
    if (rejoinTimer !== null) return;
    const roomId = currentRoomId;
    if (!roomId) return;
    const delay = nextRejoinDelay();
    rejoinTimer = scheduleTimer(() => {
      rejoinTimer = null;
      void enqueue(async () => {
        await doLeave();
        doEnter({ roomId, entryTile: tile });
      });
    }, delay);
  }

  function handleSync(ch: PresenceChannelLike): void {
    const state = ch.presenceState();
    const igloo = currentRoomId === 'igloo';

    const preferred: string[] = [];
    const rest: string[] = [];
    for (const key of Object.keys(state)) {
      if (key === playerId) continue;
      const metas = state[key];
      if (!metas || metas.length === 0) continue;
      if (shownIds.has(key)) preferred.push(key);
      else rest.push(key);
    }
    const selected = [...preferred, ...rest].slice(0, MAX_REMOTE_PENGUINS);

    const nextIds = new Set<string>();
    for (const key of selected) {
      const metas = state[key];
      if (!metas) continue;
      const lastMeta = metas[metas.length - 1];
      const parsed = parsePresencePayload(lastMeta);
      if (!parsed) continue;
      if (parsed.playerId !== key) continue;
      nextIds.add(key);
      if (!igloo) {
        try {
          view.upsert(parsed);
        } catch (err) {
          console.error('[room-channel] view.upsert failed', err);
        }
      }
    }
    for (const id of shownIds) {
      if (nextIds.has(id)) continue;
      if (!igloo) {
        try {
          view.remove(id);
        } catch (err) {
          console.error('[room-channel] view.remove failed', err);
        }
      }
    }
    shownIds = nextIds;
  }

  function handleBroadcast(payload: unknown): void {
    if (currentRoomId === 'igloo') return;
    const event = parseBroadcastEvent(payload);
    if (!event) return;
    if (event.playerId === playerId) return;
    if (!shownIds.has(event.playerId)) return;
    const handlers = listeners.get(event.type);
    if (!handlers || handlers.size === 0) return;
    for (const handler of Array.from(handlers)) {
      try {
        handler(event);
      } catch (err) {
        console.error('[room-channel] broadcast handler failed', err);
      }
    }
  }

  function handleStatus(ch: PresenceChannelLike, status: PresenceChannelStatus): void {
    if (status === 'SUBSCRIBED') {
      subscribed = true;
      rejoinAttempt = 0;
      cancelRejoinTimer();
      void ch.track(buildPayload());
      return;
    }
    subscribed = false;
    scheduleRejoin();
  }

  /** Synchronous reset first, network cleanup in try/catch so it never wedges the queue or leaves ghosts. */
  async function doLeave(): Promise<void> {
    const ch = channel;
    channel = null;
    subscribed = false;
    currentRoomId = null;
    shownIds = new Set();
    generation++;
    cancelRejoinTimer();
    view.clear();
    notifyRoomChange(null);
    if (!ch) return;
    try {
      const status = await client.removeChannel(ch);
      if (status !== 'ok') {
        ch.teardown();
      }
    } catch (err) {
      console.error('[room-channel] removeChannel failed', err);
      ch.teardown();
    }
  }

  function doEnter(payload: RoomEnterEvent): void {
    tile = payload.entryTile;
    currentRoomId = payload.roomId;
    const name = presenceChannelKey(payload.roomId, playerId);
    const ch = client.channel(name, { presenceKey: playerId });
    channel = ch;
    subscribed = false;
    const gen = ++generation;

    ch.onPresenceSync(() => {
      if (gen !== generation) return;
      handleSync(ch);
    });
    ch.onBroadcast((message) => {
      if (gen !== generation) return;
      handleBroadcast(message);
    });
    ch.subscribe((status) => {
      if (gen !== generation) return;
      handleStatus(ch, status);
    });

    notifyRoomChange(currentRoomId);
  }

  const unsubscribeLeave = events.on('room:leave', () => {
    void enqueue(() => doLeave());
  });
  const unsubscribeEnter = events.on('room:enter', (payload) => {
    void enqueue(async () => {
      if (channel) {
        await doLeave();
      }
      rejoinAttempt = 0;
      cancelRejoinTimer();
      doEnter(payload);
    });
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
    async send(event: SendableRoomEvent): Promise<boolean> {
      if (!channel || !subscribed) return false;
      const full: RoomBroadcastEvent =
        event.type === 'move'
          ? { type: 'move', playerId, target: event.target }
          : { type: 'chat', playerId, text: event.text, sentAt: now() };
      const parsed = parseBroadcastEvent(full);
      if (!parsed) return false;
      const status = await channel.send(parsed);
      return status === 'ok';
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
    onRoomChange(handler: RoomChangeHandler): () => void {
      roomChangeListeners.add(handler);
      return () => {
        roomChangeListeners.delete(handler);
      };
    },
    async stop(): Promise<void> {
      unsubscribeEnter();
      unsubscribeLeave();
      cancelRejoinTimer();
      await enqueue(() => doLeave());
    },
  };
}
