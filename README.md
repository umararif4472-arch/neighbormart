# NeighborMart — Local Marketplace

> Borrow, rent, buy, or sell almost anything — right in your own city.

A local marketplace where people list what they own and neighbors can
**borrow it free, rent it, or buy it outright**. One app, four sections:

| Section             | Examples                                                                          | Ways to deal                      |
| ------------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| **Items & Tools**   | Tools, gear, party equipment, electronics, furniture                              | Borrow (free) · Rent · Sell       |
| **Vehicles**        | Cars, bikes, motorcycles, vans, trucks, bicycles                                  | Rent (hour/day/week/month) · Sell |
| **Properties**      | Houses, apartments, rooms, plots, shops, offices                                  | Rent (month/day) · Sell           |
| **Arenas & Venues** | Cricket grounds, football turfs, padel/tennis courts, gyms, banquet & event halls | Hourly/daily slot booking         |

Every listing has a type — **Borrow / Rent / Sell** — and belongs to one
section, with its own filters, listing fields, and card design. Trust is
built through a transparent reputation score, reviews, and verification —
deals are arranged in chat and confirmed in the app. **No payment
processing in this release**; a clean service interface leaves room to add
JazzCash / Easypaisa / Stripe later.

> **Status:** working prototype being rebuilt into the marketplace above,
> in phases (see [Roadmap](#roadmap)). Today the web and Flutter apps run
> end-to-end against an in-memory mock service layer with the original
> lending flow; the multi-section data model, Firebase backend, and
> section experiences land in Phases 2–5. Originally prototyped as
> "Borrow Don't Buy"; renamed to **NeighborMart** on 2026-11-08 because
> the old name only described lending.

This repo has two apps for the same product:

- **Web** (repo root) — React + TypeScript + Vite, described below.
- **Mobile** (`mobile/`) — Flutter + Dart, same seed data, trust-score
  formula, and request lifecycle. See [Run the mobile app](#run-the-mobile-app-flutter).

## Features

**Working today (prototype, mock data)**

- Browse, search, category/distance/availability filters, map + list views
- Listing detail with photo gallery, owner trust card, borrow requests
  with date validation and overlap checks
- Request lifecycle: pending → approved → active → returned → reviewed
- List-an-item wizard with per-step validation and autosaved drafts
- Trust score (pure function, 0–100 + tiers) from returns, reviews,
  verification, account age, and responsiveness
- In-app messages per request, notifications, reviews, report-an-issue
- Dashboard for incoming/outgoing requests; profiles with trust breakdown

**Coming with the marketplace rebuild (Phases 2–7)**

- Unified `Listing` model across all four sections (see Roadmap)
- Firebase Auth (Google Sign-In + email fallback), Firestore, Storage
- Multi-photo upload with compression, reorder, and cover photo
- Section-specific browse pages, filters, cards, and listing wizards
- Arena slot booking with a no-double-booking guarantee
- Make-an-offer / negotiation chat for sell listings
- Owner dashboard with listing stats; animated login + onboarding

## Tech stack

| Layer    | Web                                     | Mobile                |
| -------- | --------------------------------------- | --------------------- |
| Language | TypeScript (strict)                     | Dart                  |
| UI       | React 19, React Router 7                | Flutter               |
| Styling  | Tailwind CSS 4                          | Material theme        |
| Build    | Vite 6                                  | Flutter SDK           |
| Tests    | Vitest (98 unit tests)                  | flutter_test          |
| Backend  | Mock service layer → Firebase (Phase 3) | Same Firebase project |

Architecture rule that keeps the mock layer swappable: **components only
talk to `@/services` and `@/context`** — never to seed data or the store
directly. Replacing the backend means reimplementing `src/services/*`
behind the same function signatures.

## Setup (web)

```bash
npm install
npm run dev        # → http://localhost:5173
```

No environment variables are needed yet — the mock layer runs fully
in-browser. You're "signed in" as **Maya Chen** (`u-maya`), the mock
session user.

### Environment variables

Copy `.env.example` to `.env.local` when Phase 3 lands. All variables are
`VITE_`-prefixed (public by design; real protection is Firebase Security
Rules):

| Variable                            | Purpose                          |
| ----------------------------------- | -------------------------------- |
| `VITE_FIREBASE_API_KEY`             | Firebase web app key             |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase Auth domain             |
| `VITE_FIREBASE_PROJECT_ID`          | Firebase project id              |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase Storage bucket          |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender id                    |
| `VITE_FIREBASE_APP_ID`              | Firebase web app id              |
| `VITE_FIREBASE_MEASUREMENT_ID`      | (Optional) Analytics id          |
| `VITE_DEFAULT_CURRENCY`             | Default listing currency (`PKR`) |

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # Type-check (tsc) + production build
npm run preview      # Serve the production build
npm test             # Vitest unit tests (pure utils + form reducer)
npm run test:watch   # Vitest in watch mode
npm run typecheck    # tsc --noEmit only
npm run lint         # ESLint (flat config) — must pass with zero warnings
npm run lint:fix     # ESLint with autofix
npm run format       # Prettier --write
npm run format:check # Prettier --check (CI)
```

## Run the mobile app (Flutter)

```bash
cd mobile
flutter pub get
flutter run -d chrome     # or an Android device / Windows desktop
flutter test
flutter analyze
```

The Flutter app lives in `mobile/lib/` — feature-first screens over a
single `AppState` (`provider`), with models, seed data, and the
trust-score calculator ported 1:1 from the web app so both clients agree
on scores.

## Project structure

```text
src/
├ types/          # Data models (User, Item → Listing in Phase 2, …)
├ utils/          # Pure logic — trustScore, dates, distance, filters (unit-tested)
├ data/seed/      # Mock seed data (builders with relative dates)
├ services/       # Data-access layer: in-memory "DB" + async API enforcing
│                   #   all business rules (the layer Firebase replaces)
├ context/        # AppProvider + ToastProvider (global state, hydration)
├ hooks/          # useItems, useFilteredItems, useTrustScore(s), useRequests, …
├ components/     # Presentational kit: ui/, items/, reviews/, layout/
└ features/       # Pages: landing, browse (+map), item-detail, list-item,
                  #   dashboard, messages, profile, trust, not-found
docs/             # Design record — implementation-plan.md (Flutter plan)
mobile/           # Flutter app (same product, same seed data)
```

### Key design decisions

- **Trust score is a pure function** (`utils/trustScore.ts`): history in →
  0–100 score + tier out, never stored. Weights today: on-time returns
  40 · reviews 25 · verification 10 · account age 10 · responsiveness 15.
  Phase 2 extends it to sellers and renters (completed deals, response time).
- **The service layer is the mock server.** All mutations validate there
  (ownership, state transitions, date overlaps, one review per deal), so
  client validation can't drift into data corruption. Reads deep-clone,
  like an HTTP boundary would.
- **List-an-item is one reducer** with autosaved drafts (localStorage).

## Deployment

- **Web:** the production build is a static bundle (`npm run build` →
  `dist/`). Deploy to Firebase Hosting or Vercel; preview deployments and
  a one-command deploy are set up in Phase 8. The Flutter web build is
  currently published for testing at
  https://umararif4472-arch.github.io/borrowdontbuy-web/
- **Android:** `cd mobile && flutter build apk --release` (or
  `flutter build appbundle` for Play). This repo's GitHub Actions workflow
  (`.github/workflows/build-apk.yml`) builds the release APK on changes
  under `mobile/`.

## Roadmap

- [x] **Phase 1 — Clean repo:** dead code out, ESLint + Prettier, docs,
      LICENSE, env template, this README
- [ ] **Phase 2 — Data model:** unified `Listing` (items / vehicles /
      properties / arenas), extended trust score, realistic seed data
- [ ] **Phase 3 — Real backend:** Firebase Auth (Google Sign-In),
      Firestore, Storage, security rules, indexes; mirrored in Flutter
- [ ] **Phase 4 — Photo upload:** multi-photo, compression, reorder,
      cover photo, full-screen gallery
- [ ] **Phase 5 — Section experiences:** section pages/filters/cards,
      5-step listing wizard, arena slot booking, owner dashboard
- [ ] **Phase 6 — Animated login & onboarding**
- [ ] **Phase 7 — Professional UI/UX:** design system, dark mode,
      accessibility (WCAG AA), performance budgets
- [ ] **Phase 8 — Launch readiness:** PWA, SEO, legal pages, moderation,
      CI, launch checklist (`docs/LAUNCH_CHECKLIST.md`)
- [ ] **Later:** payments (JazzCash / Easypaisa / Stripe) behind the
      existing service interface

## License

MIT — see [LICENSE](LICENSE).
