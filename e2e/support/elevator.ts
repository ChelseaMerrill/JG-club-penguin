import { expect, type Page } from '@playwright/test';
import type { FloorId } from '../../src/game/rooms/floors';

/** Generous CI-jitter slack on top of the Elevator's own longest ride, 7.2s for L <-> R (#52, #163). */
const ELEVATOR_HIDE_TIMEOUT = 15_000;

/**
 * Mirrors `src/ui/elevator-test-handle.ts`'s `window.__elevatorTest` (#163),
 * redeclared here because `main.ts` reads `import.meta.env`, which the `e2e`
 * tsconfig doesn't type-check (the `creator-debug-types.ts` pattern). The two
 * declarations must stay identical: TypeScript requires every `Window`
 * augmentation of the same property to resolve to the same type.
 */
export interface ElevatorTestHandle {
  /** Starts a ride between two floors, hiding at its end (`begin` plus an immediate `ready`). */
  ride(from: FloorId, to: FloorId): void;
  /** Stops the ride's clocks and shows the instant `elapsedMs` into it, every animation paused there. */
  freezeAt(elapsedMs: number): void;
  /** Hides the screen at once. */
  hide(): void;
}

declare global {
  interface Window {
    /** Test-only (#163); see `src/ui/elevator-test-handle.ts`. */
    __elevatorTest?: ElevatorTestHandle;
  }
}

/**
 * A Room change that crosses a floor (Town Center <-> Roof Deck/The Melt)
 * is covered by #52's Elevator overlay, which swallows clicks for the whole
 * ride -- 1.2s for each floor crossed, up to 7.2s (#163); callers must wait
 * for it to hide before their next click or assertion. A harmless no-op wait
 * for a same-floor crossing, since the overlay is already hidden in that
 * case. Shared by every e2e spec that crosses a floor (#52 review standards
 * nit), rather than each spec redeclaring its own copy.
 */
export async function waitForElevatorHidden(page: Page): Promise<void> {
  await expect(page.locator('.elevator-screen')).toBeHidden({ timeout: ELEVATOR_HIDE_TIMEOUT });
}

/** Rides the real Elevator screen between two floors with no Room change (`__elevatorTest.ride`, #163). */
export async function rideFloors(page: Page, from: FloorId, to: FloorId): Promise<void> {
  await page.evaluate(([a, b]) => window.__elevatorTest?.ride(a, b), [from, to] as const);
}

/** Freezes the current ride `ms` in, with every animation paused there (`__elevatorTest.freezeAt`, #163). */
export async function freezeRideAt(page: Page, ms: number): Promise<void> {
  await page.evaluate((elapsed) => window.__elevatorTest?.freezeAt(elapsed), ms);
}
