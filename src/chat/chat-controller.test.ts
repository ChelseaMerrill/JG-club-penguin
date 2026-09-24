import { describe, expect, it } from 'vitest';
import {
  CHAT_BUBBLE_LIFETIME_MS,
  createChatController,
  type ChatBubbleView,
} from './chat-controller';
import { CHAT_RATE_LIMIT_MS } from './chat-rate-gate';

type ChatPayload = { playerId: string; text: string; sentAt: number };
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

/** A fake `ChatRoomChannel`: records sends and lets the test drive incoming events. */
function createFakeChannel() {
  const chatHandlers = new Set<(payload: ChatPayload) => void>();
  const roomChangeHandlers = new Set<RoomChangeHandler>();
  const sendCalls: Array<{ text: string }> = [];
  let sendResult = true;

  return {
    sendCalls,
    setSendResult(result: boolean): void {
      sendResult = result;
    },
    emitChat(payload: ChatPayload): void {
      for (const handler of chatHandlers) handler(payload);
    },
    emitRoomChange(roomId: string | null): void {
      for (const handler of roomChangeHandlers) handler(roomId);
    },
    chatHandlerCount(): number {
      return chatHandlers.size;
    },
    channel: {
      async send(_type: 'chat', payload: { text: string }) {
        sendCalls.push(payload);
        return sendResult;
      },
      on(_type: 'chat', handler: (payload: ChatPayload) => void) {
        chatHandlers.add(handler);
        return () => chatHandlers.delete(handler);
      },
      onRoomChange(handler: RoomChangeHandler) {
        roomChangeHandlers.add(handler);
        return () => roomChangeHandlers.delete(handler);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

/** A fake `ChatBubbleView`: records every `say`/`sayLocal` call in order. */
function createFakeView(): { view: ChatBubbleView; calls: Array<[string, string | null]> } {
  const calls: Array<[string, string | null]> = [];
  return {
    calls,
    view: {
      say(playerId, text) {
        calls.push([playerId, text]);
      },
      sayLocal(text) {
        calls.push(['local', text]);
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

describe('createChatController', () => {
  it('sends the prepared text and shows the local bubble once the send is accepted', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    const controller = createChatController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    const accepted = await controller.send('  hello  ');

    expect(accepted).toBe(true);
    expect(fakeChannel.sendCalls).toEqual([{ text: 'hello' }]);
    expect(calls).toEqual([['local', 'hello']]);
  });

  it('drops whitespace-only input without calling channel.send', async () => {
    const fakeChannel = createFakeChannel();
    const { view } = createFakeView();
    const controller = createChatController({ channel: fakeChannel.channel, view });

    const accepted = await controller.send('   ');

    expect(accepted).toBe(false);
    expect(fakeChannel.sendCalls).toEqual([]);
  });

  it('does not show a local bubble when the channel refuses the send', async () => {
    const fakeChannel = createFakeChannel();
    fakeChannel.setSendResult(false);
    const { view, calls } = createFakeView();
    const controller = createChatController({ channel: fakeChannel.channel, view });

    const accepted = await controller.send('hello');

    expect(accepted).toBe(false);
    expect(calls).toEqual([]);
  });

  it('two sends within 1s deliver one: the second is refused before reaching the channel', async () => {
    const fakeChannel = createFakeChannel();
    const { view } = createFakeView();
    const clock = clockFrom(0);
    const controller = createChatController({ channel: fakeChannel.channel, view, now: clock.now });

    const first = await controller.send('one');
    clock.advance(500);
    const second = await controller.send('two');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(fakeChannel.sendCalls).toEqual([{ text: 'one' }]);
  });

  it('accepts a second send once the rate-limit window has elapsed', async () => {
    const fakeChannel = createFakeChannel();
    const { view } = createFakeView();
    const clock = clockFrom(0);
    const controller = createChatController({ channel: fakeChannel.channel, view, now: clock.now });

    await controller.send('one');
    clock.advance(CHAT_RATE_LIMIT_MS);
    const second = await controller.send('two');

    expect(second).toBe(true);
    expect(fakeChannel.sendCalls).toEqual([{ text: 'one' }, { text: 'two' }]);
  });

  it('renders <script> as a literal string at the send and bubble seam', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const controller = createChatController({ channel: fakeChannel.channel, view });
    const raw = '<script>window.__pwned=1</script>';

    await controller.send(raw);

    expect(fakeChannel.sendCalls).toEqual([{ text: raw }]);
    expect(calls).toEqual([['local', raw]]);
  });

  it('shows an incoming chat broadcast as a remote bubble', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    createChatController({ channel: fakeChannel.channel, view });

    fakeChannel.emitChat({ playerId: 'p2', text: 'hi there', sentAt: 1 });

    expect(calls).toEqual([['p2', 'hi there']]);
  });

  it("receiver drops a sender's second message arriving within 1s of the first", () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const clock = clockFrom(0);
    createChatController({ channel: fakeChannel.channel, view, now: clock.now });

    fakeChannel.emitChat({ playerId: 'p2', text: 'first', sentAt: 0 });
    clock.advance(500);
    fakeChannel.emitChat({ playerId: 'p2', text: 'second', sentAt: 500 });

    expect(calls).toEqual([['p2', 'first']]);
  });

  it('accepts a message arriving after the rate-limit window for that sender', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const clock = clockFrom(0);
    createChatController({ channel: fakeChannel.channel, view, now: clock.now });

    fakeChannel.emitChat({ playerId: 'p2', text: 'first', sentAt: 0 });
    clock.advance(CHAT_RATE_LIMIT_MS);
    fakeChannel.emitChat({ playerId: 'p2', text: 'second', sentAt: CHAT_RATE_LIMIT_MS });

    expect(calls).toEqual([
      ['p2', 'first'],
      ['p2', 'second'],
    ]);
  });

  it('clears a remote bubble once its 5000ms lifetime elapses', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    createChatController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitChat({ playerId: 'p2', text: 'hi', sentAt: 0 });
    expect(timer.scheduled).toHaveLength(1);
    expect(timer.scheduled[0]!.delay).toBe(CHAT_BUBBLE_LIFETIME_MS);
    timer.fireAll();

    expect(calls).toEqual([
      ['p2', 'hi'],
      ['p2', null],
    ]);
  });

  it('a newer message from the same Penguin replaces the older one and resets its timer', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    const clock = clockFrom(0);
    createChatController({
      channel: fakeChannel.channel,
      view,
      now: clock.now,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitChat({ playerId: 'p2', text: 'first', sentAt: 0 });
    expect(timer.scheduled).toHaveLength(1);
    const firstTimerId = timer.scheduled[0]!.id;

    // Past the receiver's own rate-limit window, so the second message isn't
    // itself dropped by the receive gate.
    clock.advance(CHAT_RATE_LIMIT_MS);
    fakeChannel.emitChat({ playerId: 'p2', text: 'second', sentAt: CHAT_RATE_LIMIT_MS });

    expect(timer.scheduled).toHaveLength(1);
    expect(timer.scheduled[0]!.id).not.toBe(firstTimerId);
    expect(calls.at(-1)).toEqual(['p2', 'second']);

    timer.fireAll();
    expect(calls.at(-1)).toEqual(['p2', null]);
  });

  it('Room change clears every bubble and the receive-side gate', async () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    const controller = createChatController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    await controller.send('mine');
    fakeChannel.emitChat({ playerId: 'p2', text: 'theirs', sentAt: 0 });
    calls.length = 0;

    fakeChannel.emitRoomChange('town-center');

    expect(calls).toEqual(
      expect.arrayContaining([
        ['local', null],
        ['p2', null],
      ]),
    );
    expect(timer.scheduled).toEqual([]);
  });

  it('after a Room change, the same sender is no longer rate-gated by its pre-change message', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const clock = clockFrom(0);
    createChatController({ channel: fakeChannel.channel, view, now: clock.now });

    fakeChannel.emitChat({ playerId: 'p2', text: 'first', sentAt: 0 });
    fakeChannel.emitRoomChange('dev-pit');
    fakeChannel.emitChat({ playerId: 'p2', text: 'second', sentAt: 0 });

    expect(calls).toEqual([
      ['p2', 'first'],
      ['p2', null],
      ['p2', 'second'],
    ]);
  });

  it('stop() unsubscribes from the channel and clears every bubble', () => {
    const fakeChannel = createFakeChannel();
    const { view, calls } = createFakeView();
    const timer = createManualTimer();
    const controller = createChatController({
      channel: fakeChannel.channel,
      view,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout,
    });

    fakeChannel.emitChat({ playerId: 'p2', text: 'hi', sentAt: 0 });
    calls.length = 0;

    controller.stop();

    expect(calls).toEqual([['p2', null]]);
    expect(fakeChannel.chatHandlerCount()).toBe(0);

    fakeChannel.emitChat({ playerId: 'p2', text: 'after stop', sentAt: 0 });
    expect(calls).toEqual([['p2', null]]);
  });
});
