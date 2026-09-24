/**
 * Per-Room Presence (#28): the Room channel for whichever Room the Player is
 * in, and the typed Room broadcast bus (`move`, `chat`) that rides on it.
 * Consumes the #26 contracts in `src/contracts/`.
 */
import {
  DEFAULT_FACING,
  EYES,
  HATS,
  IDLE_EMOTES,
  isHexColor,
  PATTERNS,
  PENGUIN_NAME_MAX,
  roomChannelKey,
  type Facing,
  type PenguinLook,
  type PresencePayload,
  type RoomBroadcastEvent,
  type RoomBroadcastMap,
  type RoomEventMap,
  type RoomId,
  type Tile,
  type TypedEmitter,
} from '../contracts';

/** Status values a `RoomChannelLike.subscribe` callback can be invoked with. */
export type RoomChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * The narrow slice of a Supabase Realtime channel that `createRoomChannel`
 * depends on. `supabase-realtime.ts` implements it against
 * `@supabase/supabase-js`.
 */
export interface RoomChannelLike {
  subscribe(cb: (status: RoomChannelStatus) => void): unknown;
  /** Resolves the push status ('ok' | 'timed out' | 'error'). */
  track(payload: PresencePayload): Promise<string>;
  untrack(): Promise<unknown>;
  presenceState(): Record<string, Array<Record<string, unknown>>>;
  onPresenceSync(cb: () => void): void;
  /** Registers `cb` for one broadcast event name; `cb` gets the raw, unvalidated payload. */
  onBroadcast(event: RoomBroadcastEvent, cb: (payload: unknown) => void): void;
  /** Resolves the push status ('ok' | 'timed out' | 'error'). */
  send(event: RoomBroadcastEvent, payload: unknown): Promise<string>;
  /**
   * Forcibly drops this channel instance client-side, independent of any
   * server round trip. Called when `removeChannel` does not resolve `'ok'`.
   */
  teardown(): void;
}

/** The narrow slice of a Supabase Realtime client that `createRoomChannel` depends on. */
export interface RealtimeClientLike {
  /**
   * Resolves a fresh, joinable channel for `name`. Async so the adapter can
   * first evict a stale instance realtime-js still lists under the same
   * topic (see `supabase-realtime.ts`).
   */
  channel(name: string, opts: { presenceKey: string }): Promise<RoomChannelLike>;
  /** Resolves the leave push status ('ok' | 'timed out' | 'error'). */
  removeChannel(ch: RoomChannelLike): Promise<string>;
}

/** Where validated remote Presence is rendered (the #31 renderer, stubbed in `penguin-sprites.ts`). */
export interface RemotePenguinView {
  upsert(p: PresencePayload): void;
  remove(playerId: string): void;
  clear(): void;
}

export interface RoomChannelOptions {
  client: RealtimeClientLike;
  /** The shared `gameEvents` bus; only its Room events are used. */
  events: TypedEmitter<RoomEventMap>;
  playerId: string;
  look: PenguinLook;
  view: RemotePenguinView;
  /** Clock for stamping outgoing `sentAt`. Defaults to `Date.now`. */
  now?: () => number;
  /** Timer used for reconnect backoff. Defaults to the global `setTimeout`, injectable for deterministic tests. */
  setTimeout?: typeof setTimeout;
  /** Timer used to cancel a pending reconnect. Defaults to the global `clearTimeout`. */
  clearTimeout?: typeof clearTimeout;
  /** Reports a caught failure (network, view or handler). Defaults to `console.error`. */
  onError?: (context: string, err: unknown) => void;
}

/** Fields the Room channel stamps on every outgoing broadcast itself. */
type StampedField = 'playerId' | 'sentAt';

/** An outgoing broadcast payload, before the channel stamps `playerId` (and `sentAt` for chat). */
export type SendablePayload<K extends RoomBroadcastEvent> = Omit<RoomBroadcastMap[K], StampedField>;

export interface RoomChannel {
  setLook(look: PenguinLook): void;
  /**
   * Sets the tile/facing the local Player is shown at and re-tracks it.
   * Call this on Room arrival only, never once per movement step: in-Room
   * motion travels as `move` broadcasts instead (#43), not repeated tracks.
   */
  setTile(tile: Tile, facing?: Facing): void;
  /** Resolves `true` only once the broadcast was pushed and acknowledged `'ok'`. */
  send<K extends RoomBroadcastEvent>(type: K, payload: SendablePayload<K>): Promise<boolean>;
  on<K extends RoomBroadcastEvent>(
    type: K,
    handler: (payload: RoomBroadcastMap[K]) => void,
  ): () => void;
  currentRoom(): RoomId | null;
  /**
   * Fires after each Room entry (with the Room id) and each Room leave
   * (with `null`), for consumers like chat (#44) that must clear on Room
   * change. A reconnect is not a Room change and never fires it.
   */
  onRoomChange(handler: (roomId: RoomId | null) => void): () => void;
  /** Whether the current Room channel is joined (its last status was SUBSCRIBED). */
  isSubscribed(): boolean;
  /** Fires on every change of `isSubscribed()`, including during a reconnect. */
  onSubscribedChange(handler: (subscribed: boolean) => void): () => void;
  /** Leaves the current Room channel and stops following Room events. */
  stop(): Promise<void>;
}

const MAX_TILE = 255;
const MAX_PLAYER_ID_LEN = 64;
const MAX_CHAT_LEN = 120;
const MAX_REMOTE_PENGUINS = 50;
const REJOIN_DELAYS_MS = [1000, 2000, 4000];
const REJOIN_MAX_DELAY_MS = 10000;

/**
 * Every `Facing` from the contract. Typed as a `Record` so adding a facing
 * to the contract fails to compile here until it is listed.
 */
const FACINGS: Record<Facing, true> = { left: true, right: true };

/**
 * Control, bidi and zero-width characters stripped from names before they
 * are shown: C0 controls, DEL/C1 controls, zero-width space through
 * right-to-left mark, bidi embedding/override controls, isolates, and BOM.
 */
const UNSAFE_NAME_CHARS_RE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (values as readonly string[]).includes(v);
}

function isHex(v: unknown): v is PenguinLook['body'] {
  return typeof v === 'string' && isHexColor(v);
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
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(FACINGS, v);
}

function isValidPlayerId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_PLAYER_ID_LEN;
}

function isValidSentAt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Strips control/bidi/zero-width characters and trims. An empty name is
 * valid (the Creator has not been completed yet); a non-string or a name
 * over `PENGUIN_NAME_MAX` falls back to `''` rather than rejecting the whole
 * Presence payload. Render it as `name || UNNAMED_PENGUIN`.
 */
function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(UNSAFE_NAME_CHARS_RE, '').trim();
  return cleaned.length <= PENGUIN_NAME_MAX ? cleaned : '';
}

/** Builds a fresh `PenguinLook` containing only known, valid keys, or `null` if any field is invalid. */
function parseLook(v: unknown): PenguinLook | null {
  if (typeof v !== 'object' || v === null) return null;
  const l = v as Record<string, unknown>;
  if (!isHex(l.body) || !isHex(l.cap) || !isHex(l.beak) || !isHex(l.feet) || !isHex(l.belly)) {
    return null;
  }
  if (!isOneOf(HATS, l.hat) || !isOneOf(PATTERNS, l.pattern)) return null;
  if (!isOneOf(EYES, l.eyes) || !isOneOf(IDLE_EMOTES, l.emote)) return null;
  return {
    name: sanitizeName(l.name),
    body: l.body,
    cap: l.cap,
    beak: l.beak,
    feet: l.feet,
    belly: l.belly,
    hat: l.hat,
    pattern: l.pattern,
    eyes: l.eyes,
    emote: l.emote,
  };
}

/**
 * Validates and narrows an unknown Presence meta into a `PresencePayload`,
 * or returns `null` if it does not conform. Checking a meta's `playerId`
 * against the presence key it was filed under needs the key, which this
 * function is not given; the sync handler below does that check.
 */
export function parsePresencePayload(u: unknown): PresencePayload | null {
  if (typeof u !== 'object' || u === null) return null;
  const p = u as Record<string, unknown>;
  if (!isValidPlayerId(p.playerId)) return null;
  const look = parseLook(p.look);
  if (!look) return null;
  if (!isTile(p.tile)) return null;
  if (!isFacing(p.facing)) return null;
  return {
    playerId: p.playerId,
    look,
    tile: { col: p.tile.col, row: p.tile.row },
    facing: p.facing,
  };
}

/** Replaces `\r\n` and `\n` with a space, then trims. */
function normalizeChatText(raw: string): string {
  return raw.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
}

/**
 * One validator per `RoomBroadcastMap` key. Its keys are also the broadcast
 * event names the channel listens for, so the list is derived from the
 * contract: adding an event to `RoomBroadcastMap` fails to compile here
 * until it has a validator.
 */
const BROADCAST_PARSERS: {
  [K in RoomBroadcastEvent]: (u: unknown) => RoomBroadcastMap[K] | null;
} = {
  move(u) {
    if (typeof u !== 'object' || u === null) return null;
    const p = u as Record<string, unknown>;
    if (!isValidPlayerId(p.playerId)) return null;
    if (!isTile(p.target)) return null;
    return { playerId: p.playerId, target: { col: p.target.col, row: p.target.row } };
  },
  chat(u) {
    if (typeof u !== 'object' || u === null) return null;
    const p = u as Record<string, unknown>;
    if (!isValidPlayerId(p.playerId)) return null;
    if (typeof p.text !== 'string') return null;
    const text = normalizeChatText(p.text);
    if (text.length < 1 || text.length > MAX_CHAT_LEN) return null;
    if (!isValidSentAt(p.sentAt)) return null;
    return { playerId: p.playerId, text, sentAt: p.sentAt };
  },
};

const BROADCAST_EVENTS = Object.keys(BROADCAST_PARSERS) as RoomBroadcastEvent[];

function parseBroadcast<K extends RoomBroadcastEvent>(
  type: K,
  u: unknown,
): RoomBroadcastMap[K] | null {
  return BROADCAST_PARSERS[type](u) as RoomBroadcastMap[K] | null;
}

type AnyBroadcastHandler = (payload: RoomBroadcastMap[RoomBroadcastEvent]) => void;
type RoomChangeHandler = (roomId: RoomId | null) => void;
type SubscribedHandler = (subscribed: boolean) => void;

function defaultOnError(context: string, err: unknown): void {
  console.error(`[room-channel] ${context}`, err);
}

/**
 * Joins the Room channel for whichever Room is currently entered, tracking
 * the local look/tile/facing and mirroring remote Penguins into `view`. Also
 * carries the Room's typed broadcast bus. See issue #28 for the behavioral
 * contract.
 *
 * A Room change (`room:leave`, or a `room:enter` while a channel exists)
 * clears the view and fires `onRoomChange`. A reconnect (CLOSED,
 * CHANNEL_ERROR, TIMED_OUT, or a `track()` that is not acknowledged `'ok'`)
 * only rebuilds the same Room's channel after a backoff: the view is kept
 * and the next Presence sync reconciles it (`src/contracts/rooms.ts`).
 */
export function createRoomChannel(options: RoomChannelOptions): RoomChannel {
  const { client, events, playerId, view } = options;
  const now = options.now ?? Date.now;
  const scheduleTimer = options.setTimeout ?? setTimeout;
  const cancelTimer = options.clearTimeout ?? clearTimeout;
  const onError = options.onError ?? defaultOnError;

  let look = options.look;
  let tile: Tile = { col: 0, row: 0 };
  let facing: Facing = DEFAULT_FACING;
  let channel: RoomChannelLike | null = null;
  let subscribed = false;
  let currentRoomId: RoomId | null = null;
  let shownIds = new Set<string>();

  // Bumped whenever a channel is opened or detached. Callbacks registered
  // against a channel capture the generation at registration time and no-op
  // once it is stale, so a detached channel's late callbacks are inert.
  let generation = 0;

  let rejoinAttempt = 0;
  let rejoinTimer: ReturnType<typeof scheduleTimer> | null = null;

  const listeners = new Map<RoomBroadcastEvent, Set<AnyBroadcastHandler>>();
  const roomChangeListeners = new Set<RoomChangeHandler>();
  const subscribedListeners = new Set<SubscribedHandler>();

  // Every channel operation (leave's removeChannel, enter's and rebuild's
  // channel creation) runs through this single queue so a leave always
  // finishes before the next channel is opened, even when both fire
  // synchronously.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const result = queue.then(fn);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function guarded(context: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      onError(context, err);
    }
  }

  function buildPayload(): PresencePayload {
    return { playerId, look, tile, facing };
  }

  function notifyRoomChange(roomId: RoomId | null): void {
    for (const handler of Array.from(roomChangeListeners)) {
      guarded('onRoomChange handler failed', () => handler(roomId));
    }
  }

  function setSubscribed(next: boolean): void {
    if (subscribed === next) return;
    subscribed = next;
    for (const handler of Array.from(subscribedListeners)) {
      guarded('onSubscribedChange handler failed', () => handler(next));
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

  function scheduleRebuild(): void {
    if (rejoinTimer !== null) return;
    if (!currentRoomId) return;
    rejoinTimer = scheduleTimer(() => {
      rejoinTimer = null;
      void enqueue(() => rebuildChannel());
    }, nextRejoinDelay());
  }

  function track(ch: RoomChannelLike, gen: number): void {
    ch.track(buildPayload()).then(
      (status) => {
        if (gen !== generation) return;
        if (status === 'ok') {
          rejoinAttempt = 0;
          return;
        }
        onError('track was not acknowledged', status);
        scheduleRebuild();
      },
      (err: unknown) => {
        if (gen !== generation) return;
        onError('track failed', err);
        scheduleRebuild();
      },
    );
  }

  function handleSync(ch: RoomChannelLike): void {
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
      const parsed = parsePresencePayload(metas[metas.length - 1]);
      if (!parsed) continue;
      if (parsed.playerId !== key) continue;
      nextIds.add(key);
      if (!igloo) guarded('view.upsert failed', () => view.upsert(parsed));
    }
    for (const id of shownIds) {
      if (nextIds.has(id)) continue;
      if (!igloo) guarded('view.remove failed', () => view.remove(id));
    }
    shownIds = nextIds;
  }

  function handleBroadcast(type: RoomBroadcastEvent, raw: unknown): void {
    if (currentRoomId === 'igloo') return;
    const payload = parseBroadcast(type, raw);
    if (!payload) return;
    if (payload.playerId === playerId) return;
    if (!shownIds.has(payload.playerId)) return;
    const handlers = listeners.get(type);
    if (!handlers) return;
    for (const handler of Array.from(handlers)) {
      guarded('broadcast handler failed', () => handler(payload));
    }
  }

  function handleStatus(ch: RoomChannelLike, gen: number, status: RoomChannelStatus): void {
    if (status === 'SUBSCRIBED') {
      setSubscribed(true);
      cancelRejoinTimer();
      track(ch, gen);
      return;
    }
    setSubscribed(false);
    scheduleRebuild();
  }

  /** Forgets the current channel synchronously, so its late callbacks are inert. */
  function detachChannel(): RoomChannelLike | null {
    const ch = channel;
    channel = null;
    generation++;
    setSubscribed(false);
    return ch;
  }

  /** Removes a detached channel, tearing it down client-side if the leave is not `'ok'`. */
  async function releaseChannel(ch: RoomChannelLike): Promise<void> {
    try {
      const status = await client.removeChannel(ch);
      if (status !== 'ok') ch.teardown();
    } catch (err) {
      onError('removeChannel failed', err);
      ch.teardown();
    }
  }

  async function openChannel(roomId: RoomId): Promise<void> {
    let ch: RoomChannelLike;
    try {
      ch = await client.channel(roomChannelKey(roomId, playerId), { presenceKey: playerId });
    } catch (err) {
      onError('channel failed', err);
      scheduleRebuild();
      return;
    }
    channel = ch;
    const gen = ++generation;

    try {
      ch.onPresenceSync(() => {
        if (gen !== generation) return;
        handleSync(ch);
      });
      for (const type of BROADCAST_EVENTS) {
        ch.onBroadcast(type, (raw) => {
          if (gen !== generation) return;
          handleBroadcast(type, raw);
        });
      }
      ch.subscribe((status) => {
        if (gen !== generation) return;
        handleStatus(ch, gen, status);
      });
    } catch (err) {
      onError('subscribe failed', err);
      scheduleRebuild();
    }
  }

  /** A Room change: clear the view and notify, then release the channel. */
  async function leaveRoom(): Promise<void> {
    const ch = detachChannel();
    currentRoomId = null;
    shownIds = new Set();
    cancelRejoinTimer();
    guarded('view.clear failed', () => view.clear());
    notifyRoomChange(null);
    if (ch) await releaseChannel(ch);
  }

  async function enterRoom(roomId: RoomId, entryTile: Tile): Promise<void> {
    if (channel || currentRoomId) await leaveRoom();
    rejoinAttempt = 0;
    cancelRejoinTimer();
    tile = entryTile;
    currentRoomId = roomId;
    await openChannel(roomId);
    notifyRoomChange(roomId);
  }

  /**
   * A reconnect, not a Room change: tears down and re-creates the same
   * Room's channel. Keeps `currentRoomId` and `shownIds` and never touches
   * the view or `onRoomChange`; the next sync reconciles remote Penguins.
   */
  async function rebuildChannel(): Promise<void> {
    const roomId = currentRoomId;
    if (!roomId) return;
    const ch = detachChannel();
    if (ch) await releaseChannel(ch);
    await openChannel(roomId);
  }

  const unsubscribeLeave = events.on('room:leave', () => {
    void enqueue(() => leaveRoom());
  });
  const unsubscribeEnter = events.on('room:enter', ({ roomId, entryTile }) => {
    void enqueue(() => enterRoom(roomId, entryTile));
  });

  return {
    setLook(newLook: PenguinLook): void {
      look = newLook;
      if (channel && subscribed) track(channel, generation);
    },
    setTile(newTile: Tile, newFacing?: Facing): void {
      tile = newTile;
      if (newFacing) facing = newFacing;
      if (channel && subscribed) track(channel, generation);
    },
    async send<K extends RoomBroadcastEvent>(
      type: K,
      payload: SendablePayload<K>,
    ): Promise<boolean> {
      if (!channel || !subscribed) return false;
      const stamped =
        type === 'chat' ? { ...payload, playerId, sentAt: now() } : { ...payload, playerId };
      const parsed = parseBroadcast(type, stamped);
      if (!parsed) return false;
      const status = await channel.send(type, parsed);
      return status === 'ok';
    },
    on<K extends RoomBroadcastEvent>(
      type: K,
      handler: (payload: RoomBroadcastMap[K]) => void,
    ): () => void {
      const set = listeners.get(type) ?? new Set<AnyBroadcastHandler>();
      const wrapped = handler as AnyBroadcastHandler;
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
    isSubscribed(): boolean {
      return subscribed;
    },
    onSubscribedChange(handler: SubscribedHandler): () => void {
      subscribedListeners.add(handler);
      return () => {
        subscribedListeners.delete(handler);
      };
    },
    async stop(): Promise<void> {
      unsubscribeEnter();
      unsubscribeLeave();
      cancelRejoinTimer();
      await enqueue(() => leaveRoom());
    },
  };
}
