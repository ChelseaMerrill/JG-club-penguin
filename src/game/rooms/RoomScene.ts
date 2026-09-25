import { Data, GameObjects, Scene, Scenes, type Input, type Time, type Tweens } from 'phaser';
import {
  gameEvents,
  SPAWN_ROOM_ID,
  type Facing,
  type PenguinLook,
  type RoomId,
  type Tile,
} from '../../contracts';
import {
  createLocalPenguinController,
  facingForStep,
  type LocalPenguinController,
} from '../movement/controller';
import { nearestReachable, nearestWalkable, tilesEqual } from '../movement/pathfinding';
import { TILE_STEP_MS } from '../movement/speed';
import {
  resolveRegisteredLook,
  resolveRegisteredPlayerId,
  type RegisteredPlayer,
} from '../movement/registered-player';
import { doorApproachTile, npcInteractionTile } from '../movement/targets';
import { getNpcDefinition } from '../../npcs/npcs';
import { createNpcSprite, type NpcSprite } from '../npcs/npc-sprite';
import { createPenguin, type Penguin, type PenguinAnim } from '../penguin';
import { GAME_HEIGHT, GAME_WIDTH } from '../stage-size';
import { planBackgroundDraw } from './background';
import {
  countActiveTextureListeners,
  exposeRoomDebug,
  HOOKS_ENABLED,
  resolveRoomIdFromLocation,
} from './dev-room-hook';
import {
  depthForTile,
  screenToTile,
  SNOWBALL_LAYER,
  tileCornerToScreen,
  tileToScreen,
  TILE_HEIGHT,
  TILE_WIDTH,
} from './iso';
import { getRoomDefinition, hasRoomDefinition } from './registry';
import type { RoomDefinition, RoomDoor, RoomHotspot, RoomNpcSlot } from './room-definition';
import { RoomPenguinView, type PlacePenguin } from './room-penguin-view';
import type { SnowballView } from '../../snowball/snowball-controller';
import { arcPoint, clampTileToGrid, type ScreenPoint } from '../../snowball/snowball-rules';

export const ROOM_SCENE_KEY = 'RoomScene';

/**
 * Scene-local event (#14 D5, not a contract event): fired whenever a walk
 * starts or a new click mid-walk re-routes. #43 broadcasts `move` from it.
 */
export const LOCAL_PENGUIN_MOVE_EVENT = 'local-penguin:move';
/**
 * Scene-local event (not a contract event): fired when a walk's path is
 * exhausted in `advanceStep`, and also when a queued move applied from that
 * same tween's `onComplete` resolves right back to the tile the Penguin now
 * stands on (#43 D1) — a walk genuinely in progress just ended there, so
 * remotes still need to re-route to stop at this tile. Never fired on a
 * queued re-route that keeps walking, nor on a plain own-tile click while
 * already standing still (`stopCleanly`'s true no-op path). `main.ts` (#43)
 * answers it with `roomChannel.setTile(tile, facing)`: one Presence track
 * per arrival, never per step or frame.
 */
export const LOCAL_PENGUIN_ARRIVED_EVENT = 'local-penguin:arrived';
/**
 * Scene-local event (#14 D5, not a contract event): fired on arrival at a
 * door's approach tile. #15 calls `changeRoom(door.targetRoomId)` from it.
 * A disabled door (`targetRoomId: null`) still fires this; #15 owns the
 * "coming soon" handling for that case.
 */
export const DOOR_REACHED_EVENT = 'door:reached';

/**
 * Scene-local event (#53, not a contract event): a left-click while aiming
 * in Snowball mode, at the reticle's (grid-clamped) Tile. `main.ts` answers
 * it with the snowball controller's `throwAt(target)`. Attach once, like the
 * other scene-local events: `this.events` survives every restart.
 */
export const SNOWBALL_THROW_EVENT = 'snowball:aim-throw';

export interface SnowballThrowRequestEvent {
  target: Tile;
}

export interface LocalPenguinMoveEvent {
  target: Tile;
}

export interface LocalPenguinArrivedEvent {
  tile: Tile;
  facing: Facing;
}

export interface DoorReachedEvent {
  door: RoomDoor;
}

// Room-surface colours from `design/design_handoff_club_jenguin/README.md`'s
// Design Tokens list (`#0a0b0d`, `#121316`, `#17181b`, `#1c1e21`).
const FLOOR_COLOR_A = 0x17181b;
const FLOOR_COLOR_B = 0x1c1e21;
const WALL_LEFT_COLOR = 0x121316;
const WALL_RIGHT_COLOR = 0x17181b;
const DOOR_COLOR = 0x0a0b0d;
const DOOR_BORDER_COLOR = 0x00bdff;
const DOOR_BORDER_WIDTH = 2;

// The Stage's letterbox colour behind the Room (`design`'s `#0E1013` sky/base).
const STAGE_BACKGROUND_COLOR = '#0e1013';

// Draw depths, lowest-first. The exported design image (#13 D3) sits below
// everything, including the procedural walls; doors sit above the floor but
// below their own label.
const IMAGE_BACKGROUND_DEPTH = -2;
const WALL_DEPTH = -1;
const FLOOR_DEPTH = -1;
const DOOR_DEPTH = 0;
const DOOR_LABEL_DEPTH = 1;
const DOOR_HINT_DEPTH = 2;

// A hotspot (e.g. the Igloo's Trophy Case) shares the door's depth tier and
// procedural fallback styling (#16 D5/#42): both are non-walking clickable
// targets over the Room art.
const HOTSPOT_COLOR = 0x0a0b0d;
const HOTSPOT_BORDER_COLOR = 0x00bdff;
const HOTSPOT_BORDER_WIDTH = 2;
const HOTSPOT_DEPTH = 0;
const HOTSPOT_LABEL_DEPTH = 1;
const HOTSPOT_LABEL_FONT_SIZE = '14px';

const LABEL_FONT_FAMILY = 'sans-serif';
const LABEL_TEXT_COLOR = '#F4F4F4';
const DOOR_LABEL_FONT_SIZE = '14px';
/**
 * The invisible click zone over each NPC sprite (#36 D3/A4, sized per #36
 * round-1 review item 6): centred above the sprite's feet-anchor point,
 * covering roughly feet-105 to feet+5 -- the figure's own body/head, not just
 * its feet -- not an alpha-0 shape, which Phaser drops from input
 * hit-testing the same way `drawDoors`'s own image-background `Zone` avoids
 * that trap. Confirmed against Town Center's actual NPC/click tile geometry
 * (`e2e/click-to-move.spec.ts` clicks tiles as close as one column/two rows
 * from an NPC slot) to still exclude every one of that spec's own click
 * points.
 */
const NPC_HIT_ZONE_WIDTH = 64;
const NPC_HIT_ZONE_HEIGHT = 110;
const NPC_HIT_ZONE_OFFSET_Y = -50;

// #15 D3/A4: a disabled door's (`targetRoomId: null`) "COMING SOON" hint, in
// the Stage's own display font (`--font-game-display`, `style.css`).
const DOOR_HINT_FONT_FAMILY = "'Bumbastika', sans-serif";
const DOOR_HINT_FONT_SIZE = '22px';
const DOOR_HINT_STROKE_COLOR = '#0a0b0d';
const DOOR_HINT_STROKE_THICKNESS = 4;
const DOOR_HINT_TEXT = 'COMING SOON';
/** How long the "coming soon" hint stays up (#15 D3). */
export const DOOR_HINT_DURATION_MS = 2000;

// Snowball mode (#53), after `design/Club JenGuin HUD Menus.dc.html`'s
// HUD-SNOWBALL screen: cyan reticle ellipse + ticks on the aimed Tile, a
// dashed white preview arc from the local Penguin, and the cursor hint under
// the reticle. Drawn above every Room object and Penguin, and above every
// NPC's speech bubble (`iso.ts`'s shared `SNOWBALL_LAYER`, one whole layer
// above `NPC_BUBBLE_LAYER` -- #36 round-2 review item 3).
const SNOWBALL_DEPTH = SNOWBALL_LAYER;
const SNOWBALL_CYAN = 0x00bdff;
const SNOWBALL_WHITE = 0xf4f4f4;
const SNOWBALL_OUTLINE = 0x0c4b5f;
/** Arcs start at chest height, this far above the feet point every `SnowballView` point is. */
const SNOWBALL_CHEST_OFFSET_Y = 60;
const SNOWBALL_PREVIEW_SEGMENTS = 28;
/** How long a splat stays up before it has faded out (#53 D2: ~400 ms). */
const SNOWBALL_SPLAT_MS = 400;
const SNOWBALL_HINT_TEXT = 'CLICK TO THROW · RIGHT-CLICK TO CANCEL';
const SNOWBALL_HINT_OFFSET_Y = 56;

const FURNITURE_WIDTH = 40;
const FURNITURE_HEIGHT = 28;
const FURNITURE_COLOR = 0x0c4b5f;

const PROP_WIDTH = 32;
const PROP_HEIGHT = 32;
const PROP_COLOR = 0x3a3d42;

/** The registry key #14/`src/auth/player.ts`'s `bindPlayer` sets/removes. */
const PLAYER_REGISTRY_KEY = 'player';

/** The `Container` name `placePenguinsIn` gives each remote Penguin (#28). */
const REMOTE_PENGUIN_NAME = 'remote-penguin';

/**
 * The `Container` name `drawNpcs` gives each NPC sprite (#36), so
 * `publishRoomDebug`'s `penguinCount` (a Penguin-only count, #14 review fix
 * 8's restart-leak check) doesn't also count every NPC standing in the Room
 * as a "Penguin" the way an unnamed Container otherwise would.
 */
const NPC_CONTAINER_NAME = 'npc';

/** One entry in an interactive hit-area lookup table (`onPointerDown`). */
interface HitArea<T> {
  object: GameObjects.GameObject;
  data: T;
}

/** A click's target, queued mid-walk rather than applied immediately (#14 review fix 3). */
interface QueuedMove {
  target: Tile;
  onArrive?: () => void;
}

export interface RoomSceneData {
  roomId?: RoomId;
  /**
   * The tile to spawn the local Penguin on (#15's door handoff); falls back
   * to `room.spawnTile` when absent, as at the initial boot spawn.
   */
  entryTile?: Tile;
}

/**
 * Loads and renders any `RoomDefinition` by id. One `RoomScene` fills the
 * fixed 1600x900 stage with no camera scrolling (#13 D2): `create()`
 * explicitly pins the camera scroll to `(0, 0)` rather than relying on a
 * fresh Scene's default (also `0`), so scroll stays correct even if a later
 * change nudges the camera; `cameras.main.scrollX/scrollY` are how
 * `exposeRoomDebug` (and `e2e/room-framework.spec.ts`) confirm it.
 *
 * The room id comes from `init(data)` when the caller supplies one (future
 * Room-switching, #15), and otherwise from the `?room=` dev/e2e hook, which
 * itself falls back to `SPAWN_ROOM_ID`.
 *
 * #14 also spawns the local Penguin at the Room's `spawnTile` (or `data`'s
 * `entryTile`, #15) and drives click-to-move: a pointer click resolves to a
 * walkable, connectivity-checked tile (`iso.ts`'s `screenToTile`, snapped to
 * the nearest walkable tile when the click lands off the mask, then to the
 * nearest tile actually reachable from the Penguin's own tile), an NPC's
 * interaction tile, or a door's approach tile, and `LocalPenguinController`
 * walks it there tile by tile.
 *
 * A future consumer that calls `scene.start(ROOM_SCENE_KEY, data)` or
 * `scene.restart(data)` (#15) should treat Phaser's `Scenes.Events.CREATE`
 * (fired once `create()` finishes) as the "Room is ready" signal, not the
 * synchronous return of `start`/`restart` itself. Listeners for
 * `LOCAL_PENGUIN_MOVE_EVENT`/`LOCAL_PENGUIN_ARRIVED_EVENT`/`DOOR_REACHED_EVENT`
 * should be attached to `scene.events` exactly once, right after the Scene
 * is first created: the same `RoomScene` instance (and its `events`
 * emitter) is reused across a `scene.restart()`, so a listener attached once
 * keeps receiving events after every later restart without needing to be
 * re-attached.
 *
 * `penguins` (#28) draws the Room channel's *remote* Penguins with the #31
 * renderer; the local Penguin is this scene's own (#14), not the view's.
 * `penguins` outlives each `create()`: `showRoom()` restarts this scene for
 * another Room, and `penguins` re-places every Penguin it knows once the new
 * Room is drawn. Both sort with `depthForTile`. `whenReady()` resolves after
 * the first `create()`.
 */
export class RoomScene extends Scene {
  private roomId: RoomId = SPAWN_ROOM_ID;
  readonly penguins = new RoomPenguinView();
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private entryTile: Tile | undefined;
  private room: RoomDefinition | null = null;
  private controller: LocalPenguinController | null = null;
  private penguin: Penguin | null = null;
  private currentLook: PenguinLook = resolveRegisteredLook(undefined);
  private currentAnim: PenguinAnim = this.currentLook.emote;
  private activeTween: Tweens.Tween | null = null;
  private pendingArrival: (() => void) | null = null;
  private queuedMove: QueuedMove | null = null;
  private npcHitAreas: HitArea<RoomNpcSlot>[] = [];
  private doorHitAreas: HitArea<RoomDoor>[] = [];
  private npcSprites: NpcSprite[] = [];
  private hotspotHitAreas: HitArea<RoomHotspot>[] = [];
  private npcArrivedLog: string[] = [];
  private doorReachedLog: string[] = [];
  private localPenguinMoveLog: Tile[] = [];
  /** Tile per `LOCAL_PENGUIN_ARRIVED_EVENT` emission, oldest first (#43 D1). */
  private localPenguinArrivedLog: Tile[] = [];
  private debugPenguins: Penguin[] = [];
  /** Persists across restarts (never reset in `init()`); see `restartCount` on `RoomDebugInfo`. */
  private restartCount = 0;
  /** The "coming soon" hint currently shown for a disabled door (#15 D3), or `null`. Not reset in `init()`: `cleanup()` (SHUTDOWN) always clears it first. */
  private comingSoonHint: {
    door: RoomDoor;
    text: GameObjects.Text;
    timer: Time.TimerEvent;
  } | null = null;

  // --- Snowball mode (#53) -- all reset by `init()`/`cleanup()`, since this
  // instance survives every `scene.restart()` (v4 change 10).
  /** True between `create()` and SHUTDOWN: `snowball` view calls are no-ops otherwise. */
  private live = false;
  private aiming = false;
  /** The aimed Tile, or `null` while not aiming, before the first pointer move, or after a right-click cancel. */
  private reticleTile: Tile | null = null;
  private reticleGraphics: GameObjects.Graphics | null = null;
  private reticleHint: GameObjects.Text | null = null;
  private readonly snowballArcs = new Map<
    string,
    { ball: GameObjects.Arc; tween: Tweens.Tween; to: ScreenPoint }
  >();
  private readonly snowballSplats = new Map<string, GameObjects.Graphics>();

  /**
   * The #53 `SnowballView` the snowball controller draws through: the local
   * Penguin is this scene's own, remote Penguins are `penguins`'. Every call
   * is a no-op while the scene is not running (mid-restart or shut down).
   */
  readonly snowball: SnowballView = {
    localPoint: () => this.localFeetPoint(),
    remotePoint: (playerId) => (this.live ? this.penguins.pointOf(playerId) : null),
    shownRemoteIds: () => (this.live ? this.penguins.shownRemoteIds() : []),
    tileToPoint: (tile) => (this.room ? tileToScreen(tile, this.room.grid.origin) : { x: 0, y: 0 }),
    drawArc: (throwId, from, to, durationMs) => this.drawSnowballArc(throwId, from, to, durationMs),
    showSplat: (throwId, point) => this.showSnowballSplat(throwId, point),
    setRemoteSnowHat: (playerId, on) => {
      if (this.live) this.penguins.setSnowHat(playerId, on);
    },
    setLocalSnowHat: (on) => {
      if (this.live) this.penguin?.setSnowHat(on);
    },
  };

  /** A stable reference so `cleanup` can `off` exactly what `create` `on`'d. */
  private readonly handlePointerDown = (
    pointer: Input.Pointer,
    currentlyOver: GameObjects.GameObject[],
  ): void => {
    this.onPointerDown(pointer, currentlyOver);
  };

  /** Moves the Snowball reticle with the pointer while aiming (#53). */
  private readonly handlePointerMove = (pointer: Input.Pointer): void => {
    if (!this.aiming) return;
    this.aimAt(pointer);
  };

  /** Right-click cancels the aim rather than opening the browser menu, only while aiming (#53 D6). */
  private readonly handleContextMenu = (event: Event): void => {
    if (this.aiming) event.preventDefault();
  };

  /**
   * Fired the very first time the registry's `player` key is ever set.
   * Phaser's `DataManager` only emits a generic `setdata` (no per-key
   * variant) on a key's first `set`; filtered to `player` here. Sign-in
   * normally arrives this way, since `bindPlayer` (`main.ts`) calls
   * `registry.remove('player')` on sign-out, which makes the *next*
   * sign-in "first" again (#14 review fix 1).
   */
  private readonly handleRegistrySetData = (_parent: unknown, key: string): void => {
    if (key === PLAYER_REGISTRY_KEY) this.applyRegisteredPlayer();
  };

  /** Fired on every later `player` update, once the key already exists (review fix 1). */
  private readonly handleRegistryPlayerChanged = (): void => {
    this.applyRegisteredPlayer();
  };

  /** A stable reference so a scene restart's fresh `create()` re-registers cleanly. */
  private readonly cleanup = (): void => {
    this.input.off('pointerdown', this.handlePointerDown);
    this.input.off('pointermove', this.handlePointerMove);
    this.game.canvas?.removeEventListener('contextmenu', this.handleContextMenu);
    this.resetSnowballState();
    this.registry.events.off(Data.Events.SET_DATA, this.handleRegistrySetData);
    this.registry.events.off(
      Data.Events.CHANGE_DATA_KEY + PLAYER_REGISTRY_KEY,
      this.handleRegistryPlayerChanged,
    );
    if (this.activeTween) {
      this.activeTween.stop();
      this.activeTween = null;
    }
    this.penguin?.destroy();
    this.penguin = null;
    this.controller = null;
    this.pendingArrival = null;
    this.queuedMove = null;
    this.debugPenguins.forEach((debugPenguin) => debugPenguin.destroy());
    this.debugPenguins = [];
    this.npcSprites.forEach((npcSprite) => npcSprite.destroy());
    this.npcSprites = [];
    this.clearComingSoonHint();
  };

  constructor() {
    super(ROOM_SCENE_KEY);
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  init(data: RoomSceneData = {}): void {
    this.roomId = data.roomId ?? resolveRoomIdFromLocation(window.location);
    this.entryTile = data.entryTile;
    this.room = null;
    this.controller = null;
    this.penguin = null;
    this.activeTween = null;
    this.pendingArrival = null;
    this.queuedMove = null;
    this.npcHitAreas = [];
    this.doorHitAreas = [];
    this.hotspotHitAreas = [];
    this.npcArrivedLog = [];
    this.doorReachedLog = [];
    this.localPenguinMoveLog = [];
    this.localPenguinArrivedLog = [];
    this.debugPenguins = [];
    this.npcSprites = [];
    this.resetSnowballState();
  }

  /** Resolves once the first `create()` has run. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Resolves once the *next* restart's `create()` finishes — unlike
   * `whenReady()`, which only ever resolves for the very first one. #15's
   * navigator calls this right after `showRoom()` (deferred by Phaser to its
   * own scene-transition tick, so subscribing here is never too late) and
   * awaits it before emitting `room:enter`.
   */
  whenNextReady(): Promise<void> {
    return new Promise((resolve) => {
      this.events.once(Scenes.Events.CREATE, () => resolve());
    });
  }

  /**
   * Registers `handler` for every door the local Penguin reaches, enabled or
   * disabled alike (#15 D3). Call once: `this.events` (and any listener
   * already attached to it) survives every `scene.restart()`, so calling
   * this again on a later Room change would only stack a duplicate.
   */
  onDoorReached(handler: (door: RoomDoor) => void): void {
    this.events.on(DOOR_REACHED_EVENT, ({ door }: DoorReachedEvent) => handler(door));
  }

  /**
   * Shows the "COMING SOON" hint for a disabled door (#15 D3/A4) near its
   * hotspot for `DOOR_HINT_DURATION_MS`, replacing any hint already shown
   * rather than stacking two.
   */
  showComingSoonHint(door: RoomDoor): void {
    this.clearComingSoonHint();
    const centerX = door.hotspot.x + door.hotspot.width / 2;
    const centerY = door.hotspot.y + door.hotspot.height / 2;
    const text = this.add
      .text(centerX, centerY, DOOR_HINT_TEXT, {
        fontFamily: DOOR_HINT_FONT_FAMILY,
        fontSize: DOOR_HINT_FONT_SIZE,
        color: LABEL_TEXT_COLOR,
        stroke: DOOR_HINT_STROKE_COLOR,
        strokeThickness: DOOR_HINT_STROKE_THICKNESS,
      })
      .setOrigin(0.5)
      .setDepth(DOOR_HINT_DEPTH);
    const timer = this.time.delayedCall(DOOR_HINT_DURATION_MS, () => {
      text.destroy();
      this.comingSoonHint = null;
    });
    this.comingSoonHint = { door, text, timer };
  }

  private clearComingSoonHint(): void {
    if (!this.comingSoonHint) return;
    this.comingSoonHint.timer.remove();
    this.comingSoonHint.text.destroy();
    this.comingSoonHint = null;
  }

  /** The Room currently shown (or being restarted into). */
  get currentRoomId(): RoomId {
    return this.roomId;
  }

  /**
   * Restarts this scene to show `roomId` (a Room change). A no-op for the
   * Room already shown, unless `force` (#15 review round 1: `enterSpawnRoom`
   * passes `true` so a repeat Session-start still truly restarts and
   * respawns even when the Room already showing happens to be Town Center,
   * e.g. after a dev `?room=` override), and always a no-op for a Room with
   * no `RoomDefinition` yet (#16), which leaves the current Room's art on
   * screen. Returns whether it switched. The local Penguin spawns at
   * `entryTile` when given, else at the Room's `spawnTile` (#14's `init`).
   */
  showRoom(roomId: RoomId, entryTile?: Tile, force = false): boolean {
    if ((roomId === this.roomId && !force) || !hasRoomDefinition(roomId)) return false;
    this.roomId = roomId;
    this.scene.restart({ roomId, entryTile } satisfies RoomSceneData);
    return true;
  }

  preload(): void {
    const room = getRoomDefinition(this.roomId);
    if (room.background.kind === 'image') {
      this.load.image(room.background.key, room.background.url);
    }
  }

  create(): void {
    this.restartCount += 1;

    const room = getRoomDefinition(this.roomId);
    this.room = room;
    this.cameras.main.setBackgroundColor(STAGE_BACKGROUND_COLOR);
    this.cameras.main.setScroll(0, 0);

    // The exported design art already draws the walls and floor (#16 fix 2);
    // the procedural walls are only for the `procedural` fallback background.
    if (room.background.kind !== 'image') {
      this.drawWalls(room);
    }
    this.drawBackground(room);
    this.drawDoors(room);
    this.drawHotspots(room);
    this.drawProps(room);
    this.drawFurniture(room);
    this.drawNpcs(room);
    this.spawnLocalPenguin(room);

    this.input.on('pointerdown', this.handlePointerDown);
    this.input.on('pointermove', this.handlePointerMove);
    this.game.canvas?.addEventListener('contextmenu', this.handleContextMenu);
    this.reticleGraphics = this.add.graphics().setDepth(SNOWBALL_DEPTH).setVisible(false);
    this.reticleHint = this.add
      .text(0, 0, SNOWBALL_HINT_TEXT, {
        fontFamily: "'Anton', sans-serif",
        fontSize: '12px',
        color: '#00BDFF',
        backgroundColor: 'rgba(22,23,25,0.92)',
        padding: { x: 14, y: 8 },
      })
      .setLetterSpacing(2)
      .setOrigin(0.5, 0)
      .setDepth(SNOWBALL_DEPTH)
      .setVisible(false);
    this.registry.events.on(Data.Events.SET_DATA, this.handleRegistrySetData);
    this.registry.events.on(
      Data.Events.CHANGE_DATA_KEY + PLAYER_REGISTRY_KEY,
      this.handleRegistryPlayerChanged,
    );
    // `cleanup` destroys only #14's own Penguins (local and debug).
    this.events.once(Scenes.Events.SHUTDOWN, this.cleanup);

    // The remote Penguins (#28). Phaser destroys them with its display list
    // on shutdown; `detach()` only forgets them, so nothing is destroyed twice.
    this.penguins.attach(placePenguinsIn(this), room.grid.origin, room.walkable);
    this.events.once(Scenes.Events.SHUTDOWN, () => this.penguins.detach());

    this.live = true;
    if (HOOKS_ENABLED) this.publishRoomDebug();
    this.resolveReady();
  }

  update(): void {
    // The local Penguin may still be finishing a walk when aiming starts:
    // keep the preview arc anchored to where it is drawn.
    if (this.aiming && this.reticleTile) this.drawReticle();
    if (HOOKS_ENABLED) this.publishRoomDebug();
  }

  private publishRoomDebug(): void {
    const controller = this.controller;
    exposeRoomDebug({
      roomId: this.roomId,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
      localPenguin: controller
        ? {
            tile: controller.state.tile,
            target: controller.state.target,
            anim: this.currentAnim,
            facing: controller.state.facing,
            moving: controller.isMoving(),
            flipX: this.penguinSprite()?.flipX ?? false,
            lookName: this.currentLook.name,
            lookBody: this.currentLook.body,
            playerId: controller.state.playerId,
          }
        : undefined,
      textureListenerCount: countActiveTextureListeners(this),
      npcArrivedLog: this.npcArrivedLog,
      doorReachedLog: this.doorReachedLog,
      localPenguinMoveLog: this.localPenguinMoveLog,
      comingSoonHint: this.comingSoonHint?.door.label ?? null,
      localPenguinArrivedLog: this.localPenguinArrivedLog,
      restartRoom: () => this.scene.restart(),
      restartCount: this.restartCount,
      penguinCount: this.countPenguinContainers(
        (name) => name !== REMOTE_PENGUIN_NAME && name !== NPC_CONTAINER_NAME,
      ),
      remotePenguinCount: this.countPenguinContainers((name) => name === REMOTE_PENGUIN_NAME),
      remotePenguins: this.penguins.debugRemotePenguins(),
      setRegisteredPlayer: (player) => this.registry.set(PLAYER_REGISTRY_KEY, player),
      spawnDebugPenguin: (tile, look) => this.spawnDebugPenguin(tile, look),
    });
  }

  /** The Penguin's rendered `Sprite`, reached through its `container` (#14 review fix 8's `flipX` check). */
  private penguinSprite(): GameObjects.Sprite | undefined {
    return this.penguin?.container.list.find(
      (child): child is GameObjects.Sprite => child instanceof GameObjects.Sprite,
    );
  }

  /**
   * Penguin `Container`s in the Scene's display list whose name matches
   * (#14 review fix 8's restart-leak check). Remote Penguins (#28) are named
   * `REMOTE_PENGUIN_NAME`; the local and debug Penguins are unnamed; NPCs
   * (#36) are named `NPC_CONTAINER_NAME`, excluded from `penguinCount` the
   * same way remote Penguins are.
   */
  private countPenguinContainers(matches: (name: string) => boolean): number {
    return this.children.list.filter(
      (child) => child instanceof GameObjects.Container && matches(child.name),
    ).length;
  }

  // --- Local Penguin & click-to-move --------------------------------------

  /**
   * Shows (or clears, given `null`) a chat speech bubble above the local
   * Penguin (#44). The local Penguin lives here (#14), not in `penguins`, so
   * this replaces `RoomPenguinView.sayLocal`. Returns `false` while no local
   * Penguin is spawned.
   */
  sayLocal(text: string | null): boolean {
    if (!this.penguin) return false;
    this.penguin.say(text);
    return true;
  }

  /**
   * Plays a #47 Emote pose on the local Penguin immediately, replacing
   * whatever idle/walk anim was showing. Returns `false` while no local
   * Penguin is spawned.
   */
  playEmoteLocal(anim: PenguinAnim): boolean {
    if (!this.penguin) return false;
    this.penguin.play(anim);
    this.currentAnim = anim;
    return true;
  }

  /**
   * Ends a local Emote (#47): if the Penguin is currently mid-step, walking
   * already won (`advanceStep` calls `penguin.walk()` the moment a step
   * starts, visually overriding the Emote pose on its own), so this only
   * re-affirms `WALK`; otherwise it returns to the look's own idle emote.
   * Returns `false` while no local Penguin is spawned.
   */
  clearEmoteLocal(): boolean {
    if (!this.penguin) return false;
    if (this.controller?.isMoving()) {
      this.penguin.walk();
      this.currentAnim = 'WALK';
    } else {
      this.penguin.idle();
      this.currentAnim = this.currentLook.emote;
    }
    return true;
  }

  // --- Snowball mode (#53) ---------------------------------------------------

  /**
   * Turns aiming on or off (#53 D6). While on, clicks throw instead of
   * moving; the reticle appears on the next pointer move. Off hides the
   * reticle, preview arc and cursor hint. `init()` resets it to off, so a
   * Room change always starts outside the mode.
   *
   * Turning aiming *on* also drops any pending NPC-arrival callback (#36
   * round-2 review item 2a): an NPC click queues a walk whose `onArrive`
   * opens its dialog once the Penguin reaches the interaction tile, and
   * SNOWBALL/EMOTE/MAP/PENGUIN/MENU firing mid-walk must not let that dialog
   * open later and steal focus from (and close) whatever overlay the Player
   * just opened -- the Penguin still finishes walking there, it just no
   * longer opens the dialog on arrival.
   */
  setAiming(on: boolean): void {
    this.aiming = on;
    if (on) {
      this.pendingArrival = null;
      if (this.queuedMove) this.queuedMove.onArrive = undefined;
    }
    if (!on) this.cancelAim();
  }

  /** The aimed Tile, or `null` (not aiming, not yet moved, or cancelled): `window.__snowballDebug.reticle`. */
  snowballReticle(): Tile | null {
    return this.reticleTile;
  }

  /** Whether the local Penguin is drawing its snow hat right now (`__snowballDebug.snowHats[own].rendered`). */
  localHasSnowHat(): boolean {
    return this.live && (this.penguin?.hasSnowHat() ?? false);
  }

  private localFeetPoint(): ScreenPoint {
    const container = this.penguin?.container;
    return container ? { x: container.x, y: container.y } : { x: 0, y: 0 };
  }

  /** Snaps the reticle to the pointer's Tile, clamped to the Room grid (walkability not required, #53 D8). */
  private aimAt(pointer: Input.Pointer): Tile | null {
    const room = this.room;
    if (!room) return null;
    const hovered = screenToTile({ x: pointer.x, y: pointer.y }, room.grid.origin);
    this.reticleTile = clampTileToGrid(hovered, room.grid);
    this.drawReticle();
    return this.reticleTile;
  }

  private cancelAim(): void {
    this.reticleTile = null;
    this.reticleGraphics?.clear().setVisible(false);
    this.reticleHint?.setVisible(false);
  }

  private drawReticle(): void {
    const room = this.room;
    const graphics = this.reticleGraphics;
    const tile = this.reticleTile;
    if (!room || !graphics || !tile) return;
    const at = tileToScreen(tile, room.grid.origin);
    const feet = this.localFeetPoint();
    const from = { x: feet.x, y: feet.y - SNOWBALL_CHEST_OFFSET_Y };

    graphics.clear().setVisible(true);
    // Dashed preview arc: every other segment of the same Bezier a throw flies.
    graphics.lineStyle(3, SNOWBALL_WHITE, 0.9);
    for (let i = 0; i < SNOWBALL_PREVIEW_SEGMENTS; i += 2) {
      const a = arcPoint(from, at, i / SNOWBALL_PREVIEW_SEGMENTS);
      const b = arcPoint(from, at, (i + 1) / SNOWBALL_PREVIEW_SEGMENTS);
      graphics.lineBetween(a.x, a.y, b.x, b.y);
    }
    graphics.fillStyle(SNOWBALL_WHITE, 1);
    graphics.fillCircle(from.x, from.y, 6);
    // Reticle: outer ring, soft inner fill, four ticks.
    graphics.lineStyle(3, SNOWBALL_CYAN, 1);
    graphics.strokeEllipse(at.x, at.y, 92, 46);
    graphics.fillStyle(SNOWBALL_CYAN, 0.35);
    graphics.fillEllipse(at.x, at.y, 44, 22);
    graphics.lineBetween(at.x, at.y - 34, at.x, at.y - 48);
    graphics.lineBetween(at.x, at.y + 34, at.x, at.y + 48);
    graphics.lineBetween(at.x - 54, at.y, at.x - 68, at.y);
    graphics.lineBetween(at.x + 54, at.y, at.x + 68, at.y);

    const hint = this.reticleHint;
    if (hint) {
      hint.setPosition(at.x, at.y + SNOWBALL_HINT_OFFSET_Y).setVisible(true);
      graphics.lineStyle(2, SNOWBALL_CYAN, 1);
      graphics.strokeRect(hint.x - hint.width / 2, hint.y, hint.width, hint.height);
    }
  }

  /** A thrown snowball flying `from` (a feet point; drawn from chest height) to `to` over `durationMs` (#53 D2). */
  private drawSnowballArc(
    throwId: string,
    from: ScreenPoint,
    to: ScreenPoint,
    durationMs: number,
  ): void {
    if (!this.live) return;
    this.stopSnowballArc(throwId);
    const start = { x: from.x, y: from.y - SNOWBALL_CHEST_OFFSET_Y };
    const ball = this.add
      .circle(start.x, start.y, 9, SNOWBALL_WHITE)
      .setStrokeStyle(2, SNOWBALL_OUTLINE)
      .setDepth(SNOWBALL_DEPTH);
    const tween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: durationMs,
      onUpdate: (counter: Tweens.Tween) => {
        const point = arcPoint(start, to, counter.getValue() ?? 0);
        ball.setPosition(point.x, point.y);
      },
      onComplete: () => {
        // Landing always shows a splat, on every screen watching the throw.
        this.showSnowballSplat(throwId, to);
      },
    });
    this.snowballArcs.set(throwId, { ball, tween, to });
  }

  private stopSnowballArc(throwId: string): void {
    const arc = this.snowballArcs.get(throwId);
    if (!arc) return;
    this.snowballArcs.delete(throwId);
    arc.tween.stop();
    arc.ball.destroy();
  }

  /** Cuts `throwId`'s arc (if still flying) to one splat at `point`, replacing any splat it already showed. */
  private showSnowballSplat(throwId: string, point: ScreenPoint): void {
    if (!this.live) return;
    this.stopSnowballArc(throwId);
    this.snowballSplats.get(throwId)?.destroy();
    const splat = this.add.graphics().setDepth(SNOWBALL_DEPTH);
    splat.fillStyle(SNOWBALL_WHITE, 1);
    splat.fillEllipse(point.x, point.y, 60, 24);
    splat.fillCircle(point.x - 20, point.y - 8, 6);
    splat.fillCircle(point.x + 18, point.y - 9, 7);
    splat.fillCircle(point.x, point.y - 14, 5);
    this.snowballSplats.set(throwId, splat);
    this.tweens.add({
      targets: splat,
      alpha: 0,
      duration: SNOWBALL_SPLAT_MS,
      onComplete: () => {
        splat.destroy();
        if (this.snowballSplats.get(throwId) === splat) this.snowballSplats.delete(throwId);
      },
    });
  }

  /** Drops every snowball effect and aim (#53 v4 change 10). Phaser destroys the objects themselves on shutdown. */
  private resetSnowballState(): void {
    this.live = false;
    this.aiming = false;
    this.reticleTile = null;
    this.reticleGraphics = null;
    this.reticleHint = null;
    for (const arc of this.snowballArcs.values()) arc.tween.stop();
    this.snowballArcs.clear();
    this.snowballSplats.clear();
  }

  private spawnLocalPenguin(room: RoomDefinition): void {
    const registered = this.registry.get(PLAYER_REGISTRY_KEY) as RegisteredPlayer | undefined;
    const look = resolveRegisteredLook(registered);
    const playerId = resolveRegisteredPlayerId(registered);
    const spawnTile = this.entryTile ?? room.spawnTile;
    const spawnPoint = tileToScreen(spawnTile, room.grid.origin);

    this.controller = createLocalPenguinController(room.walkable, {
      playerId,
      roomId: room.id,
      tile: spawnTile,
    });
    this.currentLook = look;
    this.currentAnim = look.emote;
    this.penguin = createPenguin(this, spawnPoint.x, spawnPoint.y, look);
    this.penguin.container.setDepth(depthForTile(spawnTile));
  }

  /** Re-applies the registered Player's look/id to the already-spawned Penguin (#14 review fixes 1 and 4). */
  private applyRegisteredPlayer(): void {
    const controller = this.controller;
    const registered = this.registry.get(PLAYER_REGISTRY_KEY) as RegisteredPlayer | undefined;
    const look = resolveRegisteredLook(registered);

    this.currentLook = look;
    if (controller) {
      controller.state.playerId = resolveRegisteredPlayerId(registered);
      if (!controller.isMoving()) this.currentAnim = look.emote;
    }
    this.penguin?.setLook(look);
  }

  private onPointerDown(pointer: Input.Pointer, currentlyOver: GameObjects.GameObject[]): void {
    const room = this.room;
    if (!room) return;

    // #53 D8: a right-click while aiming cancels the aim (the reticle and
    // preview hide until the next pointer move) but keeps the mode on;
    // nothing is thrown or moved. Outside the mode it keeps today's behaviour.
    if (pointer.button === 2 && this.aiming) {
      this.cancelAim();
      return;
    }

    // #53 v4 change 2: while aiming, every click throws at the reticle Tile;
    // NPC, door, hotspot and tile clicks are all suppressed.
    if (this.aiming) {
      const target = this.aimAt(pointer);
      if (target) {
        const event: SnowballThrowRequestEvent = { target };
        this.events.emit(SNOWBALL_THROW_EVENT, event);
      }
      return;
    }

    const npcHit = this.npcHitAreas.find((hit) => currentlyOver.includes(hit.object));
    if (npcHit) {
      this.handleNpcClick(npcHit.data, room);
      return;
    }

    const doorHit = this.doorHitAreas.find((hit) => currentlyOver.includes(hit.object));
    if (doorHit) {
      this.handleDoorClick(doorHit.data, room);
      return;
    }

    const hotspotHit = this.hotspotHitAreas.find((hit) => currentlyOver.includes(hit.object));
    if (hotspotHit) {
      this.handleHotspotClick(hotspotHit.data, room);
      return;
    }

    const tile = screenToTile({ x: pointer.x, y: pointer.y }, room.grid.origin);
    this.handleTileClick(tile, room);
  }

  private handleTileClick(tile: Tile, room: RoomDefinition): void {
    this.startMoveTo(nearestWalkable(room.walkable, tile));
  }

  private handleNpcClick(npc: RoomNpcSlot, room: RoomDefinition): void {
    const target = npcInteractionTile(room.walkable, npc);
    this.startMoveTo(target, () => {
      this.npcArrivedLog.push(npc.npcId);
      gameEvents.emit('npc:arrived', { npcId: npc.npcId });
    });
  }

  private handleDoorClick(door: RoomDoor, room: RoomDefinition): void {
    const target = doorApproachTile(room.walkable, door, room.grid.origin);
    this.startMoveTo(target, () => {
      this.doorReachedLog.push(door.label);
      const event: DoorReachedEvent = { door };
      this.events.emit(DOOR_REACHED_EVENT, event);
    });
  }

  /**
   * A non-door clickable target (#16 D5's `hotspots`, e.g. the Igloo's
   * `trophy-case`): opens immediately on click, on the shared `gameEvents`
   * contract rather than the scene-local events doors/NPCs use, since #42's
   * consumer (`main.ts`) lives outside this Scene. Unlike a door or NPC, the
   * Penguin does not walk there first (#42 resolved decision).
   */
  private handleHotspotClick(hotspot: RoomHotspot, room: RoomDefinition): void {
    gameEvents.emit('hotspot:click', { roomId: room.id, hotspotId: hotspot.id });
  }

  /**
   * Starts walking toward `target` immediately, or — mid-walk — queues it
   * rather than snapping the Penguin forward (#14 review fix 3): the queued
   * move is applied from `advanceStep`'s tween `onComplete`, once the
   * current step actually reaches its tile, so walking speed stays a steady
   * 4 tiles/s instead of jumping ahead on every re-route click.
   */
  private startMoveTo(target: Tile, onArrive?: () => void): void {
    const controller = this.controller;
    if (!controller) return;

    if (controller.isMoving()) {
      this.queuedMove = { target, onArrive };
      return;
    }

    this.applyMoveTo(target, onArrive);
  }

  /**
   * Resolves `target` against the Penguin's current tile via
   * `nearestReachable` (#14 review fix 2) and either starts walking there,
   * or stops cleanly: either because the resolved target already *is* the
   * tile the Penguin stands on (review fix 6's own-tile click, and fix 2's
   * case where nothing reachable is any closer to an unreachable target
   * than staying put), or — defensively, since `nearestReachable` only ever
   * returns a tile connected to the Penguin's own tile — because `moveTo`
   * still failed. A plain click resolving to the standing tile logs and
   * emits nothing; `options.continuingWalk` (set only when `advanceStep`'s
   * tween `onComplete` applies a queued move, #43 D1) still logs the move
   * and emits both `LOCAL_PENGUIN_MOVE_EVENT`/`LOCAL_PENGUIN_ARRIVED_EVENT`,
   * since a walk that was genuinely in progress just ended here and remotes
   * need to re-route to stop at this tile.
   */
  private applyMoveTo(
    target: Tile,
    onArrive?: () => void,
    options?: { continuingWalk?: boolean },
  ): void {
    const controller = this.controller;
    const room = this.room;
    if (!controller || !room) return;

    const reachableTarget = nearestReachable(room.walkable, controller.state.tile, target);

    if (tilesEqual(reachableTarget, controller.state.tile)) {
      this.stopCleanly(controller);
      if (options?.continuingWalk) {
        const tile = controller.state.tile;
        const facing = controller.state.facing;
        this.localPenguinMoveLog.push(tile);
        const moveEvent: LocalPenguinMoveEvent = { target: tile };
        this.events.emit(LOCAL_PENGUIN_MOVE_EVENT, moveEvent);
        this.emitArrived(tile, facing);
      }
      // Already standing on an NPC's interaction tile or a door's approach
      // tile: that still counts as arriving, so clicking an NPC you're next
      // to opens its dialog (#36) and clicking the door you're at uses it
      // (#15). An unreachable target that merely resolves to here doesn't.
      if (onArrive && tilesEqual(target, controller.state.tile)) onArrive();
      return;
    }

    const path = controller.moveTo(reachableTarget);
    if (!path) {
      this.stopCleanly(controller);
      return;
    }

    this.pendingArrival = onArrive ?? null;
    this.localPenguinMoveLog.push(reachableTarget);
    const event: LocalPenguinMoveEvent = { target: reachableTarget };
    this.events.emit(LOCAL_PENGUIN_MOVE_EVENT, event);
    this.advanceStep();
  }

  /** Cancels any active path/target and returns the Penguin to idle in place. */
  private stopCleanly(controller: LocalPenguinController): void {
    controller.stop();
    this.penguin?.idle();
    this.currentAnim = this.currentLook.emote;
    this.pendingArrival = null;
  }

  /** Logs and emits `LOCAL_PENGUIN_ARRIVED_EVENT` for an arrival at `tile`/`facing` (#43 D1). */
  private emitArrived(tile: Tile, facing: Facing): void {
    this.localPenguinArrivedLog.push(tile);
    const event: LocalPenguinArrivedEvent = { tile, facing };
    this.events.emit(LOCAL_PENGUIN_ARRIVED_EVENT, event);
  }

  private spawnDebugPenguin(tile: Tile, look: PenguinLook): void {
    const room = this.room;
    if (!room) return;
    const point = tileToScreen(tile, room.grid.origin);
    const debugPenguin = createPenguin(this, point.x, point.y, look);
    debugPenguin.container.setDepth(depthForTile(tile));
    this.debugPenguins.push(debugPenguin);
  }

  private advanceStep(): void {
    const controller = this.controller;
    const penguin = this.penguin;
    const room = this.room;
    if (!controller || !penguin || !room) return;

    const next = controller.nextTile();
    if (!next) {
      penguin.idle();
      this.currentAnim = this.currentLook.emote;
      this.emitArrived(controller.state.tile, controller.state.facing);
      const arrive = this.pendingArrival;
      this.pendingArrival = null;
      arrive?.();
      return;
    }

    const from = controller.state.tile;
    const facing = facingForStep(from, next);
    controller.setFacing(facing);
    penguin.setFacing(facing);
    penguin.walk();
    this.currentAnim = 'WALK';

    const toPoint = tileToScreen(next, room.grid.origin);

    this.activeTween = this.tweens.add({
      targets: penguin.container,
      x: toPoint.x,
      y: toPoint.y,
      duration: TILE_STEP_MS,
      onUpdate: (tween: Tweens.Tween) => {
        const t = tween.progress;
        const fractional: Tile = {
          col: from.col + (next.col - from.col) * t,
          row: from.row + (next.row - from.row) * t,
        };
        penguin.container.setDepth(depthForTile(fractional));
      },
      onComplete: () => {
        this.activeTween = null;
        controller.arriveAtNextTile();

        const queued = this.queuedMove;
        if (queued) {
          this.queuedMove = null;
          this.applyMoveTo(queued.target, queued.onArrive, { continuingWalk: true });
          return;
        }

        this.advanceStep();
      },
    });
  }

  // --- Drawing -------------------------------------------------------------

  /** Walls meet at tile corners, so they use `tileCornerToScreen`, not the floor's tile centres. */
  private drawWalls(room: RoomDefinition): void {
    const { origin, columns, rows } = room.grid;
    const north = tileCornerToScreen({ col: 0, row: 0 }, origin);
    const west = tileCornerToScreen({ col: 0, row: rows }, origin);
    const east = tileCornerToScreen({ col: columns, row: 0 }, origin);

    const graphics = this.add.graphics();
    graphics.fillStyle(WALL_LEFT_COLOR, 1);
    graphics.fillPoints([{ x: west.x, y: 0 }, { x: north.x, y: 0 }, north, west], true);
    graphics.fillStyle(WALL_RIGHT_COLOR, 1);
    graphics.fillPoints([{ x: north.x, y: 0 }, { x: east.x, y: 0 }, east, north], true);
    graphics.setDepth(WALL_DEPTH);
  }

  /**
   * Draws the Room's `background` (#13 D3): the exported design image, sized
   * to the whole 1600x900 stage at the lowest depth, when `kind === 'image'`
   * (preloaded in `preload()`); otherwise the procedural isometric floor.
   */
  private drawBackground(room: RoomDefinition): void {
    const plan = planBackgroundDraw(room.background);
    if (plan.kind === 'image') {
      this.add
        .image(0, 0, plan.key)
        .setOrigin(0, 0)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setDepth(IMAGE_BACKGROUND_DEPTH);
      return;
    }
    this.drawFloor(room);
  }

  /** Floor tiles are drawn around each tile's centre (`tileToScreen`), not its corner. */
  private drawFloor(room: RoomDefinition): void {
    const { origin, columns, rows } = room.grid;
    const graphics = this.add.graphics();
    graphics.setDepth(FLOOR_DEPTH);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        if (room.walkable[row]?.[col] !== true) continue;
        const center = tileToScreen({ col, row }, origin);
        graphics.fillStyle((row + col) % 2 === 0 ? FLOOR_COLOR_A : FLOOR_COLOR_B, 1);
        graphics.fillPoints(
          [
            { x: center.x, y: center.y - TILE_HEIGHT / 2 },
            { x: center.x + TILE_WIDTH / 2, y: center.y },
            { x: center.x, y: center.y + TILE_HEIGHT / 2 },
            { x: center.x - TILE_WIDTH / 2, y: center.y },
          ],
          true,
        );
      }
    }
  }

  /**
   * Over the exported design art (#16 fix 2), the art itself already draws
   * every door sign/doorway, so a door only needs an invisible interactive
   * hit area for its click, not the procedural rectangle-and-label the
   * `procedural` fallback background still draws.
   */
  private drawDoors(room: RoomDefinition): void {
    const isImageBackground = room.background.kind === 'image';
    for (const door of room.doors) {
      const centerX = door.hotspot.x + door.hotspot.width / 2;
      const centerY = door.hotspot.y + door.hotspot.height / 2;

      // Over exported design art the door is already drawn, so the hit area
      // is an invisible Zone (#16). Not an alpha-0 shape: Phaser drops
      // objects that won't render from input hit-testing, so an alpha-0
      // rectangle can never be clicked.
      if (isImageBackground) {
        const zone = this.add
          .zone(centerX, centerY, door.hotspot.width, door.hotspot.height)
          .setDepth(DOOR_DEPTH)
          .setInteractive({ useHandCursor: true });
        this.doorHitAreas.push({ object: zone, data: door });
        continue;
      }

      // Procedural rough art gets the outlined rectangle and label.
      const rect = this.add.rectangle(
        centerX,
        centerY,
        door.hotspot.width,
        door.hotspot.height,
        DOOR_COLOR,
      );
      rect.setDepth(DOOR_DEPTH);
      rect.setInteractive({ useHandCursor: true });
      this.doorHitAreas.push({ object: rect, data: door });
      rect.setStrokeStyle(DOOR_BORDER_WIDTH, DOOR_BORDER_COLOR);
      this.add
        .text(centerX, centerY, door.label, {
          fontFamily: LABEL_FONT_FAMILY,
          fontSize: DOOR_LABEL_FONT_SIZE,
          color: LABEL_TEXT_COLOR,
        })
        .setOrigin(0.5)
        .setDepth(DOOR_LABEL_DEPTH);
    }
  }

  /**
   * A non-door clickable target (#16 D5/#42, e.g. the Igloo's `trophy-case`
   * shelf). Over exported design art the art already draws the fixture, so
   * (like `drawDoors`) this only needs an invisible interactive `Zone`; the
   * `procedural` fallback still gets an outlined rectangle and label.
   */
  private drawHotspots(room: RoomDefinition): void {
    const isImageBackground = room.background.kind === 'image';
    for (const hotspot of room.hotspots ?? []) {
      const centerX = hotspot.rect.x + hotspot.rect.width / 2;
      const centerY = hotspot.rect.y + hotspot.rect.height / 2;

      if (isImageBackground) {
        const zone = this.add
          .zone(centerX, centerY, hotspot.rect.width, hotspot.rect.height)
          .setDepth(HOTSPOT_DEPTH)
          .setInteractive({ useHandCursor: true });
        this.hotspotHitAreas.push({ object: zone, data: hotspot });
        continue;
      }

      const rect = this.add.rectangle(
        centerX,
        centerY,
        hotspot.rect.width,
        hotspot.rect.height,
        HOTSPOT_COLOR,
      );
      rect.setDepth(HOTSPOT_DEPTH);
      rect.setInteractive({ useHandCursor: true });
      this.hotspotHitAreas.push({ object: rect, data: hotspot });
      rect.setStrokeStyle(HOTSPOT_BORDER_WIDTH, HOTSPOT_BORDER_COLOR);
      this.add
        .text(centerX, centerY, hotspot.label, {
          fontFamily: LABEL_FONT_FAMILY,
          fontSize: HOTSPOT_LABEL_FONT_SIZE,
          color: LABEL_TEXT_COLOR,
        })
        .setOrigin(0.5)
        .setDepth(HOTSPOT_LABEL_DEPTH);
    }
  }

  /** Non-interactive decorative placeholders (e.g. a planter, a desk); Furniture is Igloo-only (#16). */
  private drawProps(room: RoomDefinition): void {
    for (const prop of room.props ?? []) {
      const point = tileToScreen(prop.tile, room.grid.origin);
      this.add
        .rectangle(point.x, point.y, PROP_WIDTH, PROP_HEIGHT, PROP_COLOR)
        .setDepth(depthForTile(prop.tile));
    }
  }

  private drawFurniture(room: RoomDefinition): void {
    for (const slot of room.furnitureSlots ?? []) {
      const point = tileToScreen(slot.tile, room.grid.origin);
      this.add
        .rectangle(point.x, point.y, FURNITURE_WIDTH, FURNITURE_HEIGHT, FURNITURE_COLOR)
        .setDepth(depthForTile(slot.tile));
    }
  }

  /**
   * Draws each Room's NPCs (#36 D3/A4, replacing #13's placeholder circle and
   * id label): the NPC's own sprite (figure, name tag, speech bubble) from
   * `src/npcs/npcs.ts`'s data, at the slot's tile, depth-sorted the same way
   * as the local/remote Penguins. A slot naming an id with no `NpcDefinition`
   * is skipped (should never happen once `npcs.ts` covers every slot; #36
   * reports any gap instead of inventing one).
   *
   * The click target stays a separate invisible `Zone` (#14's own
   * `npcHitAreas`/`handleNpcClick` path is unchanged): an alpha-0 shape is
   * excluded from Phaser's input hit-testing, the same trap #16 already
   * worked around for a door drawn over image art.
   */
  private drawNpcs(room: RoomDefinition): void {
    for (const slot of room.npcSlots) {
      const npc = getNpcDefinition(slot.npcId);
      if (!npc) continue;

      const point = tileToScreen(slot.tile, room.grid.origin);
      const depth = depthForTile(slot.tile);

      const npcSprite = createNpcSprite(this, point.x, point.y, npc, depth);
      npcSprite.container.setName(NPC_CONTAINER_NAME);
      this.npcSprites.push(npcSprite);

      const zone = this.add
        .zone(point.x, point.y + NPC_HIT_ZONE_OFFSET_Y, NPC_HIT_ZONE_WIDTH, NPC_HIT_ZONE_HEIGHT)
        .setDepth(depth)
        .setInteractive({ useHandCursor: true });
      this.npcHitAreas.push({ object: zone, data: slot });
    }
  }
}

/**
 * Places #31 Penguins (figure, name tag, idle animation) in `scene`, for
 * `RoomPenguinView`'s remote Penguins. Each is named `REMOTE_PENGUIN_NAME`
 * so the debug hook can count remote and local Penguins apart.
 *
 * `step` (#43) tweens one tile step at `TILE_STEP_MS`, the same pace and
 * `onUpdate` depth-sorting technique the local walk's own tween uses;
 * `moveTo`/`step`/`destroy` all stop any tween already in flight, so a
 * re-route, a Presence snap, or a Room teardown never leaves a stray tween
 * driving a Penguin nobody is walking.
 */
function placePenguinsIn(scene: Scene): PlacePenguin {
  return (look, point, depth, facing) => {
    const penguin = createPenguin(scene, point.x, point.y, look, { facing });
    penguin.container.setName(REMOTE_PENGUIN_NAME);
    penguin.container.setDepth(depth);

    let activeTween: Tweens.Tween | null = null;
    let pendingResolve: (() => void) | null = null;

    function stopActiveStep(): void {
      if (activeTween) {
        activeTween.stop();
        activeTween = null;
      }
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve?.();
    }

    return {
      setLook: (next) => penguin.setLook(next),
      setFacing: (next) => penguin.setFacing(next),
      moveTo: (next, nextDepth) => {
        stopActiveStep();
        penguin.container.setPosition(next.x, next.y);
        penguin.container.setDepth(nextDepth);
      },
      walk: () => penguin.walk(),
      idle: () => penguin.idle(),
      step: (next, durationMs, depthAt) => {
        stopActiveStep();
        return new Promise<void>((resolve) => {
          pendingResolve = resolve;
          activeTween = scene.tweens.add({
            targets: penguin.container,
            x: next.x,
            y: next.y,
            duration: durationMs,
            onUpdate: (tween: Tweens.Tween) => {
              penguin.container.setDepth(depthAt(tween.progress));
            },
            onComplete: () => {
              activeTween = null;
              const resolveFn = pendingResolve;
              pendingResolve = null;
              resolveFn?.();
            },
          });
        });
      },
      say: (text) => penguin.say(text),
      play: (anim) => penguin.play(anim),
      setSnowHat: (on) => penguin.setSnowHat(on),
      hasSnowHat: () => penguin.hasSnowHat(),
      point: () => ({ x: penguin.container.x, y: penguin.container.y }),
      destroy: () => {
        stopActiveStep();
        penguin.destroy();
      },
    };
  };
}
