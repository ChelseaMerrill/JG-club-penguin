/// <reference types="vite/client" />

// Raw values are unvalidated; read them through `loadEnv()` in `src/env.ts`.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set by `playwright.config.ts`'s `webServer` only; see `src/game/rooms/dev-room-hook.ts`. */
  readonly VITE_E2E_HOOKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
