import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensurePlayer,
  type AuthUserLike,
  type DbError,
  type Player,
  type PlayersClient,
} from './player';

/**
 * The events `startAuth` acts on. Supabase also emits `TOKEN_REFRESHED`,
 * `USER_UPDATED`, `PASSWORD_RECOVERY` and `MFA_CHALLENGE_VERIFIED`; those are
 * ignored here (verified against the supabase-js v2 docs,
 * https://supabase.com/docs/reference/javascript/auth-onauthstatechange,
 * supabase-js 2.117.1).
 */
export type AuthEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | 'MFA_CHALLENGE_VERIFIED';

export interface AuthSessionLike {
  user: AuthUserLike;
}

export type AuthStateChangeCallback = (event: AuthEvent, session: AuthSessionLike | null) => void;

interface AuthSubscription {
  unsubscribe(): void;
}

/** The narrow slice of a Supabase client that `startAuth` needs. */
export interface AuthClient extends PlayersClient {
  auth: {
    onAuthStateChange(callback: AuthStateChangeCallback): {
      data: { subscription: AuthSubscription };
    };
    signInWithOAuth(params: {
      provider: 'google';
      options: { redirectTo: string };
    }): PromiseLike<{ error: DbError | null }>;
    signOut(params: { scope: 'local' }): PromiseLike<{ error: DbError | null }>;
  };
}

export interface StartAuthOptions {
  client: AuthClient;
  onSignedIn: (player: Player) => void;
  onSignedOut: () => void;
  onError: (message: string) => void;
}

export interface AuthController {
  signIn(redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  stop(): void;
}

const RELEVANT_EVENTS: ReadonlySet<AuthEvent> = new Set([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'SIGNED_OUT',
]);

/** Local view of whether the app has ever announced a signed-in Player. */
type LocalAuthState = 'unknown' | 'signed-in' | 'signed-out';

/**
 * Drives Player sign-in/out purely from `onAuthStateChange`. De-duplicates by
 * user id (a PKCE redirect can emit `INITIAL_SESSION` and `SIGNED_IN` for the
 * same user) and defers the DB call with `setTimeout(0)` so it never runs
 * inside the Supabase auth callback (the documented deadlock hazard).
 *
 * A `generation` counter guards against stale results: if a `SIGNED_OUT`
 * arrives, or a different user signs in, while an `ensurePlayer` load is
 * still in flight, that load's result is dropped when it resolves. Only the
 * load started by the most recent event may call `onSignedIn` or `onError`.
 */
export function startAuth(options: StartAuthOptions): AuthController {
  const { client, onSignedIn, onSignedOut, onError } = options;
  let currentUserId: string | null = null;
  let localState: LocalAuthState = 'unknown';
  let generation = 0;

  function markSignedOut(): void {
    generation += 1;
    currentUserId = null;
    if (localState !== 'signed-out') {
      localState = 'signed-out';
      onSignedOut();
    }
  }

  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (!RELEVANT_EVENTS.has(event)) {
      return;
    }

    if (event === 'SIGNED_OUT') {
      markSignedOut();
      return;
    }

    const user = session?.user ?? null;
    if (!user) {
      markSignedOut();
      return;
    }

    if (user.id === currentUserId) {
      return;
    }
    currentUserId = user.id;
    const loadGeneration = (generation += 1);

    setTimeout(() => {
      void ensurePlayer(client, user).then(({ player, error }) => {
        if (loadGeneration !== generation) {
          // Superseded by a later SIGNED_OUT or a different user signing in;
          // this result is stale and must not drive the UI.
          return;
        }
        if (error || !player) {
          // Reset the dedupe key so a later SIGNED_IN/INITIAL_SESSION for the
          // same user retries instead of being silently ignored.
          currentUserId = null;
          onError(error ?? 'Unable to load player');
          return;
        }
        localState = 'signed-in';
        onSignedIn(player);
      });
    }, 0);
  });

  return {
    async signIn(redirectTo: string) {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) onError(error.message);
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) onError(error.message);
    },
    stop() {
      data.subscription.unsubscribe();
    },
  };
}

/**
 * Adapts the real (heavily generic) `SupabaseClient` to the narrow
 * `AuthClient` interface, one call at a time. Assigning the raw client
 * directly where `AuthClient` is expected trips TS2589 ("Type instantiation
 * is excessively deep") against its generic `from()` overloads; wrapping
 * each call keeps every checked type small and concrete.
 */
export function toAuthClient(client: SupabaseClient): AuthClient {
  return {
    auth: {
      onAuthStateChange: (callback) =>
        client.auth.onAuthStateChange((event, session) => callback(event as AuthEvent, session)),
      signInWithOAuth: (params) => client.auth.signInWithOAuth(params),
      signOut: (params) => client.auth.signOut(params),
    },
    from: () => {
      const table = client.from('players');
      return {
        upsert: (values, options) => table.upsert(values, options),
        select: (columns) => {
          const selected = table.select(columns);
          return {
            eq: (column, value) => {
              const filtered = selected.eq(column, value);
              return { single: () => filtered.single() };
            },
          };
        },
      };
    },
  };
}
