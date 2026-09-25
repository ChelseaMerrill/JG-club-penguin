import { describe, expect, it } from 'vitest';
import { EMOTE_DURATION_MS } from '../contracts';
import {
  createEmoteController,
  type EmotePenguinView,
  type EmoteRoomChannel,
} from './emote-controller';
import { EMOTE_RATE_LIMIT_MS } from './emote-rate-gate';

type EmotePayload = { playerId: string; emoteId: string };
type RoomChangeHandler = (roomId: string | null) => void;

/** A manually-driven fake timer (no real wall-clock or vitest fake-timer interplay). */
function createManualTimer() {
  let nextId = 1;
  const scheduled: Array<{ id: number; delay: number; cb: () => void }> = [];
  return {
    scheduled,
    setTimeout: ((cb: () => void, delay?: number) => {
      const id = nextId++;
      scheduled.push({ id, delay: delay ?? 0, cb });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: ((id: unknown) => {
      const index = scheduled.findIndex((entry) => entry.id === id);
      if (index !== -1) scheduled.splice(index, 1);
    }) as typeof clearTimeout,
    fireAll(): void {
      const due = scheduled.splice(0, scheduled.length);
      for (const entry of due) entry.cb();
    },
  };
}

/** A fake `EmoteRoomChannel`: records sends and lets the test drive incoming events. */
function createFakeChannel() {
  const emoteHandlers = new Set<(payload: EmotePayload) => void>();
  const roomChangeHandlers = new Set<RoomChangeHandler>();
  const sendCalls: Array<{ emoteId: string }> = [];
  let sendResult = true;

  return {
    sendCalls,
    setSendResult(result: boolean): void {
      sendResult = result;
    },
    emitEmote(payload: EmotePayload): void {
      for (const handler of emoteHandlers) handler(payload);
    },
    emitRoomChange(roomId: string | null): void {
      for (const handler of roomChangeHandlers) handler(roomId);
    },
    channel: {
      async send(_type: 'emote', payload: { emoteId: string }) {
        sendCalls.push(payload);
        return sendResult;
      },
      on(_type: 'emote', handler: (payload: EmotePayload) => void) {
        emoteHandlers.add(handler);
        return () => emoteHandlers.delete(handler);
      },
      onRoomChange(handler: RoomChangeHandler) {
        roomChangeHandlers.add(handler);
        return () => roomChangeHandlers.delete(handler);
      },
    } as unknown as EmoteRoomChannel,
  };
}

/** A fake `EmotePenguinView`: records every `play`/`playLocal` call in order. */
function createFakeView(): { view: EmotePenguinView; calls: Array<[string, string | null]> } {
  const calls: Array<[string, string | null]> = [];
  return {
    calls,
    view: {
      play(playerId, emoteId) {
        calls.push([playerId, emoteId]);
        return true;
      },
      playLocal(emoteId) {
        calls.push(['local', emoteId]);
        return true;
      },
    },
  };
}

function clockFrom(start = 0): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('createEmoteController', () => {
  it('plays the Emote on the local Penguin immediately and sends it on the channel', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const controller = createEmoteController({ channel: fakeChannel.channel, view });

    const accepted = await controller.send('wave');

    expect(accepted).toBe(true);
    expect(fakeChannel.sendCalls).toEqual([{ emoteId: 'wave' }]);
    expect(calls).toEqual([['local', 'wave']]);
  });

  it('still plays locally even when the channel refuses the send (no Room joined, e.g. #47 Igloo D)', async () => {
    const fakeChannel = createFakeChannel();
    fakeChannel.setSendResult(false);
    const { view, calls } = createFakeView();
    const controller = createEmoteController({ channel: fakeChannel.channel, view });

    const accepted = await controller.send('wave');

    expect(accepted).toBe(false);
    expect(calls).toEqual([['local', 'wave']]);
  });

  it('two picks within 500ms: the second is ignored entirely (no local play, no send)', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const clock = clockFrom(0);
    const controller = createEmoteController({
      channel: fakeChannel.channel,
      view,
      now: clock.now,
    });

    const first = await controller.send('wave');
    clock.advance(EMOTE_RATE_LIMIT_MS - 1);
    const second = await controller.send('dance');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(fakeChannel.sendCalls).toEqual([{ emoteId: 'wave' }]);
    expect(calls).toEqual([['local', 'wave']]);
  });

  it('accepts a second pick once the rate-limit window has elapsed', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const clock = clockFrom(0);
    const controller = createEmoteController({
      channel: fakeChannel.channel,
      view,
      now: clock.now,
    });

    await controller.send('wave');
    clock.advance(EMOTE_RATE_LIMIT_MS);
    const second = await controller.send('dance');

    expect(second).toBe(true);
    expect(calls).toEqual([
      ['local', 'wave'],
      ['local', 'dance'],
    ]);
  });

  it('shows an incoming emote broadcast on a remote Penguin', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    createEmoteController({ channel: fakeChannel.channel, view });

    fakeChannel.emitEmote({ playerId: 'p2', emoteId: 'brb' });

    expect(calls).toEqual([['p2', 'brb']]);
  });

  it('clears the local Emote once its 2000ms duration elapses', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    const controller = createEmoteController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    await controller.send('sit');
    expect(timer.scheduled).toHaveLength(1);
    expect(timer.scheduled[0]!.delay).toBe(EMOTE_DURATION_MS);
    timer.fireAll();

    expect(calls).toEqual([
      ['local', 'sit'],
      ['local', null],
    ]);
  });

  it('clears a remote Emote once its 2000ms duration elapses', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    createEmoteController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitEmote({ playerId: 'p2', emoteId: 'jg-flash' });
    timer.fireAll();

    expect(calls).toEqual([
      ['p2', 'jg-flash'],
      ['p2', null],
    ]);
  });

  it('a newer Emote from the same Penguin replaces the running one and resets its timer', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    createEmoteController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitEmote({ playerId: 'p2', emoteId: 'wave' });
    expect(timer.scheduled).toHaveLength(1);
    const firstTimerId = timer.scheduled[0]!.id;

    fakeChannel.emitEmote({ playerId: 'p2', emoteId: 'ship-it' });

    expect(timer.scheduled).toHaveLength(1);
    expect(timer.scheduled[0]!.id).not.toBe(firstTimerId);
    expect(calls.at(-1)).toEqual(['p2', 'ship-it']);

    timer.fireAll();
    expect(calls.at(-1)).toEqual(['p2', null]);
  });

  it('Room change clears every active Emote and its timers', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    const controller = createEmoteController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    await controller.send('wave');
    fakeChannel.emitEmote({ playerId: 'p2', emoteId: 'brb' });
    calls.length = 0;

    fakeChannel.emitRoomChange('dev-pit');

    expect(calls).toEqual(
      expect.arrayContaining([
        ['local', null],
        ['p2', null],
      ]),
    );
    expect(timer.scheduled).toEqual([]);
  });

  it('after a Room change, the sender-side rate gate is not itself reset (mirrors ChatController)', async () => {
    const fakeChannel = createFakeChannel();
    const { view } = createFakeView();
    const clock = clockFrom(0);
    const controller = createEmoteController({
      channel: fakeChannel.channel,
      view,
      now: clock.now,
    });

    await controller.send('wave');
    fakeChannel.emitRoomChange('dev-pit');
    const secondImmediately = await controller.send('dance');

    expect(secondImmediately).toBe(false);
  });

  it('stop() unsubscribes from the channel and clears every active Emote', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    const controller = createEmoteController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    await controller.send('wave');
    calls.length = 0;

    controller.stop();

    expect(calls).toEqual([['local', null]]);

    fakeChannel.emitEmote({ playerId: 'p2', emoteId: 'brb' });
    expect(calls).toEqual([['local', null]]);
  });

  it('send() after stop() resolves false without playing or sending', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const controller = createEmoteController({ channel: fakeChannel.channel, view });

    controller.stop();
    const accepted = await controller.send('wave');

    expect(accepted).toBe(false);
    expect(fakeChannel.sendCalls).toEqual([]);
    expect(calls).toEqual([]);
  });
});
