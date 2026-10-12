// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGlobe, RIO_LOCATION, type Globe, type GlobePin } from './globe';

let globe: Globe | undefined;

afterEach(() => {
  globe?.destroy();
  globe = undefined;
});

/** Waits for the globe's own `requestAnimationFrame` tick to run once (`flyTo`'s tween applies there, not synchronously). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

const HQ = { lon: -95.7, lat: 29.76 };
/** Rio itself: flying here puts the LATAM pin dead centre (well inside the visible hemisphere). */
const NEAR_RIO_PIN: GlobePin = { name: 'Near Rio', lon: RIO_LOCATION.lon, lat: RIO_LOCATION.lat };
/** Rio's antipode: flying here puts the LATAM pin on the far side of the globe. */
const FAR_FROM_RIO_PIN: GlobePin = {
  name: 'Far From Rio',
  lon: RIO_LOCATION.lon + 180,
  lat: -RIO_LOCATION.lat,
};

describe("the globe's LATAM pin (owner request, 2026-10-09)", () => {
  it('renders a LATAM-labelled pin, a sibling of the JGer pins, not one of them', () => {
    globe = createGlobe(HQ, [], {
      onPinClick: vi.fn(),
      onLatamPinClick: vi.fn(),
      reducedMotion: true,
    });

    const pin = globe.element.querySelector('.globe__latam-pin');
    expect(pin).not.toBeNull();
    expect(pin!.textContent).toContain('LATAM');
    // Only the HQ pin (`allPins` always includes it): no JGer pins, no LATAM
    // pin, among `.globe__pin`'s own elements -- it is a distinct class.
    expect(globe.element.querySelectorAll('.globe__pin')).toHaveLength(1);
  });

  it('shows the pin once the globe faces Rio', async () => {
    globe = createGlobe(HQ, [NEAR_RIO_PIN], {
      onPinClick: vi.fn(),
      onLatamPinClick: vi.fn(),
      reducedMotion: true,
    });

    globe.flyTo(0);
    await nextFrame();

    const pin = globe.element.querySelector<SVGGElement>('.globe__latam-pin')!;
    expect(pin.style.display).not.toBe('none');
  });

  it('hides the pin once the globe flies to the far side of the world from Rio', async () => {
    globe = createGlobe(HQ, [FAR_FROM_RIO_PIN], {
      onPinClick: vi.fn(),
      onLatamPinClick: vi.fn(),
      reducedMotion: true,
    });

    globe.flyTo(0);
    await nextFrame();

    const pin = globe.element.querySelector<SVGGElement>('.globe__latam-pin')!;
    expect(pin.style.display).toBe('none');
  });

  it('calls onLatamPinClick, never onPinClick, when clicked', () => {
    const onPinClick = vi.fn();
    const onLatamPinClick = vi.fn();
    globe = createGlobe(HQ, [], { onPinClick, onLatamPinClick, reducedMotion: true });

    const pin = globe.element.querySelector<SVGGElement>('.globe__latam-pin')!;
    pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onLatamPinClick).toHaveBeenCalledTimes(1);
    expect(onPinClick).not.toHaveBeenCalled();
  });
});
