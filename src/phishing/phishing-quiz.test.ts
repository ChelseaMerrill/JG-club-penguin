// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlayManager, type OverlayManager } from '../ui/hud/overlay-manager';
import type { PhishingAnswerResult, PhishingChallenge, PhishingChoice } from './phishing-client';
import { createPhishingQuiz, PHISHING_QUIZ_OVERLAY_ID, type PhishingQuiz } from './phishing-quiz';

const CHALLENGE: PhishingChallenge = {
  challengeId: 'c-1',
  questionId: 'links',
  category: 'LINKS',
  prompt: 'Before clicking a link in an email, the safest first step is to:',
  choices: ['Click it quickly.', 'Hover over it.', 'Check the logo.', 'Use your phone.'],
  secondsLeft: 20,
  mode: 'guard',
};

function result(overrides: Partial<PhishingAnswerResult> = {}): PhishingAnswerResult {
  return {
    correct: true,
    explanation: 'Hovering shows where the link really goes.',
    tokensAwarded: 10,
    balance: 110,
    locked: false,
    bypassCount: 0,
    trainingCorrect: 0,
    streak: 1,
    dailyCorrect: 1,
    passedGuardWindow: true,
    badgesEarned: [],
    ...overrides,
  };
}

let quiz: PhishingQuiz | undefined;
let overlays: OverlayManager | undefined;

function setup(answerWith: (choice: PhishingChoice) => PhishingAnswerResult = () => result()) {
  const root = document.createElement('div');
  document.body.append(root);
  overlays = createOverlayManager();
  const start = vi.fn(() => Promise.resolve(CHALLENGE));
  const answer = vi.fn((_id: string, choice: PhishingChoice) =>
    Promise.resolve(answerWith(choice)),
  );
  quiz = createPhishingQuiz(root, { overlays, start, answer });
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector(selector) as T;
  const button = (label: string) =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label) as
      HTMLButtonElement | undefined;
  return { root, start, answer, q, button, overlays };
}

/** Opens the quiz and starts the question (HOW TO PLAY, then START QUIZ). */
async function openQuestion(ctx: ReturnType<typeof setup>): Promise<void> {
  quiz!.open();
  ctx.button('START QUIZ')!.click();
  await vi.advanceTimersByTimeAsync(0);
}

function key(k: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  quiz?.destroy();
  overlays?.destroy();
  quiz = undefined;
  overlays = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('createPhishingQuiz', () => {
  it('opens on HOW TO PLAY in the overlay slot, without starting a question until START QUIZ', async () => {
    const ctx = setup();
    quiz!.open();

    expect(ctx.q('.phishing-quiz').hidden).toBe(false);
    expect(ctx.overlays.current()).toBe(PHISHING_QUIZ_OVERLAY_ID);
    expect(ctx.q('.phishing-quiz__howto').hidden).toBe(false);
    expect(ctx.start).not.toHaveBeenCalled();
    expect(ctx.root.querySelector('img[alt*="logo" i]')).toBeNull();

    ctx.button('START QUIZ')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.start).toHaveBeenCalledTimes(1);
    expect(ctx.q('.phishing-quiz__prompt').textContent).toBe(CHALLENGE.prompt);
    expect(ctx.q('.phishing-quiz__play .phishing-quiz__kicker').textContent).toBe(
      'QUESTION #1 · LINKS',
    );
    expect(
      Array.from(ctx.root.querySelectorAll('.phishing-quiz__choice-key')).map((k) => k.textContent),
    ).toEqual(['A', 'B', 'C', 'D']);
    expect(ctx.q('.phishing-quiz__time').textContent).toBe('20s');
  });

  it('answers with a click, then shows the verdict and explanation, then the result', async () => {
    const ctx = setup();
    await openQuestion(ctx);

    ctx.root.querySelectorAll<HTMLButtonElement>('.phishing-quiz__choice')[1].click();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.answer).toHaveBeenCalledWith('c-1', 1);
    expect(ctx.q('.phishing-quiz__explain').textContent).toBe(
      'Correct. Hovering shows where the link really goes.',
    );
    const picked = ctx.root.querySelectorAll('.phishing-quiz__choice')[1];
    expect(picked.classList.contains('phishing-quiz__choice--correct')).toBe(true);

    ctx.button('CONTINUE')!.click();
    expect(ctx.q('.phishing-quiz__done').hidden).toBe(false);
    expect(ctx.q('.phishing-quiz__done-kicker').textContent).toBe('DOOR UNLOCKED');
    expect(ctx.q('.phishing-quiz__result-title').textContent).toBe('YOU MAY PASS');
    expect(ctx.q('.phishing-quiz__result-tokens').textContent).toBe('+10');
    expect(ctx.q('.phishing-quiz__result-streak').textContent).toBe('1 / 10');

    ctx.button('BACK TO THE ROOM')!.click();
    expect(ctx.q('.phishing-quiz').hidden).toBe(true);
    expect(ctx.overlays.current()).toBeNull();
  });

  it('answers with the keys A-D and 1-4, once per question', async () => {
    const ctx = setup(() => result());
    await openQuestion(ctx);
    key('c');
    key('A');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.answer).toHaveBeenCalledTimes(1);
    expect(ctx.answer).toHaveBeenCalledWith('c-1', 2);

    key('Enter');
    key('Enter');
    expect(ctx.q('.phishing-quiz').hidden).toBe(true);

    await openQuestion(ctx);
    key('4');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.answer).toHaveBeenLastCalledWith('c-1', 3);
  });

  it('shows a wrong answer as wrong, never revealing which choice was right, and says "Wrong. Try again."', async () => {
    const ctx = setup(() =>
      result({ correct: false, tokensAwarded: 0, streak: 0, passedGuardWindow: false }),
    );
    await openQuestion(ctx);
    ctx.root.querySelectorAll<HTMLButtonElement>('.phishing-quiz__choice')[0].click();
    await vi.advanceTimersByTimeAsync(0);

    const choices = Array.from(ctx.root.querySelectorAll('.phishing-quiz__choice'));
    expect(choices[0].classList.contains('phishing-quiz__choice--wrong')).toBe(true);
    expect(ctx.root.querySelectorAll('.phishing-quiz__choice--correct')).toHaveLength(0);
    expect(ctx.q('.phishing-quiz__explain').textContent).toMatch(/^Not quite\. /);

    ctx.button('CONTINUE')!.click();
    expect(ctx.q('.phishing-quiz__done-kicker').textContent).toBe('DOOR STILL LOCKED');
    expect(ctx.q('.phishing-quiz__result-title').textContent).toBe('HOOKED');
    expect(ctx.q('.phishing-quiz__result-line').textContent).toBe('Wrong. Try again.');
    expect(ctx.q('.phishing-quiz__result-tokens').textContent).toBe('+0');
  });

  it('drains the 20 s timer bar and answers null (a timeout) when it runs out', async () => {
    const ctx = setup(() => result({ correct: false, tokensAwarded: 0, streak: 0 }));
    await openQuestion(ctx);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ctx.q('.phishing-quiz__timer-fill').style.width).toBe('50%');
    expect(ctx.q('.phishing-quiz__time').textContent).toBe('10s');
    expect(ctx.answer).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_100);
    expect(ctx.answer).toHaveBeenCalledWith('c-1', null);
    expect(ctx.q('.phishing-quiz__explain').textContent).toMatch(/^Out of time\. /);

    // A late key press changes nothing.
    key('B');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.answer).toHaveBeenCalledTimes(1);
  });

  it('gives up (answers null) when closed mid-question with Escape', async () => {
    const ctx = setup(() => result({ correct: false }));
    await openQuestion(ctx);
    key('Escape');
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.answer).toHaveBeenCalledWith('c-1', null);
    expect(ctx.q('.phishing-quiz').hidden).toBe(true);
  });

  it('shows Security Training progress and the Phish Fry Badge on the result', async () => {
    const ctx = setup(() =>
      result({
        locked: true,
        trainingCorrect: 2,
        bypassCount: 5,
        passedGuardWindow: false,
        streak: 10,
        badgesEarned: ['phish-fry'],
      }),
    );
    quiz!.open();
    ctx.button('START QUIZ')!.click();
    await vi.advanceTimersByTimeAsync(0);
    key('b');
    await vi.advanceTimersByTimeAsync(0);
    ctx.button('CONTINUE')!.click();

    expect(ctx.q('.phishing-quiz__done-kicker').textContent).toBe('SECURITY TRAINING · 2 / 3');
    expect(ctx.q('.phishing-quiz__badge').hidden).toBe(false);
    expect(ctx.q('.phishing-quiz__badge').textContent).toContain('Badge unlocked: Phish Fry');
  });

  it('shows the unlock once training is complete', async () => {
    const ctx = setup(() =>
      result({ locked: false, trainingCorrect: 0, passedGuardWindow: false }),
    );
    // Started while locked out: a training question.
    ctx.start.mockResolvedValue({ ...CHALLENGE, mode: 'training' });
    await openQuestion(ctx);
    key('b');
    await vi.advanceTimersByTimeAsync(0);
    ctx.button('CONTINUE')!.click();

    expect(ctx.q('.phishing-quiz__done-kicker').textContent).toBe(
      'SECURITY TRAINING COMPLETE · MAP UNLOCKED',
    );
  });
});
