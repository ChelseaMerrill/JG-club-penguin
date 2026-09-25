/**
 * A small, Phaser-free reader for the Room designs' own CSS animations
 * (#113): the `@keyframes` rule and the `animation:` shorthand are copied
 * verbatim out of a `design/*.dc.html` file (design content as data), then
 * compiled once and sampled every frame into a 2D affine transform.
 *
 * It reproduces the parts of CSS Animations the NPC motions use: percent
 * (and `from`/`to`) stops, shared `a%,b%` stops (a hold), a missing 0%/100%
 * stop defaulting to no transform, the timing function applied per keyframe
 * segment (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`,
 * `cubic-bezier()`), a (usually negative) `animation-delay`, infinite
 * looping, `transform-origin`, and CSS's transform-list interpolation
 * (function by function when both stops use the same functions in the same
 * order, otherwise via a translate/rotate/scale decomposition).
 * `translate`/`translateX`/`translateY`, `rotate` and `scale`/`scaleX`/
 * `scaleY` are supported; anything else (a `skew`, a `steps()` timing
 * function, `alternate` direction, the individual `rotate:` property)
 * throws, so a port that needs more fails loudly instead of silently
 * drifting from the design.
 */

export interface Point {
  x: number;
  y: number;
}

/** `x' = a*x + c*y + e`, `y' = b*x + d*y + f` (the SVG/CSS `matrix(a,b,c,d,e,f)` order). */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** A design animation, copied verbatim from its `.dc.html`. */
export interface CssAnimationSource {
  /** The whole `@keyframes name { ... }` rule. */
  keyframes: string;
  /** The `animation:` shorthand value, e.g. `gallop .45s ease-in-out infinite`. */
  animation: string;
  /**
   * The element's `transform-origin`, e.g. `60px 120px` (the design's figure
   * viewBox units for an in-place motion). Defaults to `0 0`, which is also
   * what a pure-translate path needs.
   */
  transformOrigin?: string;
}

type TransformFn =
  | { kind: 'translate'; x: number; y: number }
  | { kind: 'rotate'; deg: number }
  | { kind: 'scale'; x: number; y: number };

interface Stop {
  offset: number;
  fns: TransformFn[];
}

export interface CompiledCssAnimation {
  name: string;
  durationMs: number;
  delayMs: number;
  origin: Point;
  easing: (t: number) => number;
  stops: Stop[];
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiplyAffine(m: Affine, n: Affine): Affine {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function transformPoint(m: Affine, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

function translation(x: number, y: number): Affine {
  return { ...IDENTITY, e: x, f: y };
}

/**
 * Splits `m` into the translate, rotation (radians) and scale a Phaser
 * game object can carry (`x`, `y`, `rotation`, `scaleX`, `scaleY`), in
 * that object's parent space. Exact for every translate/rotate/scale
 * composition the supported CSS functions can produce without skew.
 */
export function decomposeAffine(m: Affine): {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
} {
  const scaleX = Math.hypot(m.a, m.b);
  const rotation = Math.atan2(m.b, m.a);
  const scaleY = scaleX === 0 ? 0 : (m.a * m.d - m.b * m.c) / scaleX;
  return { x: m.e, y: m.f, rotation, scaleX, scaleY };
}

// --- Timing functions -------------------------------------------------------

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const sample = (a1: number, a2: number, t: number): number =>
    3 * a1 * t * (1 - t) ** 2 + 3 * a2 * t ** 2 * (1 - t) + t ** 3;
  const slope = (a1: number, a2: number, t: number): number =>
    3 * a1 * (1 - t) ** 2 + 6 * (a2 - a1) * t * (1 - t) + 3 * (1 - a2) * t ** 2;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton-Raphson on x(t) = x, falling back to bisection.
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sample(x1, x2, t) - x;
      if (Math.abs(error) < 1e-7) return sample(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i += 1) {
      const value = sample(x1, x2, t);
      if (Math.abs(value - x) < 1e-7) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sample(y1, y2, t);
  };
}

const NAMED_EASINGS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

function easingFor(token: string): ((t: number) => number) | null {
  if (token === 'linear') return (t) => t;
  const named = NAMED_EASINGS[token];
  if (named) return cubicBezier(...named);
  const bezier = /^cubic-bezier\(([^)]*)\)$/.exec(token);
  if (bezier) {
    const [x1, y1, x2, y2] = bezier[1].split(',').map((part) => Number(part.trim()));
    return cubicBezier(x1, y1, x2, y2);
  }
  return null;
}

// --- Parsing ----------------------------------------------------------------

function parseTime(token: string): number | null {
  const match = /^(-?\d*\.?\d+)(ms|s)$/.exec(token);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] === 's' ? value * 1000 : value;
}

function parseLength(token: string): number {
  const match = /^(-?\d*\.?\d+(?:e-?\d+)?)(px)?$/i.exec(token.trim());
  if (!match) throw new Error(`css-keyframes: unsupported length "${token}"`);
  return Number(match[1]);
}

function parseAngle(token: string): number {
  const match = /^(-?\d*\.?\d+(?:e-?\d+)?)(deg|rad|turn)?$/.exec(token.trim());
  if (!match) throw new Error(`css-keyframes: unsupported angle "${token}"`);
  const value = Number(match[1]);
  if (match[2] === 'rad') return (value * 180) / Math.PI;
  if (match[2] === 'turn') return value * 360;
  return value;
}

function parseTransform(value: string): TransformFn[] {
  const trimmed = value.trim();
  if (trimmed === 'none') return [];
  const fns: TransformFn[] = [];
  const re = /([a-zA-Z]+)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed))) {
    const name = match[1];
    const args = match[2].split(/[\s,]+/).filter(Boolean);
    switch (name) {
      case 'translate':
        fns.push({
          kind: 'translate',
          x: parseLength(args[0]),
          y: args[1] ? parseLength(args[1]) : 0,
        });
        break;
      case 'translateX':
        fns.push({ kind: 'translate', x: parseLength(args[0]), y: 0 });
        break;
      case 'translateY':
        fns.push({ kind: 'translate', x: 0, y: parseLength(args[0]) });
        break;
      case 'rotate':
        fns.push({ kind: 'rotate', deg: parseAngle(args[0]) });
        break;
      case 'scale': {
        const sx = Number(args[0]);
        fns.push({ kind: 'scale', x: sx, y: args[1] ? Number(args[1]) : sx });
        break;
      }
      case 'scaleX':
        fns.push({ kind: 'scale', x: Number(args[0]), y: 1 });
        break;
      case 'scaleY':
        fns.push({ kind: 'scale', x: 1, y: Number(args[0]) });
        break;
      default:
        throw new Error(`css-keyframes: unsupported transform function "${name}()"`);
    }
  }
  return fns;
}

function parseKeyframes(rule: string): { name: string; stops: Stop[] } {
  const header = /@keyframes\s+([\w-]+)\s*\{/.exec(rule);
  if (!header) throw new Error('css-keyframes: expected an "@keyframes name { ... }" rule');
  const body = rule.slice(header.index + header[0].length, rule.lastIndexOf('}'));
  const stops: Stop[] = [];
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(body))) {
    let transform: TransformFn[] | null = null;
    for (const declaration of block[2].split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1);
      if (property === 'transform') transform = parseTransform(value);
      else if (property === 'rotate' || property === 'translate' || property === 'scale') {
        throw new Error(`css-keyframes: unsupported individual "${property}:" property`);
      }
      // Anything else (opacity, filter, ...) isn't a motion; ignored.
    }
    if (!transform) continue;
    for (const selector of block[1].split(',')) {
      const s = selector.trim();
      const offset = s === 'from' ? 0 : s === 'to' ? 1 : Number(s.replace('%', '')) / 100;
      if (!Number.isFinite(offset)) throw new Error(`css-keyframes: bad keyframe selector "${s}"`);
      stops.push({ offset, fns: transform });
    }
  }
  stops.sort((p, q) => p.offset - q.offset);
  // CSS: a missing 0%/100% stop uses the element's own (untransformed) value.
  if (stops[0]?.offset !== 0) stops.unshift({ offset: 0, fns: [] });
  if (stops[stops.length - 1].offset !== 1) stops.push({ offset: 1, fns: [] });
  return { name: header[1], stops };
}

function parseAnimation(shorthand: string): {
  name: string;
  durationMs: number;
  delayMs: number;
  easing: (t: number) => number;
} {
  const tokens = shorthand.trim().match(/[\w-]+\([^)]*\)|\S+/g) ?? [];
  const times: number[] = [];
  let easing: ((t: number) => number) | null = null;
  let name: string | null = null;
  for (const token of tokens) {
    const time = parseTime(token);
    if (time !== null) {
      times.push(time);
      continue;
    }
    const tokenEasing = easingFor(token);
    if (tokenEasing) {
      easing = tokenEasing;
      continue;
    }
    if (token === 'infinite' || token === 'normal' || /^\d+$/.test(token)) continue;
    if (
      ['alternate', 'reverse', 'alternate-reverse'].includes(token) ||
      token.startsWith('steps')
    ) {
      throw new Error(`css-keyframes: unsupported animation value "${token}"`);
    }
    if (['forwards', 'backwards', 'both', 'none', 'running', 'paused'].includes(token)) continue;
    name ??= token;
  }
  if (!name || times.length === 0 || times[0] <= 0) {
    throw new Error(`css-keyframes: can't read animation shorthand "${shorthand}"`);
  }
  return {
    name,
    durationMs: times[0],
    delayMs: times[1] ?? 0,
    easing: easing ?? easingFor('ease')!,
  };
}

function parseOrigin(origin: string | undefined): Point {
  if (!origin) return { x: 0, y: 0 };
  const [x, y] = origin.trim().split(/\s+/);
  return { x: parseLength(x), y: y ? parseLength(y) : 0 };
}

/** Parses a design animation once; `sampleCssAnimation` then reads it every frame. */
export function compileCssAnimation(source: CssAnimationSource): CompiledCssAnimation {
  const keyframes = parseKeyframes(source.keyframes);
  const animation = parseAnimation(source.animation);
  if (animation.name !== keyframes.name) {
    throw new Error(
      `css-keyframes: animation "${animation.name}" doesn't name @keyframes "${keyframes.name}"`,
    );
  }
  return {
    name: keyframes.name,
    durationMs: animation.durationMs,
    delayMs: animation.delayMs,
    origin: parseOrigin(source.transformOrigin),
    easing: animation.easing,
    stops: keyframes.stops,
  };
}

// --- Sampling ---------------------------------------------------------------

function fnToAffine(fn: TransformFn): Affine {
  if (fn.kind === 'translate') return translation(fn.x, fn.y);
  if (fn.kind === 'scale') return { ...IDENTITY, a: fn.x, d: fn.y };
  const rad = (fn.deg * Math.PI) / 180;
  return { a: Math.cos(rad), b: Math.sin(rad), c: -Math.sin(rad), d: Math.cos(rad), e: 0, f: 0 };
}

function composeFns(fns: readonly TransformFn[]): Affine {
  return fns.reduce((m, fn) => multiplyAffine(m, fnToAffine(fn)), IDENTITY);
}

function identityLike(fn: TransformFn): TransformFn {
  if (fn.kind === 'translate') return { kind: 'translate', x: 0, y: 0 };
  if (fn.kind === 'scale') return { kind: 'scale', x: 1, y: 1 };
  return { kind: 'rotate', deg: 0 };
}

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

function interpolateFns(from: TransformFn[], to: TransformFn[], t: number): Affine {
  const length = Math.max(from.length, to.length);
  const a = [...from];
  const b = [...to];
  while (a.length < length) a.push(identityLike(b[a.length]));
  while (b.length < length) b.push(identityLike(a[b.length]));

  if (a.every((fn, i) => fn.kind === b[i].kind)) {
    return composeFns(
      a.map((fn, i): TransformFn => {
        const other = b[i];
        if (fn.kind === 'rotate' && other.kind === 'rotate') {
          return { kind: 'rotate', deg: lerp(fn.deg, other.deg, t) };
        }
        if (fn.kind === 'translate' && other.kind === 'translate') {
          return { kind: 'translate', x: lerp(fn.x, other.x, t), y: lerp(fn.y, other.y, t) };
        }
        if (fn.kind === 'scale' && other.kind === 'scale') {
          return { kind: 'scale', x: lerp(fn.x, other.x, t), y: lerp(fn.y, other.y, t) };
        }
        return fn;
      }),
    );
  }

  // Mismatched function lists: CSS falls back to interpolating decomposed
  // matrices; a translate/rotate/scale decomposition matches it for these.
  const p = decomposeAffine(composeFns(a));
  const q = decomposeAffine(composeFns(b));
  return composeFns([
    { kind: 'translate', x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) },
    { kind: 'rotate', deg: (lerp(p.rotation, q.rotation, t) * 180) / Math.PI },
    { kind: 'scale', x: lerp(p.scaleX, q.scaleX, t), y: lerp(p.scaleY, q.scaleY, t) },
  ]);
}

/**
 * The animation's transform `elapsedMs` after it started (looping forever,
 * `animation-delay` applied), including its `transform-origin`: a point in
 * the animated element's own coordinates maps through the result the way
 * the browser would draw it.
 */
export function sampleCssAnimation(animation: CompiledCssAnimation, elapsedMs: number): Affine {
  const { durationMs, stops } = animation;
  const cycleMs = (((elapsedMs - animation.delayMs) % durationMs) + durationMs) % durationMs;
  const phase = cycleMs / durationMs;

  let index = 0;
  while (index < stops.length - 2 && phase >= stops[index + 1].offset) index += 1;
  const from = stops[index];
  const to = stops[index + 1];
  const span = to.offset - from.offset;
  const local = span <= 0 ? 1 : Math.min(1, Math.max(0, (phase - from.offset) / span));
  const matrix = interpolateFns(from.fns, to.fns, animation.easing(local));

  const { x, y } = animation.origin;
  if (x === 0 && y === 0) return matrix;
  return multiplyAffine(multiplyAffine(translation(x, y), matrix), translation(-x, -y));
}
