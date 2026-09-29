import { renderNpcSvg } from '../game/npcs/render-npc-svg';
import { NPCS } from '../npcs/npcs';
import type { OverlayManager } from '../ui/hud/overlay-manager';
import {
  PHISH_FRY_STREAK,
  SECURITY_TRAINING_REQUIRED,
  type PhishingAnswerResult,
  type PhishingChallenge,
  type PhishingChoice,
} from './phishing-client';
import './phishing-quiz.css';

/** The id the quiz registers with `hud.overlays` (#146). */
export const PHISHING_QUIZ_OVERLAY_ID = 'phishing-quiz';

const KEYS = ['A', 'B', 'C', 'D'] as const;
const TICK_MS = 100;
/** Under this many seconds the timer bar turns white, as the design does. */
const TIME_WARNING_S = 6;

const CORRECT_LINES = [
  'Correct. Suspicious of you, in a good way.',
  'Yes. You have been paying attention.',
  'Right. Reel it in.',
];
const WRONG_LINES = [
  'Nope. That is how they get you.',
  'Wrong. Do not feel bad. Feel alert.',
  'Incorrect. Consider this your training.',
];

export interface PhishingQuizDeps {
  overlays: OverlayManager;
  /** Starts a challenge on the server (`start_phishing_challenge`). */
  start(): Promise<PhishingChallenge>;
  /** Scores it on the server (`answer_phishing_question`); `null` is a timeout. */
  answer(challengeId: string, choice: PhishingChoice): Promise<PhishingAnswerResult>;
}

export interface PhishingQuiz {
  /** Opens on HOW TO PLAY; START QUIZ asks the server for a question. */
  open(): void;
  isOpen(): boolean;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** Anthony's figure as an image, for the quiz's portrait. */
function anthonyPortrait(): HTMLImageElement {
  const img = el('img', 'phishing-quiz__portrait');
  img.alt = '';
  const anthony = NPCS.anthony;
  if (anthony.kind === 'human') {
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      renderNpcSvg(anthony.figure, { idPrefix: 'phishing-quiz' }),
    )}`;
  }
  return img;
}

type Phase = 'howto' | 'loading' | 'play' | 'done' | 'error';

/**
 * The Phishing Quiz overlay (#146), ported from `design/Minigame Phishing
 * Quiz.dc.html` without its vendor branding: HOW TO PLAY, then one question
 * with a 20 s timer bar and A-D choices (click, or the keys A-D / 1-4),
 * Anthony's explanation after the answer, then the result. Every answer is
 * scored by the server; the correct choice is never known here, so a wrong
 * answer marks only the Player's own pick. Closing mid-question (GIVE UP,
 * Escape) answers it as a timeout.
 */
export function createPhishingQuiz(root: HTMLElement, deps: PhishingQuizDeps): PhishingQuiz {
  const overlay = el('div', 'phishing-quiz');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Phishing Quiz');

  // HOW TO PLAY
  const howto = el('section', 'phishing-quiz__panel phishing-quiz__howto');
  const howtoHeader = el('div', 'phishing-quiz__header');
  const howtoTitles = el('div', 'phishing-quiz__titles');
  howtoTitles.append(
    el('div', 'phishing-quiz__title', 'HOW TO PLAY'),
    el('div', 'phishing-quiz__kicker', 'PHISHING QUIZ · 1 QUESTION PER BUMP · 20 SECONDS'),
  );
  howtoHeader.append(howtoTitles);
  const steps = el('div', 'phishing-quiz__steps');
  const stepCopy: [string, string][] = [
    [
      'READ THE SCENARIO',
      'Each question is a real security awareness scenario: phishing emails, gift-card scams, passwords, USB drives, tailgating. Anthony never repeats one until you have seen them all.',
    ],
    [
      'PICK A–D',
      'Click an answer or press its letter. The timer bar drains in 20 seconds; no answer counts as wrong. Anthony explains every answer, right or wrong.',
    ],
    [
      'PASS THE DOOR',
      'Get it right and you pass with +10 tokens; 10 in a row earns the Phish Fry badge. Miss and Anthony blocks the door; walk away and bump him again for a new question.',
    ],
  ];
  stepCopy.forEach(([title, body], index) => {
    const step = el('div', 'phishing-quiz__step');
    step.append(
      el('div', 'phishing-quiz__step-number', String(index + 1)),
      el('div', 'phishing-quiz__step-title', title),
      el('div', 'phishing-quiz__step-body', body),
    );
    steps.append(step);
  });
  const howtoFooter = el('div', 'phishing-quiz__footer');
  const howtoButtons = el('div', 'phishing-quiz__buttons');
  howtoButtons.append(
    button('phishing-quiz__button phishing-quiz__button--secondary', 'BACK', () => close()),
    button('phishing-quiz__button', 'START QUIZ', () => void startQuestion()),
  );
  howtoFooter.append(
    el(
      'div',
      'phishing-quiz__hint',
      'Anthony: "Reel talk: if it feels urgent, it\'s probably bait."',
    ),
    howtoButtons,
  );
  howto.append(howtoHeader, steps, howtoFooter);

  // The question
  const play = el('section', 'phishing-quiz__panel phishing-quiz__play');
  const playHeader = el('div', 'phishing-quiz__header');
  const playTitles = el('div', 'phishing-quiz__titles');
  const kicker = el('div', 'phishing-quiz__kicker');
  playTitles.append(el('div', 'phishing-quiz__title', 'PHISHING QUIZ'), kicker);
  const timeBlock = el('div', 'phishing-quiz__stat');
  const timeValue = el('div', 'phishing-quiz__time');
  timeBlock.append(el('div', 'phishing-quiz__stat-label', 'TIME'), timeValue);
  playHeader.append(playTitles, timeBlock);
  const timer = el('div', 'phishing-quiz__timer');
  const timerFill = el('div', 'phishing-quiz__timer-fill');
  timer.append(timerFill);
  const body = el('div', 'phishing-quiz__body');
  const anthonyColumn = el('div', 'phishing-quiz__anthony');
  const antLine = el('div', 'phishing-quiz__ant-line');
  antLine.setAttribute('aria-live', 'polite');
  anthonyColumn.append(anthonyPortrait(), el('div', 'phishing-quiz__ant-name', 'ANTHONY'), antLine);
  const questionColumn = el('div', 'phishing-quiz__question');
  const prompt = el('div', 'phishing-quiz__prompt');
  const choiceList = el('div', 'phishing-quiz__choices');
  const choiceButtons = KEYS.map((letter, index) => {
    const choice = button('phishing-quiz__choice', '', () => void submit(index as PhishingChoice));
    const keyEl = el('span', 'phishing-quiz__choice-key', letter);
    const text = el('span', 'phishing-quiz__choice-text');
    choice.append(keyEl, text);
    choiceList.append(choice);
    return { choice, text };
  });
  const explainRow = el('div', 'phishing-quiz__explain-row');
  explainRow.hidden = true;
  const explain = el('div', 'phishing-quiz__explain');
  explainRow.append(
    explain,
    button('phishing-quiz__button', 'CONTINUE', () => showDone()),
  );
  questionColumn.append(prompt, choiceList, explainRow);
  body.append(anthonyColumn, questionColumn);
  const playFooter = el('div', 'phishing-quiz__footer');
  const playButtons = el('div', 'phishing-quiz__buttons');
  playButtons.append(
    button('phishing-quiz__button phishing-quiz__button--secondary', 'GIVE UP', () => close()),
  );
  playFooter.append(
    el('div', 'phishing-quiz__hint', 'Press A–D to answer · Enter to continue'),
    playButtons,
  );
  play.append(playHeader, timer, body, playFooter);

  // The result
  const done = el('section', 'phishing-quiz__card phishing-quiz__done');
  const doneKicker = el('div', 'phishing-quiz__done-kicker');
  const resultTitle = el('div', 'phishing-quiz__result-title');
  const stats = el('div', 'phishing-quiz__stats');
  const resultLabel = el('div', 'phishing-quiz__result-value');
  const resultTokens = el('div', 'phishing-quiz__result-value phishing-quiz__result-tokens');
  const resultStreak = el('div', 'phishing-quiz__result-value phishing-quiz__result-streak');
  for (const [label, value] of [
    ['RESULT', resultLabel],
    ['TOKENS', resultTokens],
    ['PHISH FRY STREAK', resultStreak],
  ] as const) {
    const stat = el('div', 'phishing-quiz__stat');
    stat.append(el('div', 'phishing-quiz__stat-label', label), value);
    stats.append(stat);
  }
  const badge = el('div', 'phishing-quiz__badge');
  badge.hidden = true;
  const badgeText = el('div', 'phishing-quiz__badge-text');
  badgeText.append(
    el('div', 'phishing-quiz__badge-name', 'Badge unlocked: Phish Fry'),
    el('div', 'phishing-quiz__badge-sub', 'ADDED TO YOUR TROPHY CASE'),
  );
  badge.append(el('div', 'phishing-quiz__badge-hex', 'JG'), badgeText);
  const resultQuote = el('div', 'phishing-quiz__result-quote');
  const resultLine = el('span', 'phishing-quiz__result-line');
  resultQuote.append('Anthony: "', resultLine, '"');
  const doneButtons = el('div', 'phishing-quiz__buttons');
  doneButtons.append(button('phishing-quiz__button', 'BACK TO THE ROOM', () => close()));
  done.append(doneKicker, resultTitle, stats, badge, resultQuote, doneButtons);

  // Loading and errors
  const message = el('section', 'phishing-quiz__card phishing-quiz__message');
  const messageText = el('div', 'phishing-quiz__message-text');
  message.append(
    messageText,
    button('phishing-quiz__button phishing-quiz__button--secondary', 'BACK TO THE ROOM', () =>
      close(),
    ),
  );

  overlay.append(howto, play, done, message);
  root.append(overlay);

  let phase: Phase = 'howto';
  let challenge: PhishingChallenge | null = null;
  let answered: PhishingAnswerResult | null = null;
  let submitting = false;
  let startedAt = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  /** Questions shown since the page loaded, for "QUESTION #n". */
  let questionCount = 0;
  /** Bumped by every open and close, so a late server reply for an earlier question is dropped. */
  let generation = 0;

  function show(next: Phase): void {
    phase = next;
    howto.hidden = next !== 'howto';
    play.hidden = next !== 'play';
    done.hidden = next !== 'done';
    message.hidden = next !== 'loading' && next !== 'error';
  }

  function stopTimer(): void {
    if (interval !== null) clearInterval(interval);
    interval = null;
  }

  function secondsLeft(): number {
    if (!challenge) return 0;
    return Math.max(0, challenge.secondsLeft - (Date.now() - startedAt) / 1000);
  }

  function renderTime(): void {
    const left = secondsLeft();
    const total = challenge?.secondsLeft ?? 1;
    timeValue.textContent = `${Math.ceil(left)}s`;
    timerFill.style.width = `${((left / total) * 100).toFixed(1)}%`;
    timerFill.classList.toggle('phishing-quiz__timer-fill--warning', left < TIME_WARNING_S);
  }

  function tick(): void {
    renderTime();
    if (secondsLeft() <= 0) void submit(null);
  }

  async function startQuestion(): Promise<void> {
    if (phase !== 'howto') return;
    const mine = generation;
    messageText.textContent = 'Anthony is picking a question…';
    show('loading');
    let next: PhishingChallenge;
    try {
      next = await deps.start();
    } catch (err) {
      console.error('[phishing-quiz] start failed', err);
      if (mine !== generation) return;
      messageText.textContent = 'Anthony stepped away. Try again in a moment.';
      show('error');
      return;
    }
    if (mine !== generation) return;
    challenge = next;
    answered = null;
    submitting = false;
    questionCount += 1;
    kicker.textContent = `QUESTION #${questionCount} · ${next.category}`;
    prompt.textContent = next.prompt;
    next.choices.forEach((text, index) => {
      const { choice, text: textEl } = choiceButtons[index];
      textEl.textContent = text;
      choice.disabled = false;
      choice.classList.remove('phishing-quiz__choice--correct', 'phishing-quiz__choice--wrong');
    });
    explainRow.hidden = true;
    antLine.textContent = 'Read it twice. Then answer.';
    play.classList.remove('phishing-quiz__play--shake');
    startedAt = Date.now();
    show('play');
    renderTime();
    stopTimer();
    interval = setInterval(tick, TICK_MS);
  }

  async function submit(choice: PhishingChoice): Promise<void> {
    const current = challenge;
    if (phase !== 'play' || !current || answered || submitting) return;
    submitting = true;
    stopTimer();
    choiceButtons.forEach(({ choice: node }) => (node.disabled = true));
    const mine = generation;
    let result: PhishingAnswerResult;
    try {
      result = await deps.answer(current.challengeId, choice);
    } catch (err) {
      console.error('[phishing-quiz] answer failed', err);
      if (mine !== generation) return;
      messageText.textContent = 'Anthony lost your answer. Bump him again for a new question.';
      show('error');
      return;
    }
    if (mine !== generation) return;
    answered = result;
    submitting = false;
    if (choice !== null) {
      choiceButtons[choice].choice.classList.add(
        result.correct ? 'phishing-quiz__choice--correct' : 'phishing-quiz__choice--wrong',
      );
    }
    const verdict = result.correct ? 'Correct.' : choice === null ? 'Out of time.' : 'Not quite.';
    explain.textContent = `${verdict} ${result.explanation}`;
    explainRow.hidden = false;
    antLine.textContent = result.correct
      ? CORRECT_LINES[questionCount % CORRECT_LINES.length]
      : choice === null
        ? 'Time. Hesitation is also a click.'
        : WRONG_LINES[questionCount % WRONG_LINES.length];
    play.classList.toggle('phishing-quiz__play--shake', !result.correct);
    renderTime();
  }

  function showDone(): void {
    const result = answered;
    if (phase !== 'play' || !result || !challenge) return;
    if (result.locked) {
      doneKicker.textContent = `SECURITY TRAINING · ${result.trainingCorrect} / ${SECURITY_TRAINING_REQUIRED}`;
    } else if (challenge.mode === 'training' && result.correct) {
      doneKicker.textContent = 'SECURITY TRAINING COMPLETE · MAP UNLOCKED';
    } else {
      doneKicker.textContent = result.correct ? 'DOOR UNLOCKED' : 'DOOR STILL LOCKED';
    }
    resultTitle.textContent = result.correct
      ? result.streak >= 3
        ? 'ON A ROLL'
        : 'YOU MAY PASS'
      : 'HOOKED';
    resultLabel.textContent = result.correct ? 'PASS' : 'MISS';
    resultTokens.textContent = `+${result.tokensAwarded}`;
    resultStreak.textContent = `${Math.min(result.streak, PHISH_FRY_STREAK)} / ${PHISH_FRY_STREAK}`;
    badge.hidden = !result.badgesEarned.includes('phish-fry');
    resultLine.textContent = !result.correct
      ? 'Wrong. Try again.'
      : result.streak >= 3
        ? `${result.streak} in a row. I am adding you to the allowlist.`
        : 'Correct. Go. Hover before you click.';
    show('done');
    done.querySelector('button')?.focus();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (overlay.hidden || event.key === 'Escape') return;
    const upper = event.key.toUpperCase();
    if (phase === 'play' && !answered) {
      const letter = KEYS.indexOf(upper as (typeof KEYS)[number]);
      const digit = ['1', '2', '3', '4'].indexOf(event.key);
      const index = letter >= 0 ? letter : digit;
      if (index >= 0) {
        event.preventDefault();
        void submit(index as PhishingChoice);
      }
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (phase === 'howto') void startQuestion();
    else if (phase === 'play') showDone();
    else close();
  }

  /** The overlay manager's close: gives up an unanswered question, then hides. */
  function hide(): void {
    const unanswered = phase === 'play' && challenge && !answered && !submitting ? challenge : null;
    generation += 1;
    stopTimer();
    overlay.hidden = true;
    if (unanswered) {
      void deps.answer(unanswered.challengeId, null).catch((err: unknown) => {
        console.error('[phishing-quiz] give up failed', err);
      });
    }
    challenge = null;
    answered = null;
    submitting = false;
  }

  function close(): void {
    deps.overlays.close(PHISHING_QUIZ_OVERLAY_ID);
  }

  window.addEventListener('keydown', handleKeydown);

  return {
    open() {
      generation += 1;
      challenge = null;
      answered = null;
      submitting = false;
      show('howto');
      overlay.hidden = false;
      deps.overlays.open(PHISHING_QUIZ_OVERLAY_ID, hide);
      howto
        .querySelector<HTMLButtonElement>(
          '.phishing-quiz__button:not(.phishing-quiz__button--secondary)',
        )
        ?.focus();
    },
    isOpen() {
      return !overlay.hidden;
    },
    destroy() {
      window.removeEventListener('keydown', handleKeydown);
      stopTimer();
      overlay.remove();
    },
  };
}
