import type { SupabaseClient } from '@supabase/supabase-js';
import { ensurePlayer, type AuthUserLike, type Player, type PlayersClient } from './player';

/**
 * The events `startAuth` acts on. Supabase also emits `TOKEN_REFRESHED`,
 * `USER_UPDATED`, `PASSWORD_RECOVERY` and `MFA_CHALLENGE_VERIFIED`; those are
 * ignored here (verified against the supabase-js v2 docs, see the PR notes).
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

interface DbError {
  message: string;
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

/**
 * Drives Player sign-in/out purely from `onAuthStateChange`. De-duplicates by
 * user id (a PKCE redirect can emit `INITIAL_SESSION` and `SIGNED_IN` for the
 * same user) and defers the DB call with `setTimeout(0)` so it never runs
 * inside the Supabase auth callback (the documented deadlock hazard).
 */
export function startAuth(options: StartAuthOptions): AuthController {
  const { client, onSignedIn, onSignedOut, onError } = options;
  let lastUserId: string | null = null;

  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (!RELEVANT_EVENTS.has(event)) {
      return;
    }

    if (event === 'SIGNED_OUT') {
      lastUserId = null;
      onSignedOut();
      return;
    }

    const user = session?.user ?? null;
    if (!user) {
      lastUserId = null;
      onSignedOut();
      return;
    }

    if (user.id === lastUserId) {
      return;
    }
    lastUserId = user.id;

    setTimeout(() => {
      void ensurePlayer(client, user).then(({ player, error }) => {
        if (error || !player) {
          onError(error ?? 'Unable to load player');
          return;
        }
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
