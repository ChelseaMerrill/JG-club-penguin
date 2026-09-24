# Jahnel Group Design System

The visual + content language used to make on-brand artifacts for **Jahnel Group** — a software and AI-services consultancy headquartered in Schenectady, NY (108 State St, 5th Floor). Founded ~2005, ~150 people across 27 states and 5 countries. Marketed as "world-class AI-enabled software creators." Core revenue lines: enterprise software development, AI/ML, staff augmentation, UX/UI, cloud, data analytics, recruiting services.

The brand is unapologetically **dark, condensed, and confident**. Big black backgrounds, electric cyan accents, all-caps Anton headlines, abrupt teal "stripe" graphics behind section titles, hexagonal motifs, and full-bleed candid team photography. Voice is plain-spoken, direct, slightly cocky. Not corporate-glossy.

## Source Material

- **Codebase:** `jg-website-v2-2020-redesign/` (HTML + Bootstrap 4 + jQuery, served via Gulp). The 2020+ marketing site for jahnelgroup.com.
- No Figma, no slide template, no app codebase provided — this system covers the **marketing-website** surface only.

---

## Index of files

```
/
├── README.md                       ← this file
├── SKILL.md                        ← Agent Skills entry point
├── colors_and_type.css             ← CSS vars: colors, semantic tokens, type scale
├── assets/
│   ├── logos/                      ← jg-logo-light/dark/bars (SVG), jg_logo.png
│   ├── clients/                    ← Google, Disney, WB, Bethesda, Godaddy, Atos, MIT, …
│   ├── icons/                      ← UI + service icons (SVG), socials, quote, chev, arrows
│   ├── textures/                   ← hexagon, texture-1/2/3, arrow-down (SVG drape graphics)
│   └── imagery/                    ← team photos, office, awards (BPTW, Inc. 5000, Top WP)
├── preview/                        ← cards rendered in the Design System tab
├── ui_kits/
│   └── marketing-site/             ← interactive recreation of the public website
│       ├── index.html
│       └── *.jsx
└── slides/                         ← (none — no slide template was provided)
```

---

## CONTENT FUNDAMENTALS

**Voice.** Plain, direct, slightly cocky. Builders talking to builders. Sentences are short. Almost no marketing fluff — when it appears it's deadpan ("Excellence is our approach to everything") rather than aspirational.

**Person.** "We" / "our" for JG. "You" / "your" for the prospect. Personal — "Our people on your team." "Our team crushing your project." Often turns the company into a singular character ("JG").

**Casing.** Major headlines are **ALL CAPS** (Anton). Sub-heads are sentence case (Libre Franklin Bold). Body is sentence case. Section labels (eyebrows, nav, button labels) are also ALL CAPS.

**Punctuation.** Em-dashes are common; ellipses appear in pull-quotes. Body copy is right-justified (`text-align: justify`) — a quirk worth preserving.

**Casing examples — section bars (h2):**
- "SOME COMPANIES WHO TRUST US"
- "HERE'S WHAT WE DO"
- "HERE'S HOW WE WORK WITH YOU"

**Headline examples (h1):**
- "Ready to Inspire You" / "Ready to Grind For You" (rotating verbs)
- "WE'VE CRACKED THE CODE ON CULTURE"
- "AI ENABLED SOLUTIONS, BUILT AROUND YOU"

**Sub-head examples (h4):**
- "Onshore, nearshore, and blended teams built for impact"
- "Can you still call it work when it's this much fun?"
- "Full stack AI enabled developers. Front to back."

**Tagline / mission:**
> Our mission is to provide the absolute best environment for software creators to pursue their passion by connecting them with great clients while doing meaningful work.

**Service-card body copy** is one-sentence-per-card, declarative, ~15–25 words. No bullet lists.

**Emoji?** No. None used in source.
**Unicode glyphs?** Sparingly — `→` and curly quotes `“ ”` `’`. Buttons use SVG arrows or CSS-triangle pseudo-elements.

**CTAs:** "Let's Talk", "Join Our Team", "Find out more", "Learn More", "Meet our team", "Contact us", "Join us", "Let's make it happen". Always Title Case, never sentence case for buttons.

---

## VISUAL FOUNDATIONS

### Colors
- **Primary:** `#00BDFF` — electric cyan-blue. Used for h3/h4 text, primary buttons, the half-bleed gradient behind award icons, hover/active states.
- **Secondary:** `#0C4B5F` — deep teal. Used as the bar-stripe behind section headlines, hex-tab fill, blockquote left-border + bg.
- **Light:** `#F4F4F4` — near-white. Body text, logo on dark, "Contact Us" button bg.
- **Dark:** `#161719` — page background. The brand lives on near-black, never on white.
- **Dark-2 / Dark-inlay:** `#494949` / `#202124` — secondary panels, inset sections, tab strips.
- **Active / Inactive:** `#808080` / `#B3B6C9` — inactive tab labels, faint secondary text.
- Orange (rgb 252,157,3) appears as a legacy accent in the `--orange-rgb` var but isn't actively used in current pages.

### Type
- **Display:** Anton (Google Fonts) — condensed, single-weight, ALL CAPS. Used for h1/h2/h3/h6 and any "headline moment."
- **Body:** Libre Franklin (Google Fonts) — humanist sans, weights 300/500/700/900. h4/h5 use 700; body uses 300.
- Sizes are **fluid** (`calc(28px + 3vw)` etc.) — they breathe huge on desktop and stay readable on phone.
- Body paragraphs are right-justified.

### Spacing
- Section vertical rhythm: `--spacer-sm: 60px` mobile, `--spacer-lg: 100px` desktop.
- Page horizontal gutters: `mx-2 mx-md-5 mx-xl-6` (Bootstrap utilities) — narrow on phone, generous on desktop.
- Internal grid gaps: 16/24/32px common; service cards use `gap: 5rem` between rows.

### Backgrounds & imagery
- Pages are dark by default. Hero areas are **full-bleed candid team photography** with a `linear-gradient(to top, var(--jg-dark), rgba(...0.6), rgba(...0.6))` vignette to fade into the dark page below.
- Color of imagery: warm, natural, slightly grainy candid photos. Office shots in B&W (`officebw.jpg`). No filters, no over-saturated stock.
- Repeating "texture" SVGs (`texture-1.svg`, `texture-2.svg`, `texture-3-left/right.svg`, `arrow-down.svg`) are decorative line/diagonal motifs placed at low opacity behind sections — never the focal point.
- The **hexagon** is the recurring brand shape. Used for service-tab navigators (`hex-tabs.css`), the JG pin-logo, and as a watermark behind hero areas.

### Animations
- Default duration `--jg-anim-duration: 250ms`.
- Easing is mostly `ease` / `ease-out`. The signature flourish is the section-header **bar slide-in** (`@keyframes slide-in-kf` — a `scaleX(5) → scaleX(1)` transform-origin from left/right) which makes the teal stripes "snap" into place from off-screen.
- `fade-in/fade-out`, `width-collapse/expand`, `scale-in/out`, `spin-in/out` (Y-axis rotation), and a horizontal `JGers` photo scroller are all available primitives.
- Animated typewriter on the homepage cycles verbs after "Ready to ___": Serve You, Grow With You, Inspire You, Grind For You.

### Hover states
- Buttons: `filter: brightness(0.9)` on hover. No color change.
- Recruit-buttons: `transform: scale(1.05)` on hover.
- Client logos: `.jg-hover-1pt1` (1.1× scale on hover).
- Hex tabs: change fill from `var(--jg-secondary)` to `rgba(var(--jg-secondary-rgb), 0.75)`.
- Nav links: opacity change to cyan.

### Press / active states
- Buttons keep `filter: brightness(0.9)` (no separate active style).
- Recruit buttons get an explicit border + scale.

### Borders & shadows
- Borders are minimal — a single hairline (`1px solid var(--jg-light)`) under the nav and around the map embed.
- **No box-shadow culture.** The system instead uses bold colored stripes/bars as separators (`heading-bars.css`).
- Focus state uses a glow: `box-shadow: 0 0 10px var(--jg-primary), 0 0 5px var(--jg-primary) inset`.

### Corner radii
- `--std-border-rad: 4px` — form fields, generic cards.
- Buttons use a "stadium" radius — `border-radius: half-height` — to make capsules. The signature "Let's Talk" button is a **lopsided pill** (`border-radius: 0 half var(--btn-padding-y) half half`) with three rounded corners and one square top-left corner.
- Pills `border-radius: 999px` for recruit CTAs.
- Cards: 5px (carousel item) or 1px–10px in select layouts.

### Cards
- Carousel cards: solid `var(--jg-primary)` cyan bg, dark text inside, 5px radius, no shadow. Author photo overlaps the top edge.
- Award cards: split into a square dark icon-area (with a half-cyan gradient backdrop) joined to a cyan text-area — no rounding.
- Service-card pattern (homepage): no card chrome at all — just an icon, an h4 in cyan, and a paragraph stacked on the dark page.

### Transparency & blur
- The nav **fades from transparent to `rgba(22,23,25,0.9)`** as the user scrolls, never solid.
- Hero overlays use `rgba(jg-dark, 0.6)` to mute photography under the headline.
- No backdrop-filter / blur in use.

### Layout rules
- Site is grid/flex via Bootstrap 4 utilities (`row`, `col-*`, `mx-*`, `py-*`).
- Section dividers are the bar-stripe headline pattern, not horizontal rules.
- Sticky/fixed: only the top nav.

### Iconography motif
- **Custom flat single-color SVGs** (white on dark) at ~33–48px. Slightly geometric, not skeumorphic. See ICONOGRAPHY below.

### The "stripe headline" — signature pattern
Every major section title sits inside a `jg-bar-inner-container-*` grid: a teal stripe extends from off-screen on one side to the headline, the headline sits centered, and another teal stripe extends from the other side. On scroll-in, the stripes slide-in. This is THE Jahnel Group visual signature. Recreate it for any section title.

---

## ICONOGRAPHY

**Style.** Custom **flat, single-color SVG icons** drawn in-house. Stroke is solid fill, not outline. Geometry is simple — a phone, an envelope, a map pin, a hexagon. They sit white-on-dark, at heights 18–48px depending on context.

**Sets in use** (all copied to `assets/icons/`):
1. **Service icons** (`service-software.svg`, `service-ai.svg`, `service-staff.svg`, `service-uiux.svg`, `service-cloud.svg`, `service-data.svg`, `service-games.svg`, `service-mobile.svg`) — appear above each service card on home/services pages.
2. **UI/utility icons** (`call.svg`, `email.svg`, `pin.svg`, `left.svg`, `right.svg`, `chev.svg`, `left-quote.svg`, `left-quote-secondary.svg`) — contact rows, carousel arrows, pull-quotes.
3. **Social icons** (`linkedin.svg`, `instagram.svg`, `facebook.svg`, `youtube.svg`, `x.svg`) — footer and hero.
4. **Texture motifs** (`hexagon.svg`, `arrow-down.svg`, `texture-1.svg`, `texture-2.svg`, `texture-3-left/right.svg`) — decorative, behind content at low opacity.

**Font Awesome 5.0.7** (CDN) is also linked across the site for fallback icons (`<i class="fas fa-…">`). When in doubt, use FA Solid in `var(--jg-light)` or `var(--jg-primary)` at the site's icon scale.

**Emoji.** Not used. **Unicode dingbats** appear only as quote glyphs (`“ ” ’`). Don't introduce emoji into Jahnel Group designs.

**Logos.** Three SVG primary marks:
- `jg-logo-light.svg` — wordmark, light/white version, used on dark page (default).
- `jg-logo-dark.svg` — same wordmark, dark version, for light backgrounds.
- `jg-logo-bars.svg` — the stacked "bars" mark with the teal stripe pattern. Used in the centered desktop nav and footer.
- `jg-pin.png` / `jg_logo.png` — raster fallbacks; pin is the hex-mark for map markers and favicons.

---

## Font availability

Both **Anton** and **Libre Franklin** are loaded directly from Google Fonts in source — no local TTF/OTF files exist in the repo. The system imports them the same way (see top of `colors_and_type.css`). No substitution flagging needed.

---

## Caveats / unknowns

- No proprietary product/app code was provided — UI kit covers the marketing site only.
- No slide template was provided — `slides/` is intentionally empty.
- No formal content style guide was given; the rules in CONTENT FUNDAMENTALS are inferred from the live copy on the marketing site.
