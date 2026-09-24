// Minimal ambient types for `opentype.js` (#62 review fix 5), scoped to
// exactly what `penguin-text-to-paths.ts` uses. opentype.js 2.x ships no
// `types` field and no `.d.ts` of its own (`node_modules/opentype.js`'s
// `package.json` has no `types`/`typings` key), and the community
// `@types/opentype.js` package types `Glyph.advanceWidth` as
// `number | undefined`, which doesn't match this script's actual usage
// (every glyph parsed off a real font always has a numeric advance width)
// and fails `npm run typecheck`. A small local shim avoids depending on a
// full third-party type package for three calls.
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
