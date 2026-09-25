/**
 * Test-only chat visibility hook (#44), gated exactly like `window.__roomDebug`
 * (`src/game/rooms/dev-room-hook.ts`): a direct `import.meta.env.*` read, so
 * Vite's static replacement turns this into literal `false` (and the
 * minifier strips the body) in a real (Vercel) production build.
 */
const HOOKS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true';

/** Every bubble currently shown, keyed by the Player id it's shown above. */
export type ChatDebugInfo = Record<string, string>;

declare global {
  interface Window {
    __chatDebug?: ChatDebugInfo;
  }
}

/** Publishes the current chat bubble snapshot to `window.__chatDebug`, only when `HOOKS_ENABLED`. */
export function exposeChatDebug(bubbles: ChatDebugInfo): void {
  if (!HOOKS_ENABLED) {
    return;
  }
  window.__chatDebug = bubbles;
}
