import type { GuardPost } from './phishing-client';

/**
 * Test and dev-hook data for the in-memory `PhishingClient` fake only: a
 * copy of what `20260928020000_phishing_quiz.sql` seeds. The real client
 * never imports this file (the server holds the questions, their answers
 * and the post list, P3/P8), so a production build never contains it.
 * `fake-data.test.ts` fails if either list drifts from the migration.
 */

/** One question as the server holds it, correct choice included. */
export interface FakePhishingQuestion {
  id: string;
  category: string;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}

/** `public.phishing_guard_posts`, in position order. */
export const FAKE_GUARD_POSTS: readonly GuardPost[] = [
  { roomId: 'town-center', doorLabel: 'THE ICEBOX' },
  { roomId: 'dev-pit', doorLabel: 'THE ICEBOX' },
  { roomId: 'the-melt', doorLabel: 'TOWN CENTER' },
  { roomId: 'town-center', doorLabel: 'DEV PIT' },
  { roomId: 'dev-pit', doorLabel: 'TOWN CENTER' },
  { roomId: 'the-melt', doorLabel: 'ROOF DECK' },
  { roomId: 'town-center', doorLabel: 'ELEVATOR · ROOF DECK' },
  { roomId: 'roof-deck', doorLabel: 'KITCHEN' },
];

/** `public.phishing_questions`, in sort order: the design's 10, unbranded. */
export const FAKE_PHISHING_QUESTIONS: readonly FakePhishingQuestion[] = [
  {
    id: 'phishing-emails',
    category: 'PHISHING EMAILS',
    prompt: 'Which of the following is a primary indicator of a phishing email?',
    choices: [
      "The sender's display name doesn't match the actual email address domain.",
      'The email is sent during standard business hours.',
      'The email contains standard company branding.',
      'The message is addressed to your professional title.',
    ],
    correctIndex: 0,
    explanation:
      'Display name and real address not matching is a classic spoof. Branding, timing and titles are all easy to fake.',
  },
  {
    id: 'social-engineering',
    category: 'SOCIAL ENGINEERING',
    prompt:
      'What should you do if you receive an unexpected email from a coworker asking you to urgently purchase gift cards?',
    choices: [
      'Reply to the email asking for confirmation.',
      'Click the link in the email to verify the request.',
      'Independently verify the request by calling or messaging the coworker through a known, trusted channel.',
      'Forward the email to all company contacts as a warning.',
    ],
    correctIndex: 2,
    explanation:
      'Verify out-of-band. Replying or clicking talks to the attacker; mass-forwarding spreads the bait.',
  },
  {
    id: 'links',
    category: 'LINKS',
    prompt: 'Before clicking a link in an email, the safest first step is to:',
    choices: [
      'Click it quickly so the page loads before it expires.',
      'Hover over it to preview the real destination URL.',
      'Check that the email has a company logo.',
      'Open it on your phone instead of your laptop.',
    ],
    correctIndex: 1,
    explanation:
      'Hovering shows where the link really goes. Logos prove nothing and phones are just as vulnerable.',
  },
  {
    id: 'passwords',
    category: 'PASSWORDS',
    prompt: 'Which password practice is the strongest?',
    choices: [
      'One complex password reused across all accounts.',
      'A unique passphrase per account stored in a password manager, plus MFA.',
      "Your pet's name followed by the current year.",
      'Writing passwords on a sticky note under the keyboard.',
    ],
    correctIndex: 1,
    explanation:
      'Unique passphrases plus multi-factor authentication limit the blast radius when one site leaks.',
  },
  {
    id: 'removable-media',
    category: 'REMOVABLE MEDIA',
    prompt: 'You find a USB drive labeled "Payroll Q3" in the parking lot. What do you do?',
    choices: [
      'Plug it in to find the owner.',
      'Plug it into a spare laptop that is not on the network.',
      'Hand it to IT / Security without plugging it in anywhere.',
      'Throw it away.',
    ],
    correctIndex: 2,
    explanation:
      'Dropped drives are a known attack. Only IT should handle it, in a controlled environment.',
  },
  {
    id: 'physical-security',
    category: 'PHYSICAL SECURITY',
    prompt:
      'Someone in a delivery uniform asks you to hold the badge-locked door because their hands are full. You should:',
    choices: [
      'Hold the door; being helpful is part of the culture.',
      'Ask them to badge in or direct them to the front desk to sign in.',
      'Let them in but watch where they go.',
      'Take a photo of them first.',
    ],
    correctIndex: 1,
    explanation:
      'Tailgating relies on politeness. Everyone badges in or checks in at the front desk. No exceptions.',
  },
  {
    id: 'urgency-pressure',
    category: 'URGENCY & PRESSURE',
    prompt:
      'An email from "the CEO" says a wire transfer must go out in the next 10 minutes and to keep it confidential. The biggest red flag is:',
    choices: [
      'It mentions a wire transfer.',
      'It came from the CEO.',
      'The urgency plus secrecy combination.',
      'It arrived on a Friday.',
    ],
    correctIndex: 2,
    explanation:
      'Urgency and secrecy together are the signature of business email compromise. Slow down and verify.',
  },
  {
    id: 'reporting',
    category: 'REPORTING',
    prompt: 'You clicked a link in a suspicious email before realizing it was phishing. What now?',
    choices: [
      'Delete the email and say nothing.',
      'Report it to IT / Security immediately, even though it is embarrassing.',
      'Change your password next week.',
      'Run antivirus and move on.',
    ],
    correctIndex: 1,
    explanation:
      'Fast reporting lets IT contain it. Nobody is in trouble for reporting; people are in trouble for hiding it.',
  },
  {
    id: 'mfa',
    category: 'MFA',
    prompt:
      'You receive an MFA approval prompt on your phone but you are not logging in anywhere. You should:',
    choices: [
      'Approve it so the notifications stop.',
      'Deny it and report it; someone has your password.',
      'Ignore it.',
      'Approve it once to see what happens.',
    ],
    correctIndex: 1,
    explanation:
      'That is MFA fatigue: an attacker already has your password and is hoping you tap Approve. Deny and report.',
  },
  {
    id: 'smishing',
    category: 'SMISHING',
    prompt:
      'A text says your package is held and links to a page asking for a $1.99 redelivery fee and your card number. This is most likely:',
    choices: [
      'A legitimate carrier notice.',
      'Smishing: an SMS phishing attempt to harvest card data.',
      'A billing error.',
      'A survey.',
    ],
    correctIndex: 1,
    explanation:
      'Carriers do not collect fees via random text links. The small amount is bait for your card details.',
  },
];
