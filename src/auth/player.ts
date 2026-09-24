import { parseAppearance, type PenguinAppearance } from '../penguin/appearance';

/**
 * The Player: identity plus their Penguin, read from `public.players` and
 * `auth.users`. See CONTEXT.md for the Player/Penguin distinction.
 */
export interface Player {
  id: string;
  /** The Google account name; the Penguin's own name lives on `penguin`. */
  displayName: string;
  /** Always equal to `penguin.body` once a Penguin is saved. */
  penguinColor: string;
  /** Null until the Player first saves a Penguin in the creator. */
  penguin: PenguinAppearance | null;
}

/** The subset of a Supabase auth user that a Player is derived from. */
export interface AuthUserLike {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface PlayerRow {
  id: string;
  penguin_color: string;
  penguin: unknown;
}

/** The narrow error shape returned by every supabase-js call this app uses. */
export interface DbError {
  message: string;
}

interface PlayersWriteResult {
  error: DbError | null;
}

interface PlayersSelectSingleResult {
  data: PlayerRow | null;
  error: DbError | null;
}

interface PlayersSelectBuilder {
  eq(column: 'id', value: string): { single(): PromiseLike<PlayersSelectSingleResult> };
}

interface PlayersTable {
  upsert(
    values: { id: string },
    options: { onConflict: 'id'; ignoreDuplicates: true },
  ): PromiseLike<PlayersWriteResult>;
  select(columns: 'id, penguin_color, penguin'): PlayersSelectBuilder;
  update(values: { penguin: PenguinAppearance; penguin_color: string }): {
    eq(column: 'id', value: string): PromiseLike<PlayersWriteResult>;
  };
}

/** The narrow slice of a Supabase client that Player loading needs. */
export interface PlayersClient {
  from(table: 'players'): PlayersTable;
}

export interface PlayerResult {
  player: Player | null;
  error: string | null;
}

function toDisplayName(user: AuthUserLike): string {
  return user.user_metadata?.full_name ?? user.email ?? '';
}

/** Reads the caller's own `players` row. Does not create it. */
export async function loadPlayer(client: PlayersClient, user: AuthUserLike): Promise<PlayerResult> {
  const { data, error } = await client
    .from('players')
    .select('id, penguin_color, penguin')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return { player: null, error: error?.message ?? 'Player row not found' };
  }

  return {
    player: {
      id: data.id,
      displayName: toDisplayName(user),
      penguinColor: data.penguin_color,
      penguin: parseAppearance(data.penguin),
    },
    error: null,
  };
}

/**
 * First-sign-in-safe: inserts the caller's row if it doesn't exist yet
 * (default color, never overwriting one that's already there), then loads it.
 */
export async function ensurePlayer(
  client: PlayersClient,
  user: AuthUserLike,
): Promise<PlayerResult> {
  const { error } = await client
    .from('players')
    .upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    return { player: null, error: error.message };
  }

  return loadPlayer(client, user);
}

/**
 * Saves the caller's Penguin. `penguin_color` is written alongside so it
 * always mirrors the body color (a DB check enforces this): in-world tinting
 * and Presence keep reading `penguin_color`.
 */
export async function savePenguin(
  client: PlayersClient,
  playerId: string,
  penguin: PenguinAppearance,
): Promise<{ error: string | null }> {
  const { error } = await client
    .from('players')
    .update({ penguin, penguin_color: penguin.body })
    .eq('id', playerId);
  return { error: error?.message ?? null };
}

/** A registry narrow enough for `game.registry` (Phaser's `DataManager`). */
export interface PlayerRegistry {
  set(key: 'player', value: Player): unknown;
  remove(key: 'player'): unknown;
}

const PLAYER_KEY = 'player';

/** Pure: puts or removes the signed-in Player under `registry.player`. */
export function bindPlayer(registry: PlayerRegistry, player: Player | null): void {
  if (player) {
    registry.set(PLAYER_KEY, player);
  } else {
    registry.remove(PLAYER_KEY);
  }
}
