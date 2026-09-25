import {
  EYES,
  HATS,
  IDLE_EMOTES,
  PATTERNS,
  PENGUIN_NAME_MAX,
  UNNAMED_PENGUIN,
  type PenguinLook,
} from '../contracts';
import { PENGUIN_FRAMES, PENGUIN_FRAME_MS } from '../game/penguin/poses';
import { renderPenguinSvg } from '../game/penguin/render-svg';
import {
  SWATCHES,
  normalizeName,
  sameColor,
  shuffleLook,
  toHexColor,
  validatePenguinName,
  type ColorPart,
  type PenguinNameValidation,
} from '../penguin/look';
import './penguin-creator.css';

export interface PenguinCreatorCallbacks {
  /** WADDLE IN with a valid, named look. The caller saves it. */
  onSubmit: (look: PenguinLook) => void;
  /** The CANCEL button; only shown when opened `dismissible`. */
  onCancel: () => void;
}

export interface PenguinCreatorOpenOptions {
  /** False on first sign-in: the Player must make a Penguin to continue. */
  dismissible: boolean;
}

export interface PenguinCreator {
  open(initial: PenguinLook, options: PenguinCreatorOpenOptions): void;
  close(): void;
  isOpen(): boolean;
  setSaving(saving: boolean): void;
  showError(message: string): void;
  destroy(): void;
}

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

/** The inline hint under the name field while the draft name is invalid; empty once it's valid (#75). */
function nameHintMessage(validation: PenguinNameValidation): string {
  if (validation.ok) return '';
  return validation.reason === 'empty'
    ? 'Give your Penguin a name to waddle in'
    : 'Names are 1–16 characters';
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Mounts the Penguin Creator (design: `design/Penguin Creator.dc.html`) into
 * `root` (the `#ui` layer) as a full-Stage DOM overlay. Hidden until
 * `open()`. It only edits a local draft; saving is the caller's job via
 * `onSubmit`. The preview uses the same renderer as the Penguin in the
 * Room, cycling the chosen Idle animation's frames. Escape is left to the
 * HUD's `OverlayManager`, which the caller registers a dismissible open with.
 */
export function createPenguinCreator(
  root: HTMLElement,
  callbacks: PenguinCreatorCallbacks,
): PenguinCreator {
  let draft: PenguinLook | null = null;
  let saving = false;
  let frame = 0;
  let frameTimer: ReturnType<typeof setTimeout> | null = null;

  const overlay = el('div', 'penguin-creator');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'penguin-creator-title');

  const stage = el('div', 'penguin-creator__stage');
  overlay.append(stage);

  // ---- Left: heading + live preview + Idle animation ----
  const previewCol = el('section', 'penguin-creator__preview');
  const heading = el('header', 'penguin-creator__heading');
  const title = el('h1', 'penguin-creator__title', 'MAKE YOUR PENGUIN');
  title.id = 'penguin-creator-title';
  heading.append(
    title,
    el('p', 'penguin-creator__subtitle', 'EVERYTHING IS FREE · CHANGE IT ANYTIME'),
  );

  const podium = el('div', 'penguin-creator__podium');
  const figure = el('div', 'penguin-creator__figure');
  podium.append(
    el('div', 'penguin-creator__shadow'),
    el('div', 'penguin-creator__hexagon'),
    figure,
  );

  const nameplate = el('div', 'penguin-creator__nameplate');
  const emoteRow = el('div', 'penguin-creator__chips penguin-creator__chips--center');
  emoteRow.setAttribute('role', 'group');
  emoteRow.setAttribute('aria-label', 'Idle animation');
  const emoteButtons = IDLE_EMOTES.map((value) => {
    const b = button('penguin-creator__chip', value);
    b.dataset.value = value;
    b.addEventListener('click', () => {
      if (!draft) return;
      draft = { ...draft, emote: value };
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
    el('p', 'penguin-creator__hint', 'PICK AN IDLE ANIMATION · WADDLE IS THE DEFAULT'),
  );

  // ---- Right: the controls panel ----
  const panel = el('section', 'penguin-creator__panel');

  const nameRow = el('div', 'penguin-creator__name-row');
  const nameField = el('div', 'penguin-creator__field penguin-creator__field--grow');
  const nameInput = el('input', 'penguin-creator__name-input');
  nameInput.id = 'penguin-creator-name';
  nameInput.placeholder = 'Your name';
  nameInput.maxLength = PENGUIN_NAME_MAX;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.addEventListener('input', () => {
    if (!draft) return;
    draft = { ...draft, name: nameInput.value };
    render();
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  });
  const nameHintEl = el('p', 'penguin-creator__name-hint');
  nameField.append(label('NAME', nameInput), nameInput, nameHintEl);
  const shuffleButton = button('penguin-creator__shuffle', 'SHUFFLE');
  shuffleButton.addEventListener('click', () => {
    if (!draft) return;
    draft = shuffleLook(draft);
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
    const color = toHexColor(value);
    if (!draft || !color) return;
    draft = { ...draft, [part]: color };
    render();
  }

  /**
   * WADDLE IN / Save (also reached via Enter in the name field): refuses an
   * invalid name rather than relying on the button's `disabled` state alone,
   * so Enter can never bypass the name gate (#75).
   */
  function submit(): void {
    if (!draft || saving) return;
    const validation = validatePenguinName(draft.name);
    if (!validation.ok) return;
    callbacks.onSubmit({ ...draft, name: validation.name });
  }

  function markPressed(buttons: HTMLButtonElement[], selected: string): void {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.value === selected));
  }

  function renderFigure(): void {
    if (!draft) return;
    figure.innerHTML = renderPenguinSvg(
      draft,
      { anim: draft.emote, frame },
      { idPrefix: 'penguin-creator' },
    );
  }

  function stopAnimation(): void {
    if (frameTimer !== null) clearTimeout(frameTimer);
    frameTimer = null;
  }

  /** Restarts the chosen Idle animation from its first frame. */
  function restartAnimation(): void {
    stopAnimation();
    frame = 0;
    if (!draft || overlay.hidden || prefersReducedMotion()) return;
    const anim = draft.emote;
    if (PENGUIN_FRAMES[anim] < 2) return;
    const tick = (): void => {
      frame = (frame + 1) % PENGUIN_FRAMES[anim];
      renderFigure();
      frameTimer = setTimeout(tick, PENGUIN_FRAME_MS[anim]);
    };
    frameTimer = setTimeout(tick, PENGUIN_FRAME_MS[anim]);
  }

  let animatedEmote: PenguinLook['emote'] | null = null;

  /**
   * WADDLE IN / Save stays disabled while the draft name is invalid, in both
   * dismissible and non-dismissible mode: a HUD edit can't clear the name
   * this way either (#75). Re-applied on every render and by `setSaving`, so
   * `setSaving(false)` restores this rule instead of always re-enabling.
   */
  function applyNameValidity(): void {
    const validation = draft
      ? validatePenguinName(draft.name)
      : ({ ok: false, reason: 'empty' } as const);
    nameHintEl.textContent = nameHintMessage(validation);
    submitButton.disabled = saving || !validation.ok;
  }

  function render(): void {
    if (!draft) return;
    if (draft.emote !== animatedEmote) {
      animatedEmote = draft.emote;
      restartAnimation();
    }
    figure.dataset.emote = draft.emote;
    renderFigure();
    nameplate.textContent = normalizeName(draft.name) || UNNAMED_PENGUIN;
    if (nameInput.value !== draft.name) nameInput.value = draft.name;
    applyNameValidity();

    for (const { part, swatches, custom } of colorControls) {
      const current = draft[part];
      for (const b of swatches) {
        b.setAttribute('aria-pressed', String(sameColor(b.dataset.color ?? '', current)));
      }
      // <input type="color"> only accepts lowercase #rrggbb.
      custom.value = current.toLowerCase();
    }
    markPressed(hatGroup.buttons, draft.hat);
    markPressed(patternGroup.buttons, draft.pattern);
    markPressed(eyesGroup.buttons, draft.eyes);
    markPressed(emoteButtons, draft.emote);
    summary.textContent = `${draft.hat} · ${draft.pattern} · ${draft.eyes}`;
  }

  function showError(message: string): void {
    errorEl.textContent = message;
  }

  function setSaving(value: boolean): void {
    saving = value;
    cancelButton.disabled = value;
    submitButton.textContent = value ? 'SAVING…' : 'WADDLE IN →';
    // Restores `disabled = !valid` rather than always clearing it (#75).
    applyNameValidity();
  }

  function close(): void {
    if (overlay.hidden) return;
    overlay.hidden = true;
    stopAnimation();
  }

  return {
    open(initial, options) {
      draft = { ...initial };
      cancelButton.hidden = !options.dismissible;
      setSaving(false);
      showError('');
      overlay.hidden = false;
      animatedEmote = null;
      render();
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
