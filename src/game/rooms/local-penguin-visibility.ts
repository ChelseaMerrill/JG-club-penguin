/**
 * Whether the local Player's own Penguin is drawn, and whether the Stage
 * accepts clicks (#162).
 *
 * The own Penguin is hidden from boot until the Player's Session starts,
 * so it's never drawn with anything but their saved look (the default look,
 * then the saved colour only, used to show while sign-in and progress
 * loaded). While it's hidden, the Stage ignores every click too (#162 H1),
 * so the one flag is the single source of truth for both.
 *
 * The flag lives in the Game's registry, not on `RoomScene`: the registry
 * exists from `new Game()`, while `RoomScene` only exists after the Game's
 * `ready` event, and a signed-out signal can arrive before that. An absent
 * key means visible, so any host that never gates it keeps the old
 * behaviour.
 */

/** Registry key read by `RoomScene` and written by `main.ts`. */
export const LOCAL_PENGUIN_VISIBLE_KEY = 'localPenguinVisible';

/** The slice of Phaser's `DataManager` this module needs (like `PlayerRegistry`). */
export interface VisibilityRegistry {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

export function isLocalPenguinVisible(registry: VisibilityRegistry): boolean {
  return registry.get(LOCAL_PENGUIN_VISIBLE_KEY) !== false;
}

export function setLocalPenguinVisible(registry: VisibilityRegistry, visible: boolean): void {
  registry.set(LOCAL_PENGUIN_VISIBLE_KEY, visible);
}

/** #162 H1: Stage clicks count only while the own Penguin is shown. */
export function stageAcceptsInput(registry: VisibilityRegistry): boolean {
  return isLocalPenguinVisible(registry);
}

/**
 * Shows the own Penguin once `entered` (the Session's spawn-Room entry)
 * settles, unless a newer sign-in or a sign-out has superseded it
 * (`isCurrent`). A rejection still shows it, so a failed Session start never
 * leaves the Penguin hidden and the Stage gated, and the rejection still
 * propagates to the caller.
 */
export function revealLocalPenguinAfter(
  entered: Promise<void> | undefined,
  isCurrent: () => boolean,
  registry: VisibilityRegistry,
): Promise<void> {
  return Promise.resolve(entered).finally(() => {
    if (isCurrent()) setLocalPenguinVisible(registry, true);
  });
}
