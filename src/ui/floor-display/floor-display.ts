import { gameEvents, type RoomId } from '../../contracts';
import type { RoomFloorDisplay } from '../../game/rooms/room-definition';
import { createFloorDisplayLoop, type FloorDisplayLoopDeps } from './floor-display-loop';
import './floor-display.css';

export interface FloorDisplayDeps {
  /** The Room's `floorDisplay`, or `undefined` for a Room with none. */
  resolve: (roomId: RoomId) => RoomFloorDisplay | undefined;
  /**
   * The Room `RoomScene` boots into, before any `room:enter` (`?room=` in
   * dev/e2e, else the spawn Room), as `wall-text.ts` takes it.
   */
  initialRoomId: RoomId;
  /** Where to mount it in `#ui`: before the HUD, so the HUD paints above it. */
  mountBefore?: Element | null;
  /** Test seams for the loop (seeded random, fake timers). */
  loop?: Omit<FloorDisplayLoopDeps, 'render'>;
}

export interface FloorDisplay {
  destroy(): void;
}

/**
 * The Lobby elevator's floor display (#169): a live DOM label in `#ui` over
 * the plate the design draws above the elevator doors, in the design's own
 * box, font and `skewY`, cycling `floor-display-loop.ts`'s labels. Shown
 * only while the current Room has a `floorDisplay`: its loop starts on that
 * Room's `room:enter` and stops on `room:leave`. Decorative only: no pointer
 * events, hidden from assistive tech, and never tied to a real ride.
 */
export function createFloorDisplay(uiLayer: HTMLElement, deps: FloorDisplayDeps): FloorDisplay {
  const root = document.createElement('div');
  root.className = 'floor-display';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  uiLayer.insertBefore(root, deps.mountBefore ?? null);

  const loop = createFloorDisplayLoop({
    ...deps.loop,
    render: (label) => {
      root.textContent = label;
      root.dataset.floor = label;
    },
  });

  function show(roomId: RoomId): void {
    const display = deps.resolve(roomId);
    if (!display) {
      hide();
      return;
    }
    root.style.left = `${display.x}px`;
    root.style.top = `${display.y}px`;
    root.style.width = `${display.width}px`;
    root.style.height = `${display.height}px`;
    root.style.transform = `skewY(${display.skewY}deg)`;
    root.hidden = false;
    loop.start();
  }

  function hide(): void {
    loop.stop();
    root.hidden = true;
    root.textContent = '';
    delete root.dataset.floor;
  }

  const unsubscribeEnter = gameEvents.on('room:enter', ({ roomId }) => show(roomId));
  const unsubscribeLeave = gameEvents.on('room:leave', () => hide());

  show(deps.initialRoomId);

  return {
    destroy() {
      unsubscribeEnter();
      unsubscribeLeave();
      hide();
      root.remove();
    },
  };
}
