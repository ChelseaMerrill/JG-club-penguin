// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderDisplayAccentText } from './display-accent-text';

describe('renderDisplayAccentText', () => {
  it('leaves unaccented text as plain text', () => {
    const el = document.createElement('div');
    renderDisplayAccentText(el, 'DELICIOSO!');
    expect(el.textContent).toBe('DELICIOSO!');
    expect(el.querySelector('.display-accent')).toBeNull();
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  it('draws the tilde in "PÃO" over a plain A, keeping the real string as its label', () => {
    const el = document.createElement('div');
    renderDisplayAccentText(el, 'PÃO DE QUEIJO MEMORY');
    const accents = el.querySelectorAll('.display-accent');
    expect(accents).toHaveLength(1);
    expect(accents[0]!.className).toBe('display-accent display-accent--tilde');
    expect(accents[0]!.textContent).toBe('A');
    expect(el.textContent).toBe('PAO DE QUEIJO MEMORY');
    expect(el.getAttribute('aria-label')).toBe('PÃO DE QUEIJO MEMORY');
  });

  it('draws the acute in "QUASE LÁ" and "CAFÉ"', () => {
    const el = document.createElement('div');
    renderDisplayAccentText(el, 'QUASE LÁ');
    expect(el.querySelector('.display-accent--acute')!.textContent).toBe('A');
    renderDisplayAccentText(el, 'LATAM CAFÉ');
    expect(el.querySelector('.display-accent--acute')!.textContent).toBe('E');
    expect(el.textContent).toBe('LATAM CAFE');
  });

  it('clears an earlier accented render back to plain text', () => {
    const el = document.createElement('div');
    renderDisplayAccentText(el, 'QUASE LÁ');
    renderDisplayAccentText(el, 'TENTE DE NOVO');
    expect(el.textContent).toBe('TENTE DE NOVO');
    expect(el.hasAttribute('aria-label')).toBe(false);
  });
});
