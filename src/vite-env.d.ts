/// <reference types="vite/client" />

// Raw values are unvalidated; read them through `loadEnv()` in `src/env.ts`.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
