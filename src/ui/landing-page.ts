import { LANDING_CROWD, LANDING_HERO, landingPenguinSvg, landingStars } from './landing-art';

export interface LandingPageCallbacks {
  onSignIn: () => void;
  onSignOut: () => void;
}

export interface LandingPage {
  /** The full-Stage root element; mounted and shown by the caller. */
  el: HTMLElement;
  /** Sets (or clears, with '') the error line and its Sign out escape hatch. */
  setError(message: string): void;
}

/**
 * Builds the Landing page: the full 1600x900 screen signed-out visitors see,
 * with the logo, a waddling crowd and the sign-in buttons. Ported from
 * `design/Club JenGuin Landing.dc.html`. Both buttons start Google sign-in:
 * the only sign-in route, and first sign-in opens the Penguin Creator anyway.
 */
export function createLandingPage(callbacks: LandingPageCallbacks): LandingPage {
  const el = document.createElement('div');
  el.className = 'landing';

  const sky = document.createElement('div');
  sky.className = 'landing__sky';
  for (const star of landingStars()) {
    const s = document.createElement('span');
    s.className = 'landing__star';
    s.style.left = `${star.x}px`;
    s.style.top = `${star.y}px`;
    s.style.width = s.style.height = `${star.size}px`;
    s.style.opacity = String(star.opacity);
    sky.append(s);
  }
  const hex = document.createElement('div');
  hex.className = 'landing__hex';
  sky.append(hex);

  const hero = document.createElement('div');
  hero.className = 'landing__hero';
  hero.innerHTML = landingPenguinSvg(LANDING_HERO);

  const logo = document.createElement('h1');
  logo.className = 'landing__logo';
  logo.setAttribute('aria-label', 'Club JenGuin');
  logo.innerHTML =
    '<span class="landing__logo-club" aria-hidden="true">CLUB</span>' +
    '<span class="landing__logo-jenguin" aria-hidden="true">JENGUIN<span class="landing__logo-jg">JG</span></span>';

  const tagline = document.createElement('p');
  tagline.className = 'landing__tagline';
  tagline.textContent = 'Waddle around and ship new things!';

  const title = document.createElement('div');
  title.className = 'landing__title';
  title.append(logo, tagline);

  const crowd = document.createElement('div');
  crowd.className = 'landing__crowd';
  crowd.setAttribute('aria-hidden', 'true');
  for (const p of LANDING_CROWD) {
    const wrap = document.createElement('div');
    wrap.className = 'landing__bob';
    wrap.style.left = `${p.leftPct}%`;
    wrap.style.top = `${p.top}px`;
    wrap.style.width = `${p.width}px`;
    wrap.style.marginLeft = `${-p.width / 2}px`;
    wrap.style.animationDuration = `${p.bobSeconds}s`;
    wrap.style.animationDelay = `${p.bobDelaySeconds}s`;
    wrap.innerHTML = `<span class="landing__shadow"></span>${landingPenguinSvg(p)}`;
    crowd.append(wrap);
  }

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'landing__play';
  playButton.textContent = 'PLAY NOW';
  playButton.addEventListener('click', () => callbacks.onSignIn());

  const loginButton = document.createElement('button');
  loginButton.type = 'button';
  loginButton.className = 'landing__login';
  loginButton.textContent = 'LOG IN';
  loginButton.addEventListener('click', () => callbacks.onSignIn());

  const actions = document.createElement('div');
  actions.className = 'landing__actions';
  actions.append(playButton, loginButton);

  const pill = document.createElement('p');
  pill.className = 'landing__pill';
  pill.textContent = 'SIGN IN WITH GOOGLE · 108 STATE ST · FLOOR 5';

  const errorEl = document.createElement('p');
  errorEl.className = 'landing__error';
  errorEl.setAttribute('role', 'alert');

  // A way out when a load error strands the Player with a live Supabase auth
  // session but no loaded Player row: shown only while an error is set.
  const errorSignOutButton = document.createElement('button');
  errorSignOutButton.type = 'button';
  errorSignOutButton.className = 'landing__error-signout';
  errorSignOutButton.textContent = 'Sign out';
  errorSignOutButton.hidden = true;
  errorSignOutButton.addEventListener('click', () => callbacks.onSignOut());

  const errorRow = document.createElement('div');
  errorRow.className = 'landing__error-row';
  errorRow.append(errorEl, errorSignOutButton);

  const footer = document.createElement('p');
  footer.className = 'landing__footer';
  footer.textContent = "JAHNEL GROUP · WE'RE A PEOPLE COMPANY THAT HAPPENS TO BUILD SOFTWARE";

  el.append(sky, hero, title, crowd, actions, pill, errorRow, footer);

  return {
    el,
    setError(message: string) {
      errorEl.textContent = message;
      errorSignOutButton.hidden = !message;
    },
  };
}
