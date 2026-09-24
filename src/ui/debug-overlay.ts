/**
 * STUB for #15, #33, #35. Plain-DOM debug overlay (Room switcher, look
 * randomizer, remote-Penguin roster), mounted only when the URL has a
 * `debug` param. Replace piecemeal as each real Track lands.
 */
import { HATS } from '../contracts/penguin';
import type { Hat, PenguinLook } from '../contracts/penguin';
import { ROOM_IDS } from '../contracts/rooms';
import type { RoomId } from '../contracts/rooms';
import type { PresencePayload } from '../contracts/realtime';
import type { RemotePenguinView } from '../realtime/room-channel';

const RANDOM_BODY_COLORS: readonly string[] = [
  '#161719',
  '#E63946',
  '#2A9D8F',
  '#E9C46A',
  '#264653',
  '#F4A261',
  '#A8DADC',
  '#6A4C93',
];

export function isDebugEnabled(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has('debug');
}

export function isMaskNamesEnabled(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has('masknames');
}

function pickRandomBody(current: string): string {
  const pool = RANDOM_BODY_COLORS.filter((c) => c !== current);
  const options = pool.length > 0 ? pool : RANDOM_BODY_COLORS;
  return options[Math.floor(Math.random() * options.length)];
}

function pickRandomHat(): Hat {
  return HATS[Math.floor(Math.random() * HATS.length)];
}

function rosterName(name: string): string {
  return isMaskNamesEnabled() ? '•••' : name;
}

export interface DebugOverlayCallbacks {
  /** Room button clicked (stand-in for #15's real Room navigation). */
  onEnterRoom(roomId: RoomId): void;
  /** Random-look button clicked (stand-in for #35's Creator). */
  onSetLook(look: PenguinLook): void;
}

export interface DebugOverlay extends RemotePenguinView {
  /** Reflects the local Player's current look, e.g. after sign-in or a Creator change. */
  setOwnLook(look: PenguinLook): void;
  setCurrentRoom(roomId: RoomId | null): void;
  destroy(): void;
}

/** Mounts the debug overlay into `root` (the `#ui` layer) and returns its handle. */
export function createDebugOverlay(
  root: HTMLElement,
  callbacks: DebugOverlayCallbacks,
): DebugOverlay {
  let currentLook: PenguinLook | null = null;

  const container = document.createElement('div');
  container.className = 'debug-overlay';

  const roomButtons = document.createElement('div');
  roomButtons.className = 'debug-rooms';
  for (const roomId of ROOM_IDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.room = roomId;
    button.textContent = roomId;
    button.addEventListener('click', () => callbacks.onEnterRoom(roomId));
    roomButtons.append(button);
  }

  function setOwnLookInternal(look: PenguinLook): void {
    currentLook = look;
    container.dataset.ownBody = look.body;
  }

  const randomLookButton = document.createElement('button');
  randomLookButton.type = 'button';
  randomLookButton.className = 'debug-random-look';
  randomLookButton.textContent = 'Random look';
  randomLookButton.addEventListener('click', () => {
    if (!currentLook) return;
    const next: PenguinLook = {
      ...currentLook,
      body: pickRandomBody(currentLook.body),
      hat: pickRandomHat(),
    };
    setOwnLookInternal(next);
    callbacks.onSetLook(next);
  });

  const currentRoomLabel = document.createElement('span');
  currentRoomLabel.className = 'debug-current-room';

  const roster = document.createElement('ul');
  roster.className = 'debug-roster';
  const rosterItems = new Map<string, HTMLLIElement>();

  container.append(roomButtons, randomLookButton, currentRoomLabel, roster);
  root.append(container);

  return {
    setOwnLook(look: PenguinLook): void {
      setOwnLookInternal(look);
    },
    setCurrentRoom(roomId: RoomId | null): void {
      container.dataset.currentRoom = roomId ?? '';
      currentRoomLabel.textContent = roomId ?? '';
    },
    upsert(p: PresencePayload): void {
      let li = rosterItems.get(p.playerId);
      if (!li) {
        li = document.createElement('li');
        li.dataset.playerId = p.playerId;
        roster.append(li);
        rosterItems.set(p.playerId, li);
      }
      li.dataset.body = p.look.body;
      li.dataset.name = p.look.name;
      li.textContent = rosterName(p.look.name);
    },
    remove(playerId: string): void {
      const li = rosterItems.get(playerId);
      if (!li) return;
      li.remove();
      rosterItems.delete(playerId);
    },
    clear(): void {
      for (const li of rosterItems.values()) li.remove();
      rosterItems.clear();
    },
    destroy(): void {
      container.remove();
    },
  };
}
