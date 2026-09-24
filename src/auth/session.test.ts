import { describe, expect, it, vi } from 'vitest';
import {
  startAuth,
  type AuthClient,
  type AuthEvent,
  type AuthSessionLike,
  type AuthStateChangeCallback,
} from './session';

interface FakeRow {
  id: string;
  penguin_color: string;
}

function createFakeClient(row: FakeRow | null = { id: 'user-1', penguin_color: '#00bdff' }): {
  client: AuthClient;
  emit: (event: AuthEvent, session: AuthSessionLike | null) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  signInWithOAuth: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
} {
  let listener: AuthStateChangeCallback = () => {};
  const unsubscribe = vi.fn();
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const single = vi
    .fn()
    .mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });

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
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startAuth', () => {
  it('restores an existing session and reports the stored color', async () => {
    const { client, emit } = createFakeClient({ id: 'user-1', penguin_color: '#ff0000' });
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
    const { client, emit, upsert } = createFakeClient({ id: 'user-1', penguin_color: '#00bdff' });
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError: vi.fn() });

    emit('SIGNED_IN', { user });
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
    const { client, emit } = createFakeClient(null);
    const onError = vi.fn();
    const onSignedIn = vi.fn();
    startAuth({ client, onSignedIn, onSignedOut: vi.fn(), onError });

    emit('SIGNED_IN', { user });
    await flush();

    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('not found');
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

  it('signOut calls auth.signOut with local scope and lets SIGNED_OUT drive onSignedOut', async () => {
    const { client, signOut, emit } = createFakeClient();
    const onSignedOut = vi.fn();
    const controller = startAuth({ client, onSignedIn: vi.fn(), onSignedOut, onError: vi.fn() });

    await controller.signOut();

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(onSignedOut).not.toHaveBeenCalled();

    emit('SIGNED_OUT', null);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
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
