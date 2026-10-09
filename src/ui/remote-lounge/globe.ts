import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';

/**
 * The Remote Lounge's spinning globe, ported from `design/Remote Area.html`'s
 * "globe" block: an orthographic projection of the world (land, a 10° grid,
 * US state borders once zoomed in) with dashed arcs from HQ to every remote
 * JGer and a hexagon pin at each. It idles by spinning; `flyTo` tweens it
 * to one person's city, zoomed in, and `world` back out to the spin.
 *
 * Drawn as a plain `<svg>` in Stage px over the Room's exported pedestal art,
 * at the design's own position. It uses `d3-geo` only: the design's
 * `d3.select`/`d3.timer`/`d3.interpolate` are replaced by plain DOM calls and
 * `requestAnimationFrame`, with the same numbers.
 */

const NS = 'http://www.w3.org/2000/svg';

/** The design's isolib point: tile (x, y) at height z, in Stage px. */
function iso(x: number, y: number, z = 0): [number, number] {
  return [800 + (x - y) * 50, 250 + ((x + y) * 50) / 2 - z * 50];
}

// The design's own numbers: the pedestal at (6.2, 4.8), 0.9 tall; the globe
// a radius-175 disc 6 px above it.
const [GCX, PEDESTAL_TOP_Y] = iso(6.2, 4.8, 0.9);
export const GLOBE_RADIUS = 175;
export const GLOBE_CENTER: readonly [number, number] = [GCX, PEDESTAL_TOP_Y - GLOBE_RADIUS - 6];

const EARTH_RADIUS_MILES = 3958.8;
/** The design spins 0.12° of longitude per frame (at 60 fps). */
const SPIN_DEG_PER_MS = 0.12 / (1000 / 60);
/** ...and drifts its latitude up to 28° at 0.25° per frame. */
const LAT_DRIFT_DEG_PER_MS = 0.25 / (1000 / 60);
const FLY_ZOOM = 14;
const FLY_MS = 1400;
const WORLD_MS = 1100;

/**
 * Rio de Janeiro, where the LATAM section's own globe marker sits (`design/
 * Remote Area.html`'s `RIO` constant, added by the design resync that
 * introduced the LATAM section, owner request, 2026-10-09). Not a
 * `GlobePin`: it never flies the globe in, has no roster row or person card,
 * and its click goes straight to the LATAM Café (`onLatamPinClick`) instead.
 */
export const RIO_LOCATION = { lon: -43.173, lat: -22.907 };

export interface GlobePin {
  name: string;
  lon: number;
  lat: number;
}

export interface GlobeMap {
  land: GeoPermissibleObjects;
  borders: GeoPermissibleObjects | null;
}

export interface Globe {
  readonly element: SVGSVGElement;
  /** Draws the land and borders once they've loaded (the globe draws its ocean and grid before). */
  setMap(map: GlobeMap): void;
  /** Tweens to `pins[index]`'s city, zoomed in, and stops the spin. */
  flyTo(index: number): void;
  /** Tweens back out to the whole globe, then resumes the spin. */
  world(): void;
  destroy(): void;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  parent?.appendChild(node);
  return node;
}

/** The design's pointy-topped hexagon pin, as polygon points. */
function hexPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const t = (Math.PI / 3) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`);
  }
  return points.join(' ');
}

function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Great-circle miles between two points, as the design's card shows them. */
export function milesBetween(a: GlobePin, b: { lon: number; lat: number }): number {
  return Math.round(geoDistance([a.lon, a.lat], [b.lon, b.lat]) * EARTH_RADIUS_MILES);
}

export function createGlobe(
  hq: { lon: number; lat: number },
  pins: readonly GlobePin[],
  opts: {
    onPinClick: (index: number) => void;
    /** Clicking the LATAM pin (`RIO_LOCATION`): straight to the LATAM Café, never a `flyTo`. */
    onLatamPinClick: () => void;
    reducedMotion: boolean;
  },
): Globe {
  const [cx, cy] = GLOBE_CENTER;
  const R = GLOBE_RADIUS;
  const svg = el('svg', { viewBox: '0 0 1600 900', width: 1600, height: 900, class: 'globe' });

  const defs = el('defs', {}, svg);
  const ocean = el('radialGradient', { id: 'globe-ocean', cx: '38%', cy: '32%', r: '75%' }, defs);
  el('stop', { offset: 0, 'stop-color': '#14627A' }, ocean);
  el('stop', { offset: 0.6, 'stop-color': '#0C4B5F' }, ocean);
  el('stop', { offset: 1, 'stop-color': '#06303D' }, ocean);
  const shine = el('radialGradient', { id: 'globe-shine', cx: '34%', cy: '26%', r: '40%' }, defs);
  el('stop', { offset: 0, 'stop-color': '#F4F4F4', 'stop-opacity': 0.22 }, shine);
  el('stop', { offset: 1, 'stop-color': '#F4F4F4', 'stop-opacity': 0 }, shine);
  const glow = el('radialGradient', { id: 'globe-glow', cx: '50%', cy: '50%', r: '50%' }, defs);
  el('stop', { offset: 0.7, 'stop-color': '#00BDFF', 'stop-opacity': 0.25 }, glow);
  el('stop', { offset: 1, 'stop-color': '#00BDFF', 'stop-opacity': 0 }, glow);
  const clip = el('clipPath', { id: 'globe-clip' }, defs);
  el('circle', { cx, cy, r: R }, clip);

  // The beam on the pedestal, the stand and the halo, then the clipped disc.
  el(
    'ellipse',
    { cx, cy: PEDESTAL_TOP_Y - 4, rx: 70, ry: 18, fill: '#00BDFF', opacity: 0.35 },
    svg,
  );
  el(
    'rect',
    {
      x: cx - 10,
      y: cy + R - 8,
      width: 20,
      height: PEDESTAL_TOP_Y - cy - R + 4,
      fill: '#494949',
      stroke: '#0C4B5F',
      'stroke-width': 2,
    },
    svg,
  );
  el('circle', { cx, cy, r: R + 26, fill: 'url(#globe-glow)' }, svg);
  const body = el('g', { 'clip-path': 'url(#globe-clip)' }, svg);
  el('circle', { cx, cy, r: R, fill: 'url(#globe-ocean)' }, body);
  const gratPath = el(
    'path',
    { fill: 'none', stroke: '#00BDFF', 'stroke-opacity': 0.18, 'stroke-width': 1 },
    body,
  );
  const landPath = el('path', { fill: '#d3ebf3', stroke: '#0C4B5F', 'stroke-width': 1.2 }, body);
  const statesPath = el(
    'path',
    { fill: 'none', stroke: '#0C4B5F', 'stroke-opacity': 0.35, 'stroke-width': 0.8 },
    body,
  );
  const arcsG = el('g', {}, body);
  const pinsG = el('g', {}, body);
  // The LATAM pin (`design/Remote Area.html`'s own `latamG`/`.lm`/`.ll`
  // markup, verbatim): a purple pulsing marker at Rio with a "LATAM" pill
  // label above it, a sibling of `pinsG`'s JGer pins rather than one of them
  // -- it carries no roster row or city card, and its click opens the LATAM
  // Café directly (`onLatamPinClick`), not `flyTo`.
  const latamPin = el('g', { class: 'globe__latam-pin' }, body);
  latamPin.style.cursor = 'pointer';
  latamPin.addEventListener('click', (event) => {
    event.stopPropagation();
    opts.onLatamPinClick();
  });
  const latamMarker = el('g', {}, latamPin);
  const latamPulse = el('circle', { r: 8, fill: '#C9A8FF', opacity: 0 }, latamMarker);
  el(
    'animate',
    { attributeName: 'r', values: '8;30', dur: '1.4s', repeatCount: 'indefinite' },
    latamPulse,
  );
  el(
    'animate',
    { attributeName: 'opacity', values: '.6;0', dur: '1.4s', repeatCount: 'indefinite' },
    latamPulse,
  );
  const latamPinBody = el('g', {}, latamMarker);
  el(
    'animate',
    { attributeName: 'opacity', values: '1;.25;1', dur: '1s', repeatCount: 'indefinite' },
    latamPinBody,
  );
  el('circle', { r: 12, fill: '#C9A8FF', stroke: '#161719', 'stroke-width': 3 }, latamPinBody);
  el('circle', { r: 8, fill: '#F4F4F4', stroke: '#161719', 'stroke-width': 1.5 }, latamPinBody);
  el(
    'polygon',
    { points: '0,-4 3.8,-1.2 2.4,3.2 -2.4,3.2 -3.8,-1.2', fill: '#161719' },
    latamPinBody,
  );
  el(
    'path',
    {
      d: 'M0 -4 V-8 M3.8 -1.2 L7.5 -2.5 M2.4 3.2 L4.6 6.4 M-2.4 3.2 L-4.6 6.4 M-3.8 -1.2 L-7.5 -2.5',
      stroke: '#161719',
      'stroke-width': 1.2,
    },
    latamPinBody,
  );
  el('circle', { r: 26, fill: 'transparent' }, latamMarker);
  const latamLabel = el('g', {}, latamPin);
  el(
    'rect',
    {
      x: -34,
      y: 0,
      width: 68,
      height: 20,
      rx: 10,
      fill: '#161719',
      stroke: '#C9A8FF',
      'stroke-width': 2,
    },
    latamLabel,
  );
  const latamText = el(
    'text',
    {
      x: 0,
      y: 14,
      'text-anchor': 'middle',
      'font-family': 'Libre Franklin, sans-serif',
      'font-weight': 700,
      'font-size': 11,
      fill: '#F4F4F4',
    },
    latamLabel,
  );
  latamText.textContent = 'LATAM';
  el('circle', { cx, cy, r: R, fill: 'url(#globe-shine)', 'pointer-events': 'none' }, svg);
  el('circle', { cx, cy, r: R, fill: 'none', stroke: '#00BDFF', 'stroke-width': 4 }, svg);
  el(
    'path',
    {
      d: `M${cx - R - 14},${cy} A${R + 14},${R + 14} 0 0 1 ${cx + R + 14},${cy}`,
      fill: 'none',
      stroke: '#494949',
      'stroke-width': 8,
      'stroke-linecap': 'round',
      transform: `rotate(-23 ${cx} ${cy})`,
    },
    svg,
  );

  const projection = geoOrthographic().translate([cx, cy]).scale(R).clipAngle(90).precision(0.3);
  const path = geoPath(projection);
  const graticule = geoGraticule10();
  let map: GlobeMap | null = null;
  let view = { lon: 60, lat: -28, k: 1 };
  let spinning = !opts.reducedMotion;
  let selected = -1;

  const arcPaths = pins.map(() =>
    el(
      'path',
      { fill: 'none', stroke: '#00BDFF', 'stroke-width': 2, 'stroke-dasharray': '5 5' },
      arcsG,
    ),
  );
  const allPins = [
    { name: 'JG HQ', lon: hq.lon, lat: hq.lat, hq: true },
    ...pins.map((p) => ({ ...p, hq: false })),
  ];
  const pinEls = allPins.map((pin, i) => {
    const g = el('g', { class: pin.hq ? 'globe__pin globe__pin--hq' : 'globe__pin' }, pinsG);
    const stem = el('line', { stroke: '#161719', 'stroke-width': 2 }, g);
    const hex = el('polygon', { stroke: '#161719', 'stroke-width': 2.5 }, g);
    const label = el('g', {}, g);
    if (!pin.hq) {
      g.addEventListener('click', (event) => {
        event.stopPropagation();
        opts.onPinClick(i - 1);
      });
    }
    return { g, stem, hex, label };
  });

  function draw(): void {
    projection.rotate([-view.lon, -view.lat]).scale(R * view.k);
    gratPath.setAttribute('d', path(graticule) ?? '');
    if (map) landPath.setAttribute('d', path(map.land) ?? '');
    statesPath.setAttribute('d', map?.borders && view.k > 2 ? (path(map.borders) ?? '') : '');
    const zoomed = view.k > 2.2;
    const center: [number, number] = [view.lon, view.lat];
    pins.forEach((p, i) => {
      const d = path({
        type: 'LineString',
        coordinates: [
          [hq.lon, hq.lat],
          [p.lon, p.lat],
        ],
      });
      arcPaths[i]!.setAttribute('d', d ?? '');
      arcPaths[i]!.setAttribute('opacity', zoomed ? '0.9' : '0.6');
    });
    allPins.forEach((pin, i) => {
      const { g, stem, hex, label } = pinEls[i]!;
      const visible = geoDistance([pin.lon, pin.lat], center) < Math.PI / 2 - 0.02;
      g.style.display = visible ? '' : 'none';
      if (!visible) return;
      const [x, y] = projection([pin.lon, pin.lat])!;
      const on = !pin.hq && i - 1 === selected;
      const h = (pin.hq ? 14 : 10) * (zoomed ? 1.6 : 1);
      stem.setAttribute('x1', String(x));
      stem.setAttribute('y1', String(y));
      stem.setAttribute('x2', String(x));
      stem.setAttribute('y2', String(y - h * 1.4));
      hex.setAttribute('points', hexPoints(x, y - h * 1.4 - h * 0.2, h * (on ? 1.3 : 1)));
      hex.setAttribute('fill', pin.hq || on ? '#F4F4F4' : '#00BDFF');
      label.replaceChildren();
      if (zoomed || pin.hq) {
        const text = pin.hq ? 'HQ' : pin.name.split(' ')[0]!;
        const tw = text.length * 7.4 + 18;
        el(
          'rect',
          {
            x: x - tw / 2,
            y: y - h * 3.2 - 18,
            width: tw,
            height: 20,
            rx: 10,
            fill: on ? '#00BDFF' : '#161719',
            stroke: '#0C4B5F',
            'stroke-width': 2,
          },
          label,
        );
        const t = el(
          'text',
          {
            x,
            y: y - h * 3.2 - 4,
            'text-anchor': 'middle',
            'font-family': 'Libre Franklin, sans-serif',
            'font-weight': 700,
            'font-size': 11,
            fill: on ? '#161719' : '#F4F4F4',
          },
          label,
        );
        t.textContent = text;
      }
    });
    if (selected >= 0) pinsG.appendChild(pinEls[selected + 1]!.g);

    // The LATAM pin (`design/Remote Area.html`'s own visibility rule,
    // verbatim: `d3.geoDistance(RIO, c) < Math.PI/2 - .02`), shown only when
    // Rio is on the visible hemisphere, scaled 1.4x and its label lifted
    // further once zoomed in.
    const latamVisible =
      geoDistance([RIO_LOCATION.lon, RIO_LOCATION.lat], center) < Math.PI / 2 - 0.02;
    latamPin.style.display = latamVisible ? '' : 'none';
    if (latamVisible) {
      const [lx, ly] = projection([RIO_LOCATION.lon, RIO_LOCATION.lat])!;
      const scale = zoomed ? 1.4 : 1;
      const labelY = ly - (zoomed ? 46 : 38);
      latamMarker.setAttribute('transform', `translate(${lx} ${ly}) scale(${scale})`);
      latamLabel.setAttribute('transform', `translate(${lx} ${labelY})`);
    }
  }

  let tween: {
    from: typeof view;
    dLon: number;
    to: typeof view;
    start: number;
    ms: number;
  } | null = null;
  function tweenTo(lon: number, lat: number, k: number, ms: number): void {
    const dLon = ((((lon - view.lon) % 360) + 540) % 360) - 180;
    tween = { from: { ...view }, dLon, to: { lon, lat, k }, start: performance.now(), ms };
  }

  let frame = 0;
  let last = performance.now();
  function tick(now: number): void {
    const dt = Math.min(now - last, 100);
    last = now;
    if (tween) {
      const t = opts.reducedMotion ? 1 : Math.min(1, (now - tween.start) / tween.ms);
      const e = easeCubicInOut(t);
      view = {
        lon: tween.from.lon + tween.dLon * e,
        lat: tween.from.lat + (tween.to.lat - tween.from.lat) * e,
        k: tween.from.k + (tween.to.k - tween.from.k) * e,
      };
      if (t >= 1) {
        view.lon = ((view.lon + 540) % 360) - 180;
        tween = null;
      }
      draw();
    } else if (spinning) {
      view.lon += SPIN_DEG_PER_MS * dt;
      if (view.lat < 28) view.lat = Math.min(28, view.lat + LAT_DRIFT_DEG_PER_MS * dt);
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  draw();
  frame = requestAnimationFrame(tick);

  return {
    element: svg,
    setMap(next) {
      map = next;
      draw();
    },
    flyTo(index) {
      const pin = pins[index];
      if (!pin) return;
      clearTimeout(resumeTimer);
      selected = index;
      spinning = false;
      tweenTo(pin.lon, pin.lat, FLY_ZOOM, FLY_MS);
      draw();
    },
    world() {
      selected = -1;
      tweenTo(view.lon, 30, 1, WORLD_MS);
      draw();
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        if (selected < 0 && !opts.reducedMotion) spinning = true;
      }, WORLD_MS + 50);
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearTimeout(resumeTimer);
      svg.remove();
    },
  };
}
