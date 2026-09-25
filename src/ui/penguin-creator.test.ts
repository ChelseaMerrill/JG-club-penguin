// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, IDLE_EMOTES, type PenguinLook } from '../contracts';
import { PENGUIN_FRAME_MS } from '../game/penguin/poses';
import { renderPenguinSvg } from '../game/penguin/render-svg';
import { createPenguinCreator } from './penguin-creator';

const initial: PenguinLook = { ...DEFAULT_LOOK, name: 'Waddles' };

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

const preview = (idPrefix = 'penguin-creator') => ({ idPrefix });

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(q<HTMLInputElement>('#penguin-creator-name').value).toBe('Waddles');
    expect(q('.penguin-creator__nameplate').textContent).toBe('Waddles');
    expect(q('.penguin-creator__summary').textContent).toBe('JG CAP · PLAIN · ROUND');
  });

  it('previews with the same renderer as the Penguin in the Room', () => {
    const { q, creator } = setup();

    creator.open(initial, { dismissible: false });

    expect(q('.penguin-creator__figure').innerHTML).toBe(
      renderPenguinSvg(initial, { anim: 'WADDLE', frame: 0 }, preview()),
    );
  });

  it('WADDLE IN submits the initial look when nothing changed', () => {
    const { creator, onSubmit, submit } = setup();
    creator.open(initial, { dismissible: false });

    submit();

    expect(onSubmit).toHaveBeenCalledWith(initial);
  });

  it('submits every pick the Player made, including the Idle animation', () => {
    const { q, creator, onSubmit, chip, submit } = setup();
    creator.open(initial, { dismissible: false });

    const name = q<HTMLInputElement>('#penguin-creator-name');
    name.value = '  Ada   Lovelace  ';
    name.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>('[aria-label="BODY"] [data-color="#3a4046"]').click();
    const customBeak = q<HTMLInputElement>('[aria-label="Custom beak color"]');
    customBeak.value = '#ff00aa';
    customBeak.dispatchEvent(new Event('input'));
    chip('HAT', 'HEADPHONES').click();
    chip('BELLY PATTERN', 'SNOWFLAKE').click();
    chip('EYES', 'WINK').click();
    chip('Idle animation', 'SIT').click();

    expect(q('.penguin-creator__nameplate').textContent).toBe('Ada Lovelace');
    expect(chip('HAT', 'HEADPHONES').getAttribute('aria-pressed')).toBe('true');
    expect(chip('HAT', 'JG CAP').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Idle animation', 'SIT').getAttribute('aria-pressed')).toBe('true');

    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      ...DEFAULT_LOOK,
      name: 'Ada Lovelace',
      body: '#3a4046',
      beak: '#ff00aa',
      hat: 'HEADPHONES',
      pattern: 'SNOWFLAKE',
      eyes: 'WINK',
      emote: 'SIT',
    });
  });

  it('offers exactly the five Idle animations', () => {
    const { root } = setup();

    const values = [
      ...root.querySelectorAll<HTMLElement>('[aria-label="Idle animation"] button'),
    ].map((b) => b.dataset.value);

    expect(values).toEqual([...IDLE_EMOTES]);
  });

  it('marks contract swatches pressed regardless of case', () => {
    const { q, creator } = setup();

    creator.open({ ...initial, cap: '#00bdff' }, { dismissible: false });

    expect(q('[aria-label="HAT COLOR"] [data-color="#00BDFF"]').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(q<HTMLInputElement>('[aria-label="Custom hat color color"]').value).toBe('#00bdff');
  });

  it('caps the name input at 16 characters', () => {
    const { q } = setup();

    expect(q<HTMLInputElement>('#penguin-creator-name').maxLength).toBe(16);
  });

  it('disables WADDLE IN and shows a hint when there is no name', () => {
    const { q, creator, onSubmit, submit } = setup();
    creator.open(DEFAULT_LOOK, { dismissible: false });

    expect(q<HTMLInputElement>('#penguin-creator-name').value).toBe('');
    expect(q('.penguin-creator__nameplate').textContent).toBe('Unnamed Penguin');
    expect(q<HTMLButtonElement>('.penguin-creator__submit').disabled).toBe(true);
    expect(q('.penguin-creator__name-hint').textContent).toBe(
      'Give your Penguin a name to waddle in',
    );

    submit();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps WADDLE IN disabled for a whitespace-only name, then enables it once a name is typed', () => {
    const { q, creator } = setup();
    creator.open(DEFAULT_LOOK, { dismissible: false });
    const name = q<HTMLInputElement>('#penguin-creator-name');
    const button = () => q<HTMLButtonElement>('.penguin-creator__submit');
    const hint = () => q('.penguin-creator__name-hint').textContent;

    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    expect(button().disabled).toBe(true);
    expect(hint()).toBe('Give your Penguin a name to waddle in');

    name.value = 'Waddles';
    name.dispatchEvent(new Event('input'));
    expect(button().disabled).toBe(false);
    expect(hint()).toBe('');
  });

  it('disables WADDLE IN and shows the too-long hint over 16 characters', () => {
    const { q, creator } = setup();
    creator.open(DEFAULT_LOOK, { dismissible: false });
    const name = q<HTMLInputElement>('#penguin-creator-name');

    name.value = 'A'.repeat(17);
    name.dispatchEvent(new Event('input'));

    expect(q<HTMLButtonElement>('.penguin-creator__submit').disabled).toBe(true);
    expect(q('.penguin-creator__name-hint').textContent).toBe('Names are 1–16 characters');
  });

  it('enables WADDLE IN at exactly 16 characters', () => {
    const { q, creator } = setup();
    creator.open(DEFAULT_LOOK, { dismissible: false });
    const name = q<HTMLInputElement>('#penguin-creator-name');

    name.value = 'A'.repeat(16);
    name.dispatchEvent(new Event('input'));

    expect(q<HTMLButtonElement>('.penguin-creator__submit').disabled).toBe(false);
    expect(q('.penguin-creator__name-hint').textContent).toBe('');
  });

  it('the disabled rule applies in dismissible mode too', () => {
    const { q, creator } = setup();
    creator.open(DEFAULT_LOOK, { dismissible: true });

    expect(q<HTMLButtonElement>('.penguin-creator__submit').disabled).toBe(true);
  });

  it('setSaving(false) restores the disabled state for an invalid draft rather than clearing it', () => {
    const { q, creator } = setup();
    creator.open(DEFAULT_LOOK, { dismissible: false });

    creator.setSaving(true);
    creator.setSaving(false);

    expect(q<HTMLButtonElement>('.penguin-creator__submit').disabled).toBe(true);
  });

  it('Enter in the name field cannot bypass an invalid name', () => {
    const { q, creator, onSubmit } = setup();
    creator.open(DEFAULT_LOOK, { dismissible: false });
    const name = q<HTMLInputElement>('#penguin-creator-name');

    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter in the name field submits a valid name, the same as WADDLE IN', () => {
    const { q, creator, onSubmit } = setup();
    creator.open(initial, { dismissible: false });
    const name = q<HTMLInputElement>('#penguin-creator-name');

    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(onSubmit).toHaveBeenCalledWith(initial);
  });

  it('a load or save error shown through showError is not cleared by typing the name', () => {
    const { q, creator } = setup();
    creator.open(initial, { dismissible: false });

    creator.showError("Couldn't save your Penguin: invalid_look");
    const name = q<HTMLInputElement>('#penguin-creator-name');
    name.value = 'Ada';
    name.dispatchEvent(new Event('input'));

    expect(q('.penguin-creator__error').textContent).toBe(
      "Couldn't save your Penguin: invalid_look",
    );
  });

  it('SHUFFLE changes the look but keeps the name and Idle animation', () => {
    const { q, creator, onSubmit, chip, submit } = setup();
    creator.open(initial, { dismissible: false });
    chip('Idle animation', 'WAVE').click();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    q<HTMLButtonElement>('.penguin-creator__shuffle').click();
    submit();
    random.mockRestore();

    const submitted = onSubmit.mock.calls[0][0] as PenguinLook;
    expect(submitted.name).toBe('Waddles');
    expect(submitted.emote).toBe('WAVE');
    expect(submitted).not.toEqual({ ...initial, emote: 'WAVE' });
  });

  it('cycles the chosen Idle animation frames and stops when closed', () => {
    vi.useFakeTimers();
    const { q, creator, chip } = setup();
    creator.open(initial, { dismissible: false });
    chip('Idle animation', 'DANCE').click();
    const figure = q('.penguin-creator__figure');
    const look: PenguinLook = { ...initial, emote: 'DANCE' };

    expect(figure.innerHTML).toBe(renderPenguinSvg(look, { anim: 'DANCE', frame: 0 }, preview()));
    vi.advanceTimersByTime(PENGUIN_FRAME_MS.DANCE);
    expect(figure.innerHTML).toBe(renderPenguinSvg(look, { anim: 'DANCE', frame: 1 }, preview()));

    creator.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hides Cancel when not dismissible', () => {
    const { q, creator } = setup();
    creator.open(initial, { dismissible: false });

    expect(q('.penguin-creator__cancel').hidden).toBe(true);
  });

  it('offers Cancel when dismissible and leaves Escape to the OverlayManager', () => {
    const { q, creator, onCancel } = setup();
    creator.open(initial, { dismissible: true });

    q<HTMLButtonElement>('.penguin-creator__cancel').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
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
