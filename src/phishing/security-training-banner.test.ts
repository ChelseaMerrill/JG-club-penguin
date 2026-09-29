// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_PHISHING_STATE } from './phishing-client';
import { createSecurityTrainingBanner } from './security-training-banner';

describe('createSecurityTrainingBanner', () => {
  it('shows "Security Training is Required!" and x / 3 only while locked out', () => {
    const root = document.createElement('div');
    const banner = createSecurityTrainingBanner(root);
    const el = root.querySelector('.security-training-banner') as HTMLElement;

    banner.render(DEFAULT_PHISHING_STATE);
    expect(el.hidden).toBe(true);

    banner.render({ ...DEFAULT_PHISHING_STATE, locked: true, bypassCount: 5, trainingCorrect: 1 });
    expect(el.hidden).toBe(false);
    expect(el.querySelector('.security-training-banner__title')?.textContent).toBe(
      'Security Training is Required!',
    );
    expect(el.querySelector('.security-training-banner__progress')?.textContent).toBe(
      'SECURITY TRAINING · 1 / 3',
    );

    banner.render(null);
    expect(el.hidden).toBe(true);
  });
});
