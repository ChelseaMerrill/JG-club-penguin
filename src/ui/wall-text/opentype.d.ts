// Minimal ambient types for `opentype.js` (#77), scoped to exactly what
// `wall-text.test.ts` uses. Mirrors `scripts/opentype.d.ts` (#62 review fix
// 5's own reasoning: opentype.js 2.x ships no `types` field and no `.d.ts` of
// its own, and the community `@types/opentype.js` package types
// `Glyph.advanceWidth` as `number | undefined`, which doesn't match this
// test's actual usage). That shim lives under `scripts/`, covered by
// `tsconfig.node.json`; this one is needed separately because
// `wall-text.test.ts` lives under `src/`, covered by `tsconfig.json`, whose
// `include` doesn't reach `scripts/`.
declare module 'opentype.js' {
  export interface Glyph {
    advanceWidth: number;
  }

  export interface Font {
    unitsPerEm: number;
    charToGlyph(char: string): Glyph;
  }

  export function parse(buffer: ArrayBuffer): Font;
}
