/**
 * The Player: identity plus Penguin color, read from `public.players` and
 * `auth.users`. See CONTEXT.md for the Player/Penguin distinction.
 */
export interface Player {
  id: string;
  displayName: string;
  penguinColor: string;
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
}

interface DbError {
  message: string;
}

interface PlayersUpsertResult {
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
  ): PromiseLike<PlayersUpsertResult>;
  select(columns: 'id, penguin_color'): PlayersSelectBuilder;
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
    .select('id, penguin_color')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return { player: null, error: error?.message ?? 'Player row not found' };
  }

  return {
    player: { id: data.id, displayName: toDisplayName(user), penguinColor: data.penguin_color },
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
