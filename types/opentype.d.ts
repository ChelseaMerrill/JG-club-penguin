// Minimal ambient types for `opentype.js` (#62 review fix 5), scoped to
// exactly what `penguin-text-to-paths.ts` and `wall-text.test.ts` use.
// opentype.js 2.x ships no `types` field and no `.d.ts` of its own
// (`node_modules/opentype.js`'s `package.json` has no `types`/`typings`
// key), and the community `@types/opentype.js` package types
// `Glyph.advanceWidth` as `number | undefined`, which doesn't match either
// consumer's actual usage (every glyph parsed off a real font always has a
// numeric advance width) and fails `npm run typecheck`. A small local shim
// avoids depending on a full third-party type package for a handful of
// calls.
//
// Single-sourced here (#77 review round 1 nit 11) rather than duplicated
// under `scripts/` and `src/ui/wall-text/`: both `tsconfig.json` (`src`) and
// `tsconfig.node.json` (`e2e`, `scripts`, tooling configs) add `types` to
// their own `include`, so this one file is part of both TypeScript programs.
declare module 'opentype.js' {
  export interface Glyph {
    advanceWidth: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }

  export interface Font {
    unitsPerEm: number;
    charToGlyph(char: string): Glyph;
  }

  export class Path {
    commands: unknown[];
    toPathData(decimalPlaces?: number): string;
  }

  export function parse(buffer: ArrayBuffer): Font;
}
