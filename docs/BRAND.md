# NeighborMart Brand — "Open Door"

Source of truth: the brand kit (`NeighborMart-Brand-Kit/`, README.txt).
The kit files are used **verbatim** — never redraw, recolor or
"improve" the logo. If a needed file is missing, ask for it instead of
inventing a replacement.

- **Name:** NeighborMart (placeholder — rename via `APP_NAME` in
  `src/config.ts` on web, the matching constant in Flutter, plus the
  static copies in `index.html` / `public/manifest.webmanifest` and
  the wordmark artwork).
- **Tagline:** "Everything behind the door" (sentence case, verbatim
  everywhere — `APP_TAGLINE` in `src/config.ts`).

## Palette

| Token | Hex | Usage |
| --- | --- | --- |
| Terracotta | `#A44B2D` | Primary brand/action color, logo plate, intro field (light) |
| Cream | `#F6EBDD` | Light canvas; text on terracotta/door fields |
| Door dark | `#5E2815` | The door leaf; text on cream buttons (`--color-door`) |
| Amber | `#D99A2B` | Doorknob + welcome mat; Items accent (graphics) |
| Ink | `#3A2218` | Primary text on light surfaces |
| Warm charcoal | `#201B16` | Dark canvas; intro field (dark). Surfaces `#2A251F` / `#38312A` |

### Section accents (exact kit hexes — graphics)

| Section | Hex | Where the exact hex appears |
| --- | --- | --- |
| Items & Tools | `#D99A2B` | `--color-brand-items`, login hero icon tile |
| Vehicles | `#3B7DD8` | `--color-brand-vehicles`, login hero icon tile |
| Properties | `#8E4A8B` | `--color-brand-properties`, login hero icon tile (+ text, see below) |
| Arenas & Venues | `#4F8A4B` | `--color-brand-arenas`, login hero icon tile |

### Text shades of the section hues (WCAG AA)

Most kit accent hexes cannot reach the 4.5:1 AA ratio as small text,
so text-facing tokens (`--nm-accent-*` in `src/index.css`, used by
`text-accent-*` / section chips) are shades of the same hues that do
pass. Measured on the cream canvas `#F6EBDD` / dark canvas `#201B16`:

| Accent | Kit hex as text | Text token used |
| --- | --- | --- |
| Items | `#D99A2B` → 2.07:1 ✗ (light) · 7.00:1 ✓ (dark) | light `#A84E09` (4.75:1); dark uses the exact kit hex |
| Vehicles | `#3B7DD8` → 3.49:1 ✗ (light) · 4.16:1 ✗ (dark) | light `#1D4ED8`; dark `#60A5FA` |
| Properties | `#8E4A8B` → 5.10:1 ✓ (light) · 2.85:1 ✗ (dark) | light uses the exact kit hex; dark `#C084FC` |
| Arenas | `#4F8A4B` → 3.52:1 ✗ (light) · 4.12:1 ✗ (dark) | light `#146C36`; dark `#4ADE80` |

Brand pairs that the guard (`src/utils/colorGuard.test.ts`) asserts
at ≥ 4.5:1 — all pass: cream on terracotta **4.93**, cream on door
dark **9.97**, ink on cream **12.55**, amber on dark canvas **7.00**.
Amber text on terracotta is 2.38:1 and is forbidden by the guard —
use cream there.

## Wordmark & type

- The wordmark is set in **Poppins Bold** (Google Fonts, weights
  600/700 loaded in `index.html`; `--font-display` token).
- "Neighbor" in ink `#3A2218`, "Mart" in terracotta `#A44B2D`. On dark
  backgrounds: "Neighbor" in cream, "Mart" in the kit's lightened
  terracotta `#D9805F` (token `--color-wordmark-mart`).
- Naming note: despite the file names, `logo-wordmark-light.svg` is
  the version **for light backgrounds** (transparent, ink text) and
  `logo-wordmark-dark.svg` is **for dark backgrounds** (cream text on
  a baked `#1E1410` plate). Place by content, not by file name.

## Placement rules

- **≤ 48px:** use `logo-symbol-simple.svg` (no welcome mat).
- **Dark backgrounds:** use `logo-symbol-dark.svg`; light backgrounds
  use `logo-symbol.svg` / `logo-symbol-simple.svg`.
- The door hinge is the leaf's left edge (x=176 in the 512 viewBox) —
  see the intro animation in `src/components/DoorIntro.tsx`.

## File usage — Web

| Kit file | Destination / placement |
| --- | --- |
| `web/favicon.ico` | `public/favicon.ico` |
| `png/favicon/favicon-16/32/48.png` | `public/favicon-16.png` etc. (48 added) |
| `svg/logo-symbol.svg` | `public/favicon.svg`; 404 page; sign-in hero (64px) |
| `web/apple-touch-icon.png` | `public/apple-touch-icon.png` |
| `png/pwa/icon-192.png`, `icon-512.png` | `public/` (PWA + install prompt) |
| `png/pwa/icon-maskable-192/512.png` | `public/` (manifest, `purpose: maskable`) |
| `png/social/social-preview-1200x630.png` | `public/social-preview.png` (og:image / twitter:image) |
| `svg/logo-symbol-simple.svg` | Navbar/footer mark (36px, light) via `LogoMark` |
| `svg/logo-symbol-dark.svg` | Navbar/footer mark (dark mode) via `LogoMark` |
| `svg/splash-closed-door.svg` | Geometry reference for `DoorIntro` (paths inlined verbatim for the hinge animation) |
| `svg/logo-wordmark-light.svg` / `-dark.svg` | `src/assets/brand/` (lockups; text wordmark in navbar is Poppins per above) |
| `png/wordmark/wordmark-light.png` / `-dark.png` | README header (light/dark via `<picture>`) |
| Full `svg/` set | `src/assets/brand/` for component use |

Surfaces: navbar + footer (`Layout.tsx`), boot error screen
(`BootScreens.tsx` via `LogoMark`), sign-in hero (`SignInPage.tsx`),
404 (`NotFoundPage.tsx`), install prompt (`InstallPrompt.tsx`,
`/icon-192.png`), offline page (`public/offline.html`, symbol inlined
verbatim), door intro (`DoorIntro.tsx`).

## File usage — Flutter

_Pending — appended by the Flutter brand pass._
