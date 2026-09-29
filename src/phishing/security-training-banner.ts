import { SECURITY_TRAINING_REQUIRED, type PhishingState } from './phishing-client';
import './phishing-quiz.css';

export interface SecurityTrainingBanner {
  /** Shown while `state.locked`, with the training progress; `null` hides it. */
  render(state: PhishingState | null): void;
  destroy(): void;
}

/**
 * The Security Training lockout banner (#146): "Security Training is
 * Required!" and "SECURITY TRAINING · x / 3" over the Room while the Map is
 * locked, until Anthony's 3 questions are answered.
 */
export function createSecurityTrainingBanner(root: HTMLElement): SecurityTrainingBanner {
  const banner = document.createElement('div');
  banner.className = 'security-training-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  const title = document.createElement('div');
  title.className = 'security-training-banner__title';
  title.textContent = 'Security Training is Required!';
  const progress = document.createElement('div');
  progress.className = 'security-training-banner__progress';
  const hint = document.createElement('div');
  hint.className = 'security-training-banner__hint';
  hint.textContent = 'The Map is locked. Answer 3 of Anthony’s questions to get it back.';
  banner.append(title, progress, hint);
  root.append(banner);

  return {
    render(state) {
      banner.hidden = !state?.locked;
      if (state?.locked) {
        progress.textContent = `SECURITY TRAINING · ${state.trainingCorrect} / ${SECURITY_TRAINING_REQUIRED}`;
      }
    },
    destroy() {
      banner.remove();
    },
  };
}
