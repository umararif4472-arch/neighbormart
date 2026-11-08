# NeighborMart — Mobile

Flutter port of NeighborMart: borrow, rent, buy, and sell tools, gear, vehicles,
properties, and more
from neighbors instead of buying them, with trust built through a 0–100
reputation score instead of payments.

## Run

```bash
flutter pub get
flutter run -d chrome    # or windows / an Android device
flutter test             # trust-score, app-state, and widget tests
flutter analyze
```

## Structure

```
lib/
├ core/       theme (terracotta / moss / cream, Material 3),
│             trust-score calculator, map projection, formatters,
│             shared widgets + reviews list
├ data/       models (User, Item, BorrowRequest, WishlistItem,
│             Message, AppNotification) and mock seed data
├ state/      AppState (provider / ChangeNotifier) — auth session,
│             filtering, request lifecycle, messages, reviews,
│             derived notifications, wishlist, verification
└ ui/         app root gate (Splash → Onboarding → Landing/Login →
              AppShell) and feature screens: auth (login, sign up,
              forgot password), explore (+ map view), item detail
              (+ photo gallery), list-item wizard with drafts,
              activity (+ review / report-issue sheets), messages,
              notifications, wishlist, trust explainer, not-found,
              profile (public profiles, edit, settings, verification,
              manage my items)
```

Demo accounts: every seeded neighbor signs in with
`<firstname>.<lastname>@example.com` / the demo password set via `DEMO_SEED_PASSWORD` when seeding (shown on the login
screen, with one-tap neighbor login). Verification codes are demo-only:
use `123456`. Session, onboarding, and listing drafts persist on-device
via shared_preferences.

State is in-memory for the prototype, same seed users/items/requests as
the web app at the repo root, so trust scores match across both clients.
