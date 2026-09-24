import { describe, expect, it, vi } from 'vitest';
import {
  startAuth,
  type AuthClient,
  type AuthEvent,
  type AuthSessionLike,
  type AuthStateChangeCallback,
} from './auth-session';

interface FakeRow {
  id: string;
  penguin_color: string;
}

interface FakeClientOptions {
  /** Maps user id -> stored `players` row (or `null` for "not found"). */
  rows?: Record<string, FakeRow | null>;
  signInError?: { message: string } | null;
  signOutError?: { message: string } | null;
}

function createFakeClient(options: FakeClientOptions = {}): {
  client: AuthClient;
  emit: (event: AuthEvent, session: AuthSessionLike | null) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  signInWithOAuth: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
} {
  const rows = options.rows ?? { 'user-1': { id: 'user-1', penguin_color: '#00bdff' } };
  let listener: AuthStateChangeCallback = () => {};
  const unsubscribe = vi.fn();
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn((_column: 'id', value: string) => ({
    single: () => {
      const row = rows[value] ?? null;
      return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } });
    },
  }));
  const select = vi.fn().mockReturnValue({ eq });
  const signInWithOAuth = vi.fn().mockResolvedValue({ error: options.signInError ?? null });
  const signOut = vi.fn(async () => {
    if (options.signOutError) {
      return { error: options.signOutError };
    }
    // Mirrors the real client: a successful signOut() itself emits SIGNED_OUT
    // through onAuthStateChange, rather than the caller driving state directly.
    listener('SIGNED_OUT', null);
    return { error: null };
  });

  const client: AuthClient = {
    from: () => ({ upsert, select }) as never,
    auth: {
      onAuthStateChange: (callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      },
      signInWithOAuth,
      signOut,
    },
  };

  return {
    client,
    emit: (event, session) => listener(event, session),
    unsubscribe,
    upsert,
    signInWithOAuth,
    signOut,
  };
}

const user = {
  id: 'user-1',
  email: 'ada@example.com',
  user_metadata: { full_name: 'Ada Lovelace' },
};
const userA = { id: 'user-a', email: 'a@example.com', user_metadata: { full_name: 'Player A' } };
const userB = { id: 'user-b', email: 'b@example.com', user_metadata: { full_name: 'Player B' } };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startAuth', () => {
  it('restores an existing session and reports the stored color', async () => {
    const { client, emit } = createFakeClient({
      rows: { 'user-1': { id: 'user-1', penguin_color: '#ff0000' } },
    });
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError: vi.fn() });

    emit('INITIAL_SESSION', { user });
    await flush();

    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onSignedIn).toHaveBeenCalledWith({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      penguinColor: '#ff0000',
    });
  });

  it('on first sign-in, upserts with ignoreDuplicates (never a penguin_color) then loads the default color', async () => {
    const { client, emit, upsert } = createFakeClient();
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError: vi.fn() });

    emit('SIGNED_IN', { user });

    // The DB call is deferred with setTimeout(0), never run synchronously
    // inside the onAuthStateChange callback (the documented deadlock hazard).
    expect(upsert).not.toHaveBeenCalled();

    await flush();

    expect(upsert).toHaveBeenCalledWith(
      { id: 'user-1' },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    expect(onSignedIn).toHaveBeenCalledWith({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      penguinColor: '#00bdff',
    });
  });

  it('runs onSignedOut exactly once when SIGNED_OUT fires', async () => {
    const { client, emit } = createFakeClient();
    const onSignedOut = vi.fn();
    startAuth({ client, onSignedIn: vi.fn(), onSignedOut, onError: vi.fn() });

    emit('SIGNED_OUT', null);
    await flush();

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('reports onSignedOut when there is no session to restore', async () => {
    const { client, emit } = createFakeClient();
    const onSignedOut = vi.fn();
    startAuth({ client, onSignedIn: vi.fn(), onSignedOut, onError: vi.fn() });

    emit('INITIAL_SESSION', null);
    await flush();

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('fires onSignedOut once even when a null INITIAL_SESSION is followed by SIGNED_OUT', async () => {
    const { client, emit } = createFakeClient();
    const onSignedOut = vi.fn();
    startAuth({ client, onSignedIn: vi.fn(), onSignedOut, onError: vi.fn() });

    emit('INITIAL_SESSION', null);
    await flush();
    emit('SIGNED_OUT', null);
    await flush();

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('does not fire onSignedOut again for a repeated SIGNED_OUT', async () => {
    const { client, emit } = createFakeClient();
    const onSignedOut = vi.fn();
    startAuth({ client, onSignedIn: vi.fn(), onSignedOut, onError: vi.fn() });

    emit('SIGNED_OUT', null);
    await flush();
    emit('SIGNED_OUT', null);
    await flush();

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('de-duplicates a PKCE redirect emitting INITIAL_SESSION then SIGNED_IN for the same user', async () => {
    const { client, emit, upsert } = createFakeClient();
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError: vi.fn() });

    emit('INITIAL_SESSION', { user });
    await flush();
    emit('SIGNED_IN', { user });
    await flush();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('ignores TOKEN_REFRESHED', async () => {
    const { client, emit, upsert } = createFakeClient();
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError: vi.fn() });

    emit('TOKEN_REFRESHED', { user });
    await flush();

    expect(upsert).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('routes a failed player load to onError instead of throwing', async () => {
    const { client, emit } = createFakeClient({ rows: { 'user-1': null } });
    const onError = vi.fn();
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError });

    emit('SIGNED_IN', { user });
    await flush();

    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('not found');
  });

  it('drops a stale player load when SIGNED_OUT arrives before it resolves', async () => {
    const { client, emit } = createFakeClient();
    const onSignedIn = vi.fn();
    const onSignedOut = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut, onError: vi.fn() });

    emit('SIGNED_IN', { user });
    emit('SIGNED_OUT', null);
    await flush();

    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('binds only the latest user when a second user signs in before the first load resolves', async () => {
    const { client, emit, upsert } = createFakeClient({
      rows: {
        'user-a': { id: 'user-a', penguin_color: '#111111' },
        'user-b': { id: 'user-b', penguin_color: '#222222' },
      },
    });
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError: vi.fn() });

    emit('SIGNED_IN', { user: userA });
    emit('SIGNED_IN', { user: userB });
    await flush();

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onSignedIn).toHaveBeenCalledWith({
      id: 'user-b',
      displayName: 'Player B',
      penguinColor: '#222222',
    });
  });

  it('retries a failed load on a later sign-in for the same user', async () => {
    const rows: Record<string, FakeRow | null> = { 'user-1': null };
    const { client, emit, upsert } = createFakeClient({ rows });
    const onError = vi.fn();
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError });

    emit('SIGNED_IN', { user });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSignedIn).not.toHaveBeenCalled();

    rows['user-1'] = { id: 'user-1', penguin_color: '#00bdff' };
    emit('SIGNED_IN', { user });
    await flush();

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(onSignedIn).toHaveBeenCalledWith({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      penguinColor: '#00bdff',
    });
  });

  it('signIn calls signInWithOAuth with the google provider and the given redirect', async () => {
    const { client, signInWithOAuth } = createFakeClient();
    const controller = startAuth({
      client,
      onSignedIn: vi.fn(),
      onSignedOut: vi.fn(),
      onError: vi.fn(),
    });

    await controller.signIn('https://example.test/');

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://example.test/' },
    });
  });

  it('signIn calls onError when signInWithOAuth returns an error', async () => {
    const { client } = createFakeClient({ signInError: { message: 'oauth failed' } });
    const onError = vi.fn();
    const controller = startAuth({
      client,
      onSignedIn: vi.fn(),
      onSignedOut: vi.fn(),
      onError,
    });

    await controller.signIn('https://example.test/');

    expect(onError).toHaveBeenCalledWith('oauth failed');
  });

  it('signOut calls auth.signOut with local scope and gets onSignedOut from the emitted SIGNED_OUT event', async () => {
    const { client, signOut } = createFakeClient();
    const onSignedOut = vi.fn();
    const controller = startAuth({ client, onSignedIn: vi.fn(), onSignedOut, onError: vi.fn() });

    await controller.signOut();

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('signOut calls onError when auth.signOut returns an error', async () => {
    const { client } = createFakeClient({ signOutError: { message: 'sign-out failed' } });
    const onError = vi.fn();
    const onSignedOut = vi.fn();
    const controller = startAuth({ client, onSignedIn: vi.fn(), onSignedOut, onError });

    await controller.signOut();

    expect(onError).toHaveBeenCalledWith('sign-out failed');
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('stop unsubscribes from auth state changes', () => {
    const { client, unsubscribe } = createFakeClient();
    const controller = startAuth({
      client,
      onSignedIn: vi.fn(),
      onSignedOut: vi.fn(),
      onError: vi.fn(),
    });

    controller.stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
