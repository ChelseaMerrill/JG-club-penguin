import {
  EMOTES,
  EYES,
  HATS,
  MAX_NAME_LENGTH,
  PATTERNS,
  SWATCHES,
  normalizeColor,
  normalizeName,
  shuffleAppearance,
  type ColorPart,
  type Emote,
  type PenguinAppearance,
} from '../penguin/appearance';
import { renderPenguinSvg } from '../penguin/penguin-svg';
import './penguin-creator.css';

export interface PenguinCreatorCallbacks {
  /** WADDLE IN with a valid, named appearance. The caller saves it. */
  onSubmit: (appearance: PenguinAppearance) => void;
  /** Cancel (button or Escape); only offered when opened `dismissible`. */
  onCancel: () => void;
}

export interface PenguinCreatorOpenOptions {
  /** False on first sign-in: the Player must make a Penguin to continue. */
  dismissible: boolean;
}

export interface PenguinCreator {
  open(initial: PenguinAppearance, options: PenguinCreatorOpenOptions): void;
  close(): void;
  isOpen(): boolean;
  setSaving(saving: boolean): void;
  showError(message: string): void;
  destroy(): void;
}

/** The design's fixed stage; scaled down to fit smaller windows. */
const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;
const STAGE_MARGIN = 24;

const COLOR_LABELS: Record<ColorPart, string> = {
  body: 'BODY',
  cap: 'HAT COLOR',
  beak: 'BEAK',
  feet: 'FEET',
};

type OptionKey = 'hat' | 'pattern' | 'eyes';

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

function button(className: string, text?: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  return b;
}

/** A field heading; a real `<label>` when it names an input. */
function label(text: string, input?: HTMLInputElement): HTMLElement {
  if (!input) return el('div', 'penguin-creator__label', text);
  const node = el('label', 'penguin-creator__label', text);
  node.htmlFor = input.id;
  return node;
}

/**
 * Mounts the Penguin Creator (design: `design/Penguin Creator.dc.html`) into
 * `root` as a full-screen DOM overlay above the canvas. Hidden until `open()`.
 * It only edits a local draft; saving is the caller's job via `onSubmit`.
 */
export function createPenguinCreator(
  root: HTMLElement,
  callbacks: PenguinCreatorCallbacks,
): PenguinCreator {
  let draft: PenguinAppearance | null = null;
  let emote: Emote = 'WADDLE';
  let dismissible = false;
  let saving = false;

  const overlay = el('div', 'penguin-creator');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'penguin-creator-title');

  const stage = el('div', 'penguin-creator__stage');
  overlay.append(stage);

  // ---- Left: heading + live preview + emotes ----
  const previewCol = el('section', 'penguin-creator__preview');
  const heading = el('header', 'penguin-creator__heading');
  const title = el('h1', 'penguin-creator__title', 'MAKE YOUR PENGUIN');
  title.id = 'penguin-creator-title';
  heading.append(title, el('p', 'penguin-creator__subtitle', 'EVERYTHING IS FREE · CHANGE IT ANYTIME'));

  const podium = el('div', 'penguin-creator__podium');
  const figure = el('div', 'penguin-creator__figure');
  const seat = el('div', 'penguin-creator__seat');
  podium.append(
    el('div', 'penguin-creator__shadow'),
    el('div', 'penguin-creator__hexagon'),
    figure,
    seat,
  );

  const nameplate = el('div', 'penguin-creator__nameplate');
  const emoteRow = el('div', 'penguin-creator__chips penguin-creator__chips--center');
  emoteRow.setAttribute('role', 'group');
  emoteRow.setAttribute('aria-label', 'Try an emote');
  const emoteButtons = EMOTES.map((value) => {
    const b = button('penguin-creator__chip', value);
    b.dataset.value = value;
    b.addEventListener('click', () => {
      emote = value;
      render();
    });
    emoteRow.append(b);
    return b;
  });
  previewCol.append(
    heading,
    podium,
    nameplate,
    emoteRow,
    el('p', 'penguin-creator__hint', 'TRY AN EMOTE · WADDLE IS THE DEFAULT'),
  );

  // ---- Right: the controls panel ----
  const panel = el('section', 'penguin-creator__panel');

  const nameRow = el('div', 'penguin-creator__name-row');
  const nameField = el('div', 'penguin-creator__field penguin-creator__field--grow');
  const nameInput = el('input', 'penguin-creator__name-input');
  nameInput.id = 'penguin-creator-name';
  nameInput.placeholder = 'Your name';
  nameInput.maxLength = MAX_NAME_LENGTH;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.addEventListener('input', () => {
    if (!draft) return;
    draft = { ...draft, name: nameInput.value };
    render();
  });
  nameField.append(label('NAME', nameInput), nameInput);
  const shuffleButton = button('penguin-creator__shuffle', 'SHUFFLE');
  shuffleButton.addEventListener('click', () => {
    if (!draft) return;
    draft = shuffleAppearance(draft);
    render();
  });
  nameRow.append(nameField, shuffleButton);

  const colorGrid = el('div', 'penguin-creator__color-grid');
  const colorControls = (Object.keys(COLOR_LABELS) as ColorPart[]).map((part) => {
    const field = el('div', 'penguin-creator__field');
    const row = el('div', 'penguin-creator__swatches');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', COLOR_LABELS[part]);
    const swatches = SWATCHES[part].map((color) => {
      const b = button('penguin-creator__swatch');
      b.dataset.color = color;
      b.setAttribute('aria-label', `${COLOR_LABELS[part].toLowerCase()} ${color}`);
      const fill = el('span', 'penguin-creator__swatch-fill');
      fill.style.background = color;
      b.append(fill);
      b.addEventListener('click', () => setColor(part, color));
      row.append(b);
      return b;
    });
    const custom = el('input', 'penguin-creator__custom-color');
    custom.type = 'color';
    custom.setAttribute('aria-label', `Custom ${COLOR_LABELS[part].toLowerCase()} color`);
    custom.addEventListener('input', () => setColor(part, custom.value));
    row.append(custom);
    field.append(label(COLOR_LABELS[part]), row);
    colorGrid.append(field);
    return { part, swatches, custom };
  });

  function optionGroup(
    key: OptionKey,
    heading: string,
    values: readonly string[],
    modifier = '',
  ): { field: HTMLElement; buttons: HTMLButtonElement[] } {
    const field = el('div', 'penguin-creator__field');
    const row = el('div', `penguin-creator__chips ${modifier}`.trim());
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', heading);
    const buttons = values.map((value) => {
      const b = button('penguin-creator__chip', value);
      b.dataset.value = value;
      b.addEventListener('click', () => {
        if (!draft) return;
        draft = { ...draft, [key]: value };
        render();
      });
      row.append(b);
      return b;
    });
    field.append(label(heading), row);
    return { field, buttons };
  }

  const hatGroup = optionGroup('hat', 'HAT', HATS);
  const patternGroup = optionGroup('pattern', 'BELLY PATTERN', PATTERNS);
  const eyesGroup = optionGroup('eyes', 'EYES', EYES, 'penguin-creator__chips--fill');

  const footer = el('div', 'penguin-creator__footer');
  const errorEl = el('p', 'penguin-creator__error');
  errorEl.setAttribute('role', 'alert');
  const summary = el('div', 'penguin-creator__summary');
  const cancelButton = button('penguin-creator__cancel', 'CANCEL');
  cancelButton.addEventListener('click', () => callbacks.onCancel());
  const submitButton = button('penguin-creator__submit', 'WADDLE IN →');
  submitButton.addEventListener('click', submit);
  footer.append(summary, cancelButton, submitButton);

  panel.append(
    nameRow,
    colorGrid,
    hatGroup.field,
    patternGroup.field,
    eyesGroup.field,
    errorEl,
    footer,
  );
  stage.append(previewCol, panel);
  root.append(overlay);

  function setColor(part: ColorPart, value: string): void {
    const color = normalizeColor(value);
    if (!draft || !color) return;
    draft = { ...draft, [part]: color };
    render();
  }

  function submit(): void {
    if (!draft || saving) return;
    const name = normalizeName(draft.name);
    if (!name) {
      showError('Your Penguin needs a name.');
      nameInput.focus();
      return;
    }
    showError('');
    callbacks.onSubmit({ ...draft, name });
  }

  function markPressed(buttons: HTMLButtonElement[], selected: string): void {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.value === selected));
  }

  function render(): void {
    if (!draft) return;
    figure.dataset.emote = emote;
    seat.hidden = emote !== 'SIT';
    figure.innerHTML = renderPenguinSvg(draft, { emote, idPrefix: 'penguin-creator' });
    nameplate.textContent = normalizeName(draft.name) || 'Unnamed Penguin';
    if (nameInput.value !== draft.name) nameInput.value = draft.name;

    for (const { part, swatches, custom } of colorControls) {
      const current = draft[part];
      for (const b of swatches) b.setAttribute('aria-pressed', String(b.dataset.color === current));
      custom.value = current;
    }
    markPressed(hatGroup.buttons, draft.hat);
    markPressed(patternGroup.buttons, draft.pattern);
    markPressed(eyesGroup.buttons, draft.eyes);
    markPressed(emoteButtons, emote);
    summary.textContent = `${draft.hat} · ${draft.pattern} · ${draft.eyes}`;
  }

  function fitToWindow(): void {
    const scale = Math.min(
      1,
      (window.innerWidth - STAGE_MARGIN) / STAGE_WIDTH,
      (window.innerHeight - STAGE_MARGIN) / STAGE_HEIGHT,
    );
    stage.style.setProperty('--penguin-creator-scale', String(Math.max(scale, 0.1)));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && dismissible && !saving) callbacks.onCancel();
  }

  function showError(message: string): void {
    errorEl.textContent = message;
  }

  function setSaving(value: boolean): void {
    saving = value;
    submitButton.disabled = value;
    cancelButton.disabled = value;
    submitButton.textContent = value ? 'SAVING…' : 'WADDLE IN →';
  }

  function close(): void {
    if (overlay.hidden) return;
    overlay.hidden = true;
    window.removeEventListener('resize', fitToWindow);
    window.removeEventListener('keydown', onKeyDown);
  }

  return {
    open(initial, options) {
      draft = { ...initial };
      emote = 'WADDLE';
      dismissible = options.dismissible;
      cancelButton.hidden = !dismissible;
      setSaving(false);
      showError('');
      render();
      fitToWindow();
      if (overlay.hidden) {
        overlay.hidden = false;
        window.addEventListener('resize', fitToWindow);
        window.addEventListener('keydown', onKeyDown);
      }
      nameInput.focus();
    },
    close,
    isOpen: () => !overlay.hidden,
    setSaving,
    showError,
    destroy() {
      close();
      overlay.remove();
    },
  };
}
