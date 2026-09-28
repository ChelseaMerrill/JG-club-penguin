/**
 * Mirrors `src/penguin/dev-creator-hook.ts`'s `window.__creatorDebug` (#164),
 * redeclared here because that module reads `import.meta.env`, which the
 * `e2e` tsconfig doesn't type-check. The two declarations must stay
 * identical: TypeScript requires every `Window` augmentation of the same
 * property to resolve to the same type. `withDevLoadFailures` sets it only
 * under `?creator&failLoads=<n>`, with the Penguin editor's own `loadAll`
 * and `saveLook` call counts.
 */
export interface CreatorDebugInfo {
  readonly loadAllCalls: number;
  readonly saveLookCalls: number;
}

declare global {
  interface Window {
    /** Test-only (#164): the Penguin editor's own store call counts. */
    __creatorDebug?: { readonly loadAllCalls: number; readonly saveLookCalls: number };
  }
}
