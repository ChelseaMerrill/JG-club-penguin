export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

type RawEnv = Pick<ImportMetaEnv, 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'>;

/** Validates the client env once at startup; throws listing every problem. */
export function loadEnv(raw: RawEnv = import.meta.env): AppEnv {
  const problems: string[] = [];
  const supabaseUrl = raw.VITE_SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = raw.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!supabaseUrl) {
    problems.push('VITE_SUPABASE_URL is missing');
  } else if (!isHttpUrl(supabaseUrl)) {
    problems.push('VITE_SUPABASE_URL must be an http(s) URL');
  }
  if (!supabaseAnonKey) problems.push('VITE_SUPABASE_ANON_KEY is missing');

  if (problems.length > 0) {
    throw new Error(`Invalid environment (see .env.example): ${problems.join('; ')}`);
  }
  return { supabaseUrl, supabaseAnonKey };
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
