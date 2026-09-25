import { loadEnv } from 'vite';

/**
 * Test-only sign-in for e2e specs that need a signed-in Player. Google OAuth
 * can't be automated, so two dedicated Supabase email/password test users
 * stand in for Players. Their credentials live in the gitignored
 * `.env.test.local` (`E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, and the same
 * for `B`). The app itself stays Google-only; nothing here ships in `src/`.
 */

/** A Playwright `storageState` object holding one Supabase session in localStorage. */
export interface StorageState {
  cookies: [];
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

export type TestUser = 'A' | 'B';

export interface TestEnv {
  supabaseUrl: string;
  anonKey: string;
  users: Partial<Record<TestUser, { email: string; password: string }>>;
}

/** Reads `.env`, `.env.test` and `.env.test.local` (Vite's `test` mode). */
export function readTestEnv(): TestEnv {
  const env = loadEnv('test', process.cwd(), '');
  const users: TestEnv['users'] = {};
  for (const user of ['A', 'B'] as const) {
    const email = env[`E2E_USER_${user}_EMAIL`];
    const password = env[`E2E_USER_${user}_PASSWORD`];
    if (email && password) users[user] = { email, password };
  }
  return {
    supabaseUrl: env.VITE_SUPABASE_URL ?? '',
    anonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
    users,
  };
}

/** True when every named test user has credentials and Supabase is configured. */
export function hasTestUsers(...users: TestUser[]): boolean {
  const env = readTestEnv();
  return Boolean(env.supabaseUrl && env.anonKey) && users.every((u) => env.users[u]);
}

/**
 * Signs a test user in with Supabase's password grant and returns a storage
 * state for `origin`, keyed the way supabase-js stores its session
 * (`sb-<project-ref>-auth-token`). A fresh session is minted on every call,
 * so nothing goes stale between runs.
 */
export async function passwordSessionState(user: TestUser, origin: string): Promise<StorageState> {
  const env = readTestEnv();
  const credentials = env.users[user];
  if (!credentials) throw new Error(`E2E_USER_${user}_EMAIL / _PASSWORD missing`);

  const response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) {
    // Never echo the body: it can include the email. The status is enough.
    throw new Error(`test user ${user} sign-in failed: HTTP ${response.status}`);
  }
  const session = (await response.json()) as { expires_in: number; expires_at?: number };
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in;

  const projectRef = new URL(env.supabaseUrl).hostname.split('.')[0];
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          {
            name: `sb-${projectRef}-auth-token`,
            value: JSON.stringify({ ...session, expires_at: expiresAt }),
          },
        ],
      },
    ],
  };
}
