// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE, type PenguinAppearance } from '../penguin/appearance';
import { createPenguinCreator } from './penguin-creator';

const initial: PenguinAppearance = { ...DEFAULT_APPEARANCE, name: 'Ada Lovelace' };

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const creator = createPenguinCreator(root, { onSubmit, onCancel });
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const chip = (group: string, value: string) =>
    q<HTMLButtonElement>(`[aria-label="${group}"] [data-value="${value}"]`);
  const submit = () => q<HTMLButtonElement>('.penguin-creator__submit').click();
  return { root, creator, onSubmit, onCancel, q, chip, submit };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createPenguinCreator', () => {
  it('is hidden until opened', () => {
    const { q, creator } = setup();

    expect(q('.penguin-creator').hidden).toBe(true);
    expect(creator.isOpen()).toBe(false);
  });

  it('opens as a modal dialog with the initial name and a live preview', () => {
    const { q, creator } = setup();

    creator.open(initial, { dismissible: false });

    const dialog = q('.penguin-creator');
    expect(dialog.hidden).toBe(false);
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(q<HTMLInputElement>('#penguin-creator-name').value).toBe('Ada Lovelace');
    expect(q('.penguin-creator__nameplate').textContent).toBe('Ada Lovelace');
    expect(q('.penguin-creator__figure svg')).not.toBeNull();
    expect(q('.penguin-creator__summary').textContent).toBe('JG CAP · PLAIN · ROUND');
  });

  it('WADDLE IN submits the default look when nothing changed', () => {
    const { creator, onSubmit, submit } = setup();
    creator.open(initial, { dismissible: false });

    submit();

    expect(onSubmit).toHaveBeenCalledWith(initial);
  });

  it('submits every pick the Player made', () => {
    const { q, creator, onSubmit, chip, submit } = setup();
    creator.open(initial, { dismissible: false });

    const name = q<HTMLInputElement>('#penguin-creator-name');
    name.value = '  Waddles  ';
    name.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>('[aria-label="BODY"] [data-color="#3a4046"]').click();
    const customBeak = q<HTMLInputElement>('[aria-label="Custom beak color"]');
    customBeak.value = '#ff00aa';
    customBeak.dispatchEvent(new Event('input'));
    chip('HAT', 'HEADPHONES').click();
    chip('BELLY PATTERN', 'SNOWFLAKE').click();
    chip('EYES', 'WINK').click();

    expect(q('.penguin-creator__nameplate').textContent).toBe('Waddles');
    expect(chip('HAT', 'HEADPHONES').getAttribute('aria-pressed')).toBe('true');
    expect(chip('HAT', 'JG CAP').getAttribute('aria-pressed')).toBe('false');

    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Waddles',
      body: '#3a4046',
      cap: '#00bdff',
      beak: '#ff00aa',
      feet: '#00bdff',
      hat: 'HEADPHONES',
      pattern: 'SNOWFLAKE',
      eyes: 'WINK',
    });
  });

  it('refuses to submit without a name', () => {
    const { q, creator, onSubmit, submit } = setup();
    creator.open({ ...initial, name: '' }, { dismissible: false });

    expect(q('.penguin-creator__nameplate').textContent).toBe('Unnamed Penguin');
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(q('.penguin-creator__error').textContent).toBe('Your Penguin needs a name.');
  });

  it('SHUFFLE changes the look but keeps the name', () => {
    const { q, creator, onSubmit, submit } = setup();
    creator.open(initial, { dismissible: false });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    q<HTMLButtonElement>('.penguin-creator__shuffle').click();
    submit();
    random.mockRestore();

    const submitted = onSubmit.mock.calls[0][0] as PenguinAppearance;
    expect(submitted.name).toBe('Ada Lovelace');
    expect(submitted).not.toEqual(initial);
  });

  it('emotes change the preview only, never the submitted look', () => {
    const { q, creator, onSubmit, chip, submit } = setup();
    creator.open(initial, { dismissible: false });

    chip('Try an emote', 'SIT').click();

    expect(q('.penguin-creator__figure').dataset.emote).toBe('SIT');
    expect(q('.penguin-creator__seat').hidden).toBe(false);
    submit();
    expect(onSubmit).toHaveBeenCalledWith(initial);
  });

  it('hides Cancel and ignores Escape when not dismissible', () => {
    const { q, creator, onCancel } = setup();
    creator.open(initial, { dismissible: false });

    expect(q('.penguin-creator__cancel').hidden).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('offers Cancel and Escape when dismissible', () => {
    const { q, creator, onCancel } = setup();
    creator.open(initial, { dismissible: true });

    q<HTMLButtonElement>('.penguin-creator__cancel').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('stops listening for Escape once closed', () => {
    const { creator, onCancel } = setup();
    creator.open(initial, { dismissible: true });

    creator.close();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(creator.isOpen()).toBe(false);
  });

  it('setSaving disables the buttons and blocks a double submit', () => {
    const { q, creator, onSubmit, submit } = setup();
    creator.open(initial, { dismissible: true });

    creator.setSaving(true);
    submit();

    const button = q<HTMLButtonElement>('.penguin-creator__submit');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('SAVING…');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reopening resets the draft to the given look', () => {
    const { q, creator, chip, onSubmit, submit } = setup();
    creator.open(initial, { dismissible: true });
    chip('HAT', 'NONE').click();
    creator.close();

    creator.open(initial, { dismissible: true });
    submit();

    expect(onSubmit).toHaveBeenCalledWith(initial);
    expect(q('.penguin-creator__error').textContent).toBe('');
  });
});
