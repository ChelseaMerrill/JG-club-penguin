// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHudTitleText } from './hud-title-text';

describe('renderHudTitleText', () => {
  it('sets plain textContent for a title with no accented letter', () => {
    const el = document.createElement('div');
    renderHudTitleText(el, 'TOWN CENTER');
    expect(el.textContent).toBe('TOWN CENTER');
    expect(el.querySelector('.hud__title-accent')).toBeNull();
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  it('splits an acute-accented letter into a plain base letter plus a drawn accent span, for the exact same font/size as every other letter', () => {
    const el = document.createElement('div');
    renderHudTitleText(el, 'LATAM CAFÉ');

    // The accent span holds a plain "E" -- the same Bumbastika glyph every
    // other letter uses, never a different glyph or font.
    const accents = el.querySelectorAll('.hud__title-accent');
    expect(accents).toHaveLength(1);
    expect(accents[0].textContent).toBe('E');

    // Visually this drops the accent from the raw text, so the accessible
    // name is set explicitly to the real, accented string.
    expect(el.getAttribute('aria-label')).toBe('LATAM CAFÉ');
    expect(el.textContent).toBe('LATAM CAFE');
  });

  it('re-renders cleanly on a second call (no leftover accent spans from the previous title)', () => {
    const el = document.createElement('div');
    renderHudTitleText(el, 'LATAM CAFÉ');
    renderHudTitleText(el, 'TOWN CENTER');
    expect(el.textContent).toBe('TOWN CENTER');
    expect(el.querySelector('.hud__title-accent')).toBeNull();
    expect(el.hasAttribute('aria-label')).toBe(false);
  });
});
