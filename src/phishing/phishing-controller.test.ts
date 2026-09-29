import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmitter } from '../contracts/emitter';
import type { GameEventMap, RoomId } from '../contracts';
import { createFakePhishingClient } from './fake-phishing-client';
import type { RoomGuard } from './guard-placement';
import { createPhishingController } from './phishing-controller';
import type { PhishingChoice, PhishingState } from './phishing-client';

/** 1970-01-01 00:00 UTC + 0 s: post 0, Town Center's THE ICEBOX door. */
const TOWN_CENTER_WINDOW = 0;

function setup(options: { roomId?: RoomId; startMs?: number } = {}) {
  let nowMs = options.startMs ?? TOWN_CENTER_WINDOW + 60_000;
  let roomId: RoomId | null = options.roomId ?? 'town-center';
  const fake = createFakePhishingClient({ now: () => nowMs, random: () => 0 });
  const guards: (RoomGuard | null)[] = [];
  const mapLocked: boolean[] = [];
  const banners: (PhishingState | null)[] = [];
  const emitter = createEmitter<GameEventMap>();
  const tokens = vi.fn();
  const badges = vi.fn();
  emitter.on('tokens:changed', tokens);
  emitter.on('badge:earned', badges);
  const controller = createPhishingController({
    client: () => fake.client,
    scene: { setGuard: (guard) => guards.push(guard) },
    currentRoomId: () => roomId,
    hud: { setMapLocked: (locked) => mapLocked.push(locked) },
    banner: { render: (state) => banners.push(state) },
    emitter,
  });
  return {
    fake,
    controller,
    tokens,
    badges,
    guard: () => guards.at(-1),
    mapLocked: () => mapLocked.at(-1),
    banner: () => banners.at(-1),
    enter(next: RoomId) {
      roomId = next;
      controller.roomEntered();
    },
    setNow(ms: number) {
      nowMs = ms;
    },
  };
}

type Ctx = ReturnType<typeof setup>;

async function answer(ctx: Ctx, how: 'correct' | 'wrong' | 'timeout') {
  const challenge = await ctx.controller.startChallenge();
  const right = ctx.fake.controls.correctChoiceFor(challenge.challengeId)!;
  const choice: PhishingChoice =
    how === 'correct' ? right : how === 'wrong' ? (((right + 1) % 4) as PhishingChoice) : null;
  return ctx.controller.answer(challenge.challengeId, choice);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPhishingController', () => {
  it('stands Anthony at the scheduled door, shut, in that Room only', async () => {
    const ctx = setup();
    await ctx.controller.start();

    expect(ctx.guard()).toEqual({
      roomId: 'town-center',
      npcId: 'anthony',
      doorLabel: 'THE ICEBOX',
      blocking: true,
    });
    expect(ctx.mapLocked()).toBe(false);

    ctx.enter('dev-pit');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.guard()).toBeNull();
  });

  it('opens the door for a correct answer and pays through tokens:changed; a wrong one keeps it shut', async () => {
    const ctx = setup();
    await ctx.controller.start();

    await answer(ctx, 'wrong');
    expect(ctx.guard()).toMatchObject({ doorLabel: 'THE ICEBOX', blocking: true });
    expect(ctx.tokens).toHaveBeenLastCalledWith({ balance: 0 });

    await answer(ctx, 'correct');
    expect(ctx.guard()).toMatchObject({ doorLabel: 'THE ICEBOX', blocking: false });
    expect(ctx.tokens).toHaveBeenLastCalledWith({ balance: 10 });
  });

  it('announces Phish Fry once, through badge:earned', async () => {
    const ctx = setup();
    await ctx.controller.start();
    for (let i = 0; i < 11; i += 1) await answer(ctx, 'correct');

    expect(ctx.badges).toHaveBeenCalledTimes(1);
    expect(ctx.badges).toHaveBeenCalledWith({ badgeId: 'phish-fry' });
  });

  it('locks the Map after 5 Map bypasses, shows the banner and Anthony next to the Player, and 3 correct unlock it', async () => {
    const ctx = setup();
    await ctx.controller.start();
    await answer(ctx, 'wrong');

    for (let i = 0; i < 5; i += 1) {
      await ctx.controller.mapUsed('town-center');
      ctx.enter('dev-pit');
      await vi.advanceTimersByTimeAsync(0);
      ctx.enter('town-center');
      await vi.advanceTimersByTimeAsync(0);
    }
    ctx.enter('dev-pit');
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.mapLocked()).toBe(true);
    expect(ctx.banner()).toMatchObject({ locked: true, trainingCorrect: 0 });
    expect(ctx.guard()).toEqual({
      roomId: 'dev-pit',
      npcId: 'anthony',
      doorLabel: null,
      blocking: false,
    });

    await answer(ctx, 'correct');
    expect(ctx.banner()).toMatchObject({ locked: true, trainingCorrect: 1 });
    await answer(ctx, 'correct');
    await answer(ctx, 'correct');
    expect(ctx.mapLocked()).toBe(false);
    expect(ctx.banner()).toMatchObject({ locked: false });
    expect(ctx.guard()).toBeNull();
  });

  it('rehydrates the lockout from the server on the next Session (a reload)', async () => {
    const ctx = setup();
    await ctx.controller.start();
    await answer(ctx, 'timeout');
    for (let i = 0; i < 5; i += 1) await ctx.controller.mapUsed('town-center');
    ctx.controller.stop();
    expect(ctx.mapLocked()).toBe(false);
    expect(ctx.guard()).toBeNull();

    await ctx.controller.start();
    expect(ctx.mapLocked()).toBe(true);
    expect(ctx.banner()).toMatchObject({ locked: true });
  });

  it('moves Anthony when the guard window ends', async () => {
    const ctx = setup();
    await ctx.controller.start();
    expect(ctx.guard()).toMatchObject({ roomId: 'town-center' });

    // The window ends 540 s after this start; post 1 is Dev Pit's THE ICEBOX.
    ctx.setNow(600_000 + 1_000);
    await vi.advanceTimersByTimeAsync(540_500);
    expect(ctx.guard()).toBeNull();

    ctx.enter('dev-pit');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.guard()).toMatchObject({
      roomId: 'dev-pit',
      doorLabel: 'THE ICEBOX',
      blocking: true,
    });
  });
});
