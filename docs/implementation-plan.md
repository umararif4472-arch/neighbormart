# Mobile App Prototype Implementation Plan (Flutter & Dart)

> **Status: Implemented (2026-11-04).** The Flutter app now lives in
> `mobile/` (see the README's "Run the mobile app" section). Two deviations
> from the plan below, both deliberate: the in-memory repository is the only
> data source for now (there is no Next.js `/api` in this repo to connect
> to — the web app is Vite + an in-browser mock layer), and platforms are
> scaffolded for Android, Web, and Windows. The plan is kept as the design
> record. The project was renamed from Borrow Don't Buy to
> **NeighborMart** on 2026-11-08; the plan text below is the original record.

Convert the "Borrow Don't Buy" hyperlocal lending network into a mobile application built with Flutter & Dart, structured around clean architecture, modern mobile UX, and a high-fidelity prototype that runs on Windows Desktop, Web, and mobile devices (Android/iOS).

## User Review Required

> [!IMPORTANT]
> **Prototype Data Strategy**:
> We will create the Flutter app inside a new `mobile/` directory. For the initial prototype phase, we will provide a **hybrid data repository**:
>
> 1. By default, it runs with rich, realistic in-memory mock data (identical to the web app with Maya Chen, 15 neighborhood items, trust scores, and active requests) for instant, frictionless mobile testing without requiring backend/database dependencies.
> 2. It will include an API client pre-configured to connect to your Next.js `/api` endpoints (`http://localhost:3000/api` or LAN IP for physical phones) whenever you choose to test with the live database.

> [!TIP]
> **Target Platforms**:
> Flutter supports multi-platform execution. We will verify the prototype on **Windows Desktop** and **Web** directly on your machine, and it will be ready to deploy to **Android** or **iOS**.

---

## Architecture & Project Structure

The mobile app will follow standard Flutter layered architecture (`UI -> ViewModel / State -> Repository -> Data Source`):

```text
mobile/
├── pubspec.yaml
├── lib/
│   ├── main.dart                       # App entry point, theme & providers
│   ├── core/
│   │   ├── theme/                      # Typography, green/amber warm color palette
│   │   ├── utils/                      # Trust score calculator, distance, formatting
│   │   └── widgets/                    # TrustBadge, CategoryPill, Avatar, StatusChip
│   ├── data/
│   │   ├── models/                     # Item, User, BorrowRequest, WishlistItem, Review
│   │   ├── mock/                       # Seed dataset (15 items, Richmond VA, users)
│   │   └── repositories/               # ItemRepository, RequestRepository, WishlistRepository
│   ├── state/                          # AppState (ChangeNotifier for items, user, requests)
│   └── ui/
│       ├── navigation/                 # BottomNavBar shell (Explore, Wishlist, Activity, Profile)
│       └── features/
│           ├── explore/                # Search bar, category filters, distance slider, item cards
│           ├── item_detail/            # Hero image, condition, owner trust card, borrow bottom sheet
│           ├── list_item/              # Mobile listing form (title, category, days, deposit)
│           ├── activity/               # Lending & borrowing requests with Accept/Decline/Return
│           ├── wishlist/               # Neighborhood wishlist cards + points pledge dialog
│           └── profile/                # Trust score breakdown (0-100), badges, my items
└── test/
    └── trust_score_test.dart           # Unit test port of trust algorithm
```

---

## Proposed Changes

### 1. Initialize Flutter Project

#### [NEW] [mobile/](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile)

- Generate a clean Flutter project in `mobile/` with package name `borrow_dont_buy`.
- Configure `pubspec.yaml` with required dependencies:
  - `provider` (simple, reactive state management)
  - `intl` (date formatting & currency)
  - `http` (for Next.js API integration)

### 2. Core Models & Business Logic

#### [NEW] [mobile/lib/data/models/](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/data/models)

- `item.dart`: Item model with title, category, photos, maxBorrowDays, deposit, lat/lng, owner.
- `user.dart`: User model with trust score, verifications, bio, points balance.
- `borrow_request.dart`: Request model with status (`pending`, `approved`, `active`, `returned`), dates, handoff type.
- `wishlist_item.dart`: Community wishlist item with targetPoints, requestCount, pointsPledged.

#### [NEW] [mobile/lib/core/utils/trust_score.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/core/utils/trust_score.dart)

- Port the pure 0–100 trust score algorithm from the web project (returns: 40pts, reviews: 25pts, phone verification: 10pts, account age: 10pts, responsiveness: 15pts).

### 3. State Management & Repositories

#### [NEW] [mobile/lib/state/app_state.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/state/app_state.dart)

- Manages current user (`Maya Chen`), active items list, search queries, category filters, borrow requests, and wishlist pledges with instant reactive updates.

### 4. UI Screens & Features

#### [NEW] [mobile/lib/ui/features/explore/explore_screen.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/ui/features/explore/explore_screen.dart)

- Search header with neighborhood location indicator ("Richmond, VA").
- Horizontal category chips (Tools, Outdoor, Lawn & Garden, Kitchen, etc.).
- Distance radius filter chip.
- Responsive grid / list of item cards showing photo, distance tag, daily fee / deposit, and owner trust badge.

#### [NEW] [mobile/lib/ui/features/item_detail/item_detail_screen.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/ui/features/item_detail/item_detail_screen.dart)

- Photo banner with condition badge.
- Owner card with trust tier and rating breakdown.
- Bottom floating bar with "Borrow Item" button triggering a borrow modal (select dates, handoff preference: in-person / porch drop, note to owner).

#### [NEW] [mobile/lib/ui/features/list_item/list_item_screen.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/ui/features/list_item/list_item_screen.dart)

- Mobile-friendly listing wizard to add an item to the neighborhood catalog with validation.

#### [NEW] [mobile/lib/ui/features/activity/activity_screen.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/ui/features/activity/activity_screen.dart)

- Tabbed view: "Borrowing" vs "Lending".
- Live status chips (`Pending`, `Approved`, `Active`, `Returned`).
- Action buttons: Approve/Decline requests, Mark as Handed Off / Returned.

#### [NEW] [mobile/lib/ui/features/wishlist/wishlist_screen.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/ui/features/wishlist/wishlist_screen.dart)

- Community wishlist with progress bars and "Pledge Points" or "I Need This Too" actions.

#### [NEW] [mobile/lib/ui/features/profile/profile_screen.dart](file:///c:/Users/D%20E%20L%20L/OneDrive/Desktop/Borrow%20Don%27t%20Buy/mobile/lib/ui/features/profile/profile_screen.dart)

- Visual trust meter (0-100), reputation badge, account details, points balance, and listed items tab.

---

## Verification Plan

### Automated Tests

- Unit tests for trust score calculation and mock state updates:
  ```bash
  cd mobile
  flutter test
  ```

### Build & Run Verification

- Build and run the prototype on Windows desktop or Chrome:
  ```bash
  cd mobile
  flutter run -d windows
  # or
  flutter run -d chrome
  ```
- Verify all primary interactive flows:
  1. Browse items, filter by category and search term.
  2. View item details and submit a borrow request.
  3. Check Activity tab to see the new request appear in real-time.
  4. Test listing a new item and seeing it immediately in the Explore feed.
  5. Test pledging points in the Neighborhood Wishlist.
