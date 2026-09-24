import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const valid = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
};

describe('loadEnv', () => {
  it('returns trimmed values when both vars are valid', () => {
    expect(loadEnv({ ...valid, VITE_SUPABASE_ANON_KEY: ' anon-key \n' })).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
    });
  });

  it('reports every missing var at once', () => {
    expect(() => loadEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: undefined })).toThrow(
      'VITE_SUPABASE_URL is missing; VITE_SUPABASE_ANON_KEY is missing',
    );
  });

  it('rejects a non-http(s) URL', () => {
    expect(() => loadEnv({ ...valid, VITE_SUPABASE_URL: 'example.supabase.co' })).toThrow(
      'VITE_SUPABASE_URL must be an http(s) URL',
    );
  });
});
