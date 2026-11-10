import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/firebase/firebase_init.dart';
import '../core/theme/theme_preference.dart';
import '../core/utils/trust_score.dart';
import '../core/utils/formatters.dart';
import '../core/utils/profile_setup_validation.dart';
import '../data/models/user.dart';
import '../data/models/item.dart';
import '../data/models/listing.dart';
import '../data/models/borrow_request.dart';
import '../data/models/wishlist_item.dart';
import '../data/models/message.dart';
import '../data/models/app_notification.dart';
import '../data/models/report.dart';
import '../data/mock/seed_data.dart';
import '../data/mock/seed_listings.dart';
import '../data/models/firestore_maps.dart';
import '../data/services/auth_service.dart';
import '../data/services/live_sync.dart';
import '../data/services/paged_window.dart';
import '../data/services/safety_service.dart';

/// Groups [items] by category for the sectioned Explore list. Sections
/// follow the canonical [kItemCategories] order (any unknown category
/// keeps its first-seen order at the end), and empty categories are
/// omitted entirely.
Map<String, List<Item>> groupItemsByCategory(List<Item> items) {
  final grouped = <String, List<Item>>{};
  for (final category in kItemCategories) {
    final inCategory = items.where((i) => i.category == category).toList();
    if (inCategory.isNotEmpty) grouped[category] = inCategory;
  }
  for (final item in items) {
    if (!kItemCategories.contains(item.category)) {
      grouped.putIfAbsent(item.category, () => []).add(item);
    }
  }
  return grouped;
}

/// Phase 8 block filtering, kept pure so both the Explore/section
/// lists and the tests share one rule: a listing is hidden when its
/// owner is in [blockedOwnerIds].
List<Listing> listingsExcludingBlocked(
  List<Listing> listings,
  Set<String> blockedOwnerIds,
) => listings.where((l) => !blockedOwnerIds.contains(l.ownerId)).toList();

/// The legacy-items twin of [listingsExcludingBlocked].
List<Item> itemsExcludingBlocked(
  List<Item> items,
  Set<String> blockedOwnerIds,
) => items.where((i) => !blockedOwnerIds.contains(i.ownerId)).toList();

class AppState extends ChangeNotifier {
  static const _kSessionUserId = 'sessionUserId';
  static const _kOnboardingSeen = 'onboardingSeen';

  /// Prefix for the per-user Phase 6 profile-setup payload (JSON).
  /// The app has no general user-data store — session + this payload
  /// are what SharedPreferences carries.
  static const _kProfileSetupPrefix = 'profileSetup:';

  late List<AppUser> _users;
  late List<Item> _items;

  /// The unified Phase 2/5 catalog (all four sections). Items-section
  /// entries share ids with [_items]; the legacy list remains the
  /// working surface for the original borrow flows.
  late List<Listing> _listings;
  late List<BorrowRequest> _requests;
  late List<WishlistItem> _wishlist;
  late List<Review> _reviews;
  late List<Message> _messages;

  /// Content reports filed from this device (Phase 8). Locally these
  /// are the record; in Firebase mode each is also mirrored to the
  /// shared `reports` collection for moderation.
  late List<Report> _reports;
  int _idCounter = 100;

  // ---------------- Live backend (Phase 10) ----------------
  //
  // In live mode the seed catalog is replaced by Firestore data:
  // [enableLiveMode] (called from main when Firebase initialized)
  // clears every collection and loads the first PAGED browse window
  // of listings (24 active listings per section, newest first — the
  // canonical query in live_sync.dart); Explore/section views page
  // further via [loadMoreListings]. There are NO whole-collection
  // listeners: user profiles live in an on-demand cache
  // ([ensureUserLoaded]), reviews are fetched per user / per listing
  // ([ensureReviewsForUser] / [ensureReviewsForListing]), and only
  // the signed-in user's own profile doc, their requests, their
  // (capped) message threads and their latest 50 notifications keep
  // live listeners. Mutations keep working on the local lists
  // (instant UI) and mirror to Firestore through LiveSync.
  // Local/demo mode (tests, no google-services.json) never sets this
  // flag and behaves exactly as before: the full seed catalog, seed
  // users and seed reviews are in memory and every paging/fetch
  // method below is a no-op over them.
  bool liveMode = false;
  LiveSession? _publicLive;
  LiveSession? _userLive;
  AppUser? _adoptedUser;
  List<NotificationDoc> _remoteNotifications = [];

  /// Per-section loaded browse windows (live mode only). [_listings]
  /// is the union of these windows plus any locally created / locally
  /// mutated listings; the windows provide dedup + has-more
  /// bookkeeping for [loadMoreListings].
  final Map<ListingSection, PagedWindow<Listing>> _listingWindows = {
    for (final s in ListingSection.values)
      s: PagedWindow<Listing>(pageSize: kListingPageSize, idOf: (l) => l.id),
  };
  final Set<ListingSection> _listingPagesInFlight = {};

  /// In-flight profile fetches, so concurrent [ensureUserLoaded]
  /// calls for the same id share one document read.
  final Map<String, Future<AppUser?>> _userFetches = {};

  /// Review sets already fetched in live mode: `user:<id>` /
  /// `listing:<id>` keys, plus the in-flight futures by the same key.
  final Set<String> _reviewSetsFetched = {};
  final Map<String, Future<void>> _reviewFetches = {};

  void _mirror(Future<void> future) {
    future.catchError((_) {});
  }

  @override
  void dispose() {
    _publicLive?.cancel();
    _userLive?.cancel();
    super.dispose();
  }

  /// Switch this state to the live backend: drop all seed/demo data
  /// and hydrate from Firestore. An empty database simply leaves the
  /// collections empty — every screen already has an empty state.
  void enableLiveMode() {
    if (liveMode) return;
    liveMode = true;
    _users = [];
    _items = [];
    _listings = [];
    _requests = [];
    _reviews = [];
    _messages = [];
    _wishlist = [];
    _reports = [];
    _remoteNotifications = [];
    _favoriteItemIds.clear();
    isLoggedIn = false;
    if (firebaseReady) {
      final session = LiveSession();
      _publicLive = session;
      // First page per section (signed-out browse works — listings
      // are publicly readable). No listeners on listings/users/
      // reviews: further pages load via [loadMoreListings], profiles
      // and reviews on demand.
      session.loadListingFirstPages(
        (section, page) => applyListingPage(section, page),
      );
    }
    notifyListeners();
  }

  void _rebuildItemsFromListings() {
    _items = _listings.whereType<ItemListing>().map(itemFromListing).toList();
  }

  /// Merge one fetched browse page for [section] into the catalog.
  ///
  /// Public because the live layer delivers pages through it — and
  /// because tests drive it directly to verify paging behavior
  /// without a backend. Rows are deduplicated by id across pages (an
  /// already-loaded listing is refreshed in place, never duplicated);
  /// locally created listings that no page has returned yet are kept.
  /// The legacy item list is rebuilt from the loaded window only.
  void applyListingPage(ListingSection section, List<Listing> page) {
    if (!liveMode) return;
    _listingWindows[section]!.appendPage(page);
    for (final listing in page) {
      final idx = _listings.indexWhere((l) => l.id == listing.id);
      if (idx >= 0) {
        _listings[idx] = listing;
      } else {
        _listings.add(listing);
      }
    }
    _listings.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    _rebuildItemsFromListings();
    notifyListeners();
    // Owner cards/counters read profiles from the cache — warm it
    // for this page's owners (one document read per NEW owner).
    for (final ownerId in page.map((l) => l.ownerId).toSet()) {
      ensureUserLoaded(ownerId);
    }
  }

  /// Whether another browse page likely exists for [section].
  /// Always false in local/demo mode (the whole seed catalog is
  /// already loaded, so paging is a no-op there).
  bool hasMoreListingsFor(ListingSection section) =>
      liveMode && _listingWindows[section]!.hasMore;

  bool isLoadingListingsFor(ListingSection section) =>
      _listingPagesInFlight.contains(section);

  /// Load the next browse page for [section] (Explore / section
  /// views call this on scroll-to-end). No-op in local mode, when
  /// the section is exhausted, or while a page is in flight.
  Future<void> loadMoreListings({required ListingSection section}) async {
    if (!liveMode || !firebaseReady) return;
    final session = _publicLive;
    if (session == null || !hasMoreListingsFor(section)) return;
    if (!_listingPagesInFlight.add(section)) return;
    try {
      await session.loadMoreListings(
        section,
        (s, page) => applyListingPage(s, page),
      );
    } finally {
      _listingPagesInFlight.remove(section);
    }
  }

  /// Load a single listing by id when it sits outside the loaded
  /// browse window (deep link, request thread, own paused listing).
  /// No-op when already loaded or in local mode.
  Future<void> ensureListingLoaded(String listingId) async {
    if (!liveMode || listingId.isEmpty) return;
    if (listingByIdOrNull(listingId) != null) return;
    final listing = await LiveSync.instance
        .fetchListingById(listingId)
        .catchError((_) => null);
    if (listing == null || listingByIdOrNull(listingId) != null) return;
    _listings.add(listing);
    _rebuildItemsFromListings();
    notifyListeners();
    ensureUserLoaded(listing.ownerId);
  }

  // ---------------- On-demand profiles (live mode) ----------------

  /// Upsert [user] into the profile cache ([_users] in live mode is
  /// a cache of profiles actually needed, NOT the whole users
  /// collection). The signed-in user's own entry is never clobbered
  /// by a stale fetch — the own-profile listener owns it.
  void cacheUser(AppUser user) {
    final idx = _users.indexWhere((u) => u.id == user.id);
    if (idx >= 0) {
      _users[idx] = user;
    } else {
      _users.add(user);
    }
  }

  /// Make sure [userId]'s profile is in the cache, fetching its one
  /// document in live mode when missing. Returns the profile (or null
  /// when it does not exist). Screens call this for the profiles they
  /// show — owner cards, chat counterparts, profile screens — and
  /// rebuild from the placeholder/loading state when it lands.
  /// In local mode every seed user is already present, so this just
  /// reads the cache and never touches the network.
  Future<AppUser?> ensureUserLoaded(String userId) async {
    if (userId.isEmpty) return null;
    final cached = userByIdOrNull(userId);
    if (cached != null) return cached;
    if (!liveMode) return null;
    final inFlight = _userFetches[userId];
    if (inFlight != null) return inFlight;
    final future = LiveSync.instance
        .fetchUserById(userId)
        .catchError((_) => null)
        .then((user) {
          _userFetches.remove(userId);
          if (user != null && liveMode) {
            cacheUser(user);
            notifyListeners();
          }
          return user;
        });
    _userFetches[userId] = future;
    return future;
  }

  // ---------------- On-demand reviews (live mode) ----------------

  /// Fetch (once) the reviews [userId] received, for profile/trust
  /// screens. Local mode already holds every seed review.
  Future<void> ensureReviewsForUser(String userId) =>
      _ensureReviews('user:$userId', () async {
        final fetched = await LiveSync.instance.fetchReviewsForUser(userId);
        _mergeReviews(fetched);
      });

  /// Fetch (once) the reviews written about [listingId], for detail
  /// screens. Local mode already holds every seed review.
  Future<void> ensureReviewsForListing(String listingId) => _ensureReviews(
    'listing:$listingId',
    () async {
      final fetched = await LiveSync.instance.fetchReviewsForListing(listingId);
      _mergeReviews(fetched);
    },
  );

  Future<void> _ensureReviews(String key, Future<void> Function() fetch) async {
    if (!liveMode || key.endsWith(':')) return;
    if (_reviewSetsFetched.contains(key)) return;
    final inFlight = _reviewFetches[key];
    if (inFlight != null) return inFlight;
    final future =
        () async {
          await fetch();
          // Only a completed fetch marks the set — including an
          // empty result, so empty profiles don't refetch on every
          // rebuild — while a failure stays retryable.
          _reviewSetsFetched.add(key);
        }().catchError((_) {}).whenComplete(() {
          _reviewFetches.remove(key);
        });
    _reviewFetches[key] = future;
    await future;
  }

  void _mergeReviews(List<Review> fetched) {
    if (fetched.isEmpty) return;
    final known = _reviews.map((r) => r.id).toSet();
    final fresh = fetched.where((r) => !known.contains(r.id)).toList();
    if (fresh.isEmpty) return;
    _reviews = [...fresh, ..._reviews];
    notifyListeners();
    // Review rows display reviewer names — warm those profiles.
    for (final reviewerId in fresh.map((r) => r.reviewerId).toSet()) {
      ensureUserLoaded(reviewerId);
    }
  }

  void _applyRemoteRequests(List<BorrowRequest> remote) {
    if (!liveMode) return;
    final remoteIds = remote.map((r) => r.id).toSet();
    final pending = _requests
        .where(
          (r) =>
              !remoteIds.contains(r.id) &&
              r.borrowerId == _currentUserId &&
              DateTime.now().difference(r.createdAt) <
                  const Duration(seconds: 30),
        )
        .toList();
    _requests = [...pending, ...remote];
    notifyListeners();
    // Activity / Messages / chat resolve both parties by id — warm
    // the profile cache for everyone these requests involve (listings
    // referenced by requests outside the browse window are fetched
    // too, so owner resolution works for them).
    for (final r in remote) {
      ensureUserLoaded(r.borrowerId);
      final ownerId = ownerIdFor(r);
      if (ownerId.isNotEmpty) {
        ensureUserLoaded(ownerId);
      } else {
        ensureListingLoaded(r.itemId);
      }
    }
  }

  void _applyRemoteMessages(List<Message> remote) {
    if (!liveMode) return;
    _messages = List.of(remote);
    notifyListeners();
  }

  /// Whether [requestId]'s chat thread likely has messages older
  /// than the loaded latest page (live mode only).
  bool hasOlderMessages(String requestId) =>
      liveMode && (_userLive?.threadHasOlder(requestId) ?? false);

  /// Page the next older chunk of [requestId]'s thread into memory
  /// (chat screen's "load older" affordance). No-op in local mode —
  /// the whole seed thread is already loaded — and at the start of
  /// the thread.
  Future<void> loadOlderMessages(String requestId) async {
    if (!liveMode) return;
    await _userLive?.loadOlderMessages(requestId);
  }

  void _applyRemoteNotifications(List<NotificationDoc> remote) {
    if (!liveMode) return;
    _remoteNotifications = List.of(remote);
    notifyListeners();
  }

  void _applyOwnProfile(String uid, Map<String, dynamic> data) {
    if (!liveMode) return;
    // The signed-in user's OWN doc keeps its live listener: keep the
    // cached copy of their profile in step with it (this is the only
    // profile that is ever mirrored live).
    if (data.isNotEmpty) {
      final fresh = FirebaseAuthService.instance.userFromDocData(uid, data);
      final existing = userByIdOrNull(uid);
      if (existing == null) {
        cacheUser(_adoptedUser ?? fresh);
        notifyListeners();
      } else if (existing.name != fresh.name ||
          existing.bio != fresh.bio ||
          existing.neighborhood != fresh.neighborhood ||
          existing.city != fresh.city ||
          existing.phoneVerified != fresh.phoneVerified ||
          existing.emailVerified != fresh.emailVerified ||
          existing.stats.completedDeals != fresh.stats.completedDeals) {
        // Keep any device-local block list when the doc predates it.
        cacheUser(
          fresh.copyWith(
            blockedUserIds: fresh.blockedUserIds.isNotEmpty
                ? fresh.blockedUserIds
                : existing.blockedUserIds,
          ),
        );
        notifyListeners();
      }
    }
    final favs = (data['favoriteItemIds'] as List<dynamic>? ?? const [])
        .map((e) => e.toString())
        .toSet();
    if (favs.length != _favoriteItemIds.length ||
        !favs.containsAll(_favoriteItemIds)) {
      _favoriteItemIds
        ..clear()
        ..addAll(favs);
      notifyListeners();
    }
  }

  void _startUserLive(String uid) {
    if (!firebaseReady) return;
    _userLive?.cancel();
    final session = LiveSession();
    _userLive = session;
    session.listenUserActivity(
      uid,
      onRequests: _applyRemoteRequests,
      onMessages: _applyRemoteMessages,
      onNotifications: _applyRemoteNotifications,
      onOwnProfile: (data) => _applyOwnProfile(uid, data),
    );
  }

  void _stopUserLive() {
    _userLive?.cancel();
    _userLive = null;
    _requests = [];
    _messages = [];
    _remoteNotifications = [];
    _favoriteItemIds.clear();
  }

  String _currentUserId = 'u-maya';

  /// Defaults keep widget/unit tests working without any session setup;
  /// [restoreFromPrefs] applies the real persisted session at app start.
  bool isLoggedIn = true;
  bool onboardingSeen = true;
  bool notificationsEnabled = true;

  /// Appearance choice (Phase 7): system until the user picks one in
  /// Settings; [restoreFromPrefs] applies the persisted value.
  ThemePreference themePreference = ThemePreference.system;
  final Set<String> _favoriteItemIds = {};
  SharedPreferences? _prefs;

  AppState() {
    _seedAll();
  }

  void _seedAll() {
    _users = List.of(seedUsers());
    _items = List.of(seedItems(_users));
    _listings = List.of(seedListings());
    _requests = List.of(seedRequests());
    _reviews = List.of(seedReviews());
    _wishlist = List.of(seedWishlist());
    _messages = List.of(seedMessages());
    _reports = [];
  }

  // For tests / custom seeding
  AppState.withData({
    required List<AppUser> users,
    required List<Item> items,
    required List<BorrowRequest> requests,
    required List<WishlistItem> wishlist,
    required List<Review> reviews,
    List<Message>? messages,
    List<Listing>? listings,
    String currentUserId = 'u-maya',
  }) {
    _users = users;
    _items = items;
    _listings = List.of(listings ?? seedListings());
    _requests = requests;
    _wishlist = wishlist;
    _reviews = reviews;
    _messages = List.of(messages ?? seedMessages());
    _reports = [];
    _currentUserId = currentUserId;
  }

  List<AppUser> get users => List.unmodifiable(_users);
  List<Item> get items => List.unmodifiable(_items);
  List<Listing> get listings => List.unmodifiable(_listings);
  List<BorrowRequest> get requests => List.unmodifiable(_requests);
  List<WishlistItem> get wishlist => List.unmodifiable(_wishlist);
  List<Review> get reviews => List.unmodifiable(_reviews);
  List<Message> get messages => List.unmodifiable(_messages);
  List<Report> get reports => List.unmodifiable(_reports);

  AppUser get currentUser => userById(_currentUserId);

  /// Fallback identity for lookups that race the live user listener
  /// (or an empty live database): screens must render a neighbor, not
  /// crash, while profiles are still loading.
  static final AppUser _placeholderUser = AppUser(
    id: '',
    name: 'Neighbor',
    bio: '',
    neighborhood: '',
    homeLocation: const LatLng(31.5204, 74.3587),
    joinedAt: DateTime(2024, 1, 1),
    phoneVerified: false,
    emailVerified: false,
    responseRate: 1,
    avgResponseMinutes: 60,
    stats: const UserStats(
      successfulLends: 0,
      successfulBorrows: 0,
      onTimeReturns: 0,
      lateReturns: 0,
    ),
    badges: const [],
  );

  AppUser userById(String id) => _users.firstWhere(
    (u) => u.id == id,
    orElse: () => _users.isNotEmpty ? _users.first : _placeholderUser,
  );
  AppUser? userByIdOrNull(String id) {
    for (final u in _users) {
      if (u.id == id) return u;
    }
    return null;
  }

  Item itemById(String id) => _items.firstWhere((i) => i.id == id);
  Item? itemByIdOrNull(String id) {
    for (final i in _items) {
      if (i.id == id) return i;
    }
    return null;
  }

  Listing? listingByIdOrNull(String id) {
    for (final l in _listings) {
      if (l.id == id) return l;
    }
    return null;
  }

  List<Listing> get myListings =>
      _listings.where((l) => l.ownerId == currentUser.id).toList();

  List<Review> reviewsFor(String userId) =>
      _reviews.where((r) => r.revieweeId == userId).toList();

  TrustScoreResult trustFor(AppUser user) {
    final now = DateTime.now();
    final ageDays = now.difference(user.joinedAt).inDays;
    return calculateTrustScore(
      TrustHistory(
        onTimeReturns: user.stats.onTimeReturns,
        totalReturns: user.stats.onTimeReturns + user.stats.lateReturns,
        reviewRatings: reviewsFor(user.id).map((r) => r.rating).toList(),
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
        idVerified: user.idVerified,
        completedDeals: user.stats.completedDeals,
        accountAgeDays: ageDays < 0 ? 0 : ageDays,
        responseRate: user.responseRate,
      ),
    );
  }

  List<Item> filteredItems({
    String query = '',
    String? category,
    double? maxDistanceKm,
    bool onlyAvailable = false,
  }) {
    final me = currentUser.homeLocation;
    final q = query.trim().toLowerCase();
    // Phase 8: neighbors the current user blocked never appear.
    final blocked = blockedUserIdSet;
    var result = _items.where((item) {
      if (blocked.contains(item.ownerId)) return false;
      if (onlyAvailable && !item.isAvailable) return false;
      if (category != null &&
          category.isNotEmpty &&
          item.category != category) {
        return false;
      }
      if (q.isNotEmpty) {
        final hay = '${item.title} ${item.description} ${item.category}'
            .toLowerCase();
        if (!hay.contains(q)) return false;
      }
      if (maxDistanceKm != null) {
        if (distanceKm(me, item.location) > maxDistanceKm) return false;
      }
      return true;
    }).toList();
    result.sort(
      (a, b) =>
          distanceKm(me, a.location).compareTo(distanceKm(me, b.location)),
    );
    return result;
  }

  List<Item> get myItems =>
      _items.where((i) => i.ownerId == currentUser.id).toList();

  // ---------------- Favorites ----------------

  Set<String> get favoriteItemIds => Set.unmodifiable(_favoriteItemIds);

  bool isFavorite(String itemId) => _favoriteItemIds.contains(itemId);

  void toggleFavorite(String itemId) {
    if (!_favoriteItemIds.remove(itemId)) {
      _favoriteItemIds.add(itemId);
    }
    notifyListeners();
    if (liveMode) {
      _mirror(
        LiveSync.instance.updateUserFields(_currentUserId, {
          'favoriteItemIds': _favoriteItemIds.toList(),
        }),
      );
    }
  }

  /// Favorited items that still exist, in catalog order.
  List<Item> get favoriteItems =>
      _items.where((i) => _favoriteItemIds.contains(i.id)).toList();

  List<BorrowRequest> get incomingRequests {
    // Ownership resolves across BOTH catalogs: legacy items and the
    // unified listings share ids for the items section, and Phase 5
    // requests can target any section's listing.
    final ids = <String>{
      ..._items.where((i) => i.ownerId == currentUser.id).map((i) => i.id),
      ...myListings.map((l) => l.id),
    };
    return _requests.where((r) => ids.contains(r.itemId)).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  List<BorrowRequest> get outgoingRequests {
    return _requests.where((r) => r.borrowerId == currentUser.id).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  int get pendingIncomingCount =>
      incomingRequests.where((r) => r.status == 'pending').length;

  String ownerIdFor(BorrowRequest r) =>
      listingByIdOrNull(r.itemId)?.ownerId ??
      itemByIdOrNull(r.itemId)?.ownerId ??
      '';

  void _replaceRequest(BorrowRequest updated) {
    final idx = _requests.indexWhere((r) => r.id == updated.id);
    if (idx >= 0) _requests[idx] = updated;
  }

  void approveRequest(String requestId) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'pending') return;
    _replaceRequest(
      r.copyWith(
        status: 'approved',
        respondedAt: DateTime.now(),
        dueAt: r.period.end,
      ),
    );
    _onRequestApproved(r);
    notifyListeners();
    if (liveMode) {
      final updated = _requests.firstWhere((x) => x.id == requestId);
      _mirror(LiveSync.instance.updateRequest(updated, ownerIdFor(updated)));
    }
  }

  void declineRequest(String requestId) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'pending') return;
    _replaceRequest(
      r.copyWith(status: 'declined', respondedAt: DateTime.now()),
    );
    notifyListeners();
    if (liveMode) {
      final updated = _requests.firstWhere((x) => x.id == requestId);
      _mirror(LiveSync.instance.updateRequest(updated, ownerIdFor(updated)));
    }
  }

  void markPickedUp(String requestId) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'approved') return;
    _replaceRequest(r.copyWith(status: 'active'));
    // mark item borrowed
    final idx = _items.indexWhere((i) => i.id == r.itemId);
    if (idx >= 0) _items[idx] = _items[idx].copyWith(availability: 'borrowed');
    // Non-item rent listings flip to rented for the duration.
    final listing = listingByIdOrNull(r.itemId);
    if (listing != null &&
        listing.section != ListingSection.items &&
        listing.listingType == ListingType.rent) {
      setListingStatus(listing.id, ListingStatus.rented);
    }
    notifyListeners();
    if (liveMode) {
      final updated = _requests.firstWhere((x) => x.id == requestId);
      _mirror(
        LiveSync.instance.transitionRequest(
          request: updated,
          ownerId: ownerIdFor(updated),
          listingStatus: 'rented',
        ),
      );
    }
  }

  void markReturned(String requestId, {required bool onTime}) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'active' && r.status != 'approved') return;
    _replaceRequest(r.copyWith(status: 'returned', returnedAt: DateTime.now()));
    final idx = _items.indexWhere((i) => i.id == r.itemId);
    if (idx >= 0) _items[idx] = _items[idx].copyWith(availability: 'available');
    final rentedListing = listingByIdOrNull(r.itemId);
    if (rentedListing != null && rentedListing.status == ListingStatus.rented) {
      setListingStatus(rentedListing.id, ListingStatus.active);
    }
    // update borrower stats
    final bIdx = _users.indexWhere((u) => u.id == r.borrowerId);
    if (bIdx >= 0) {
      final u = _users[bIdx];
      final s = u.stats;
      _users[bIdx] = u.copyWith(
        stats: s.copyWith(
          successfulBorrows: s.successfulBorrows + 1,
          onTimeReturns: s.onTimeReturns + (onTime ? 1 : 0),
          lateReturns: s.lateReturns + (onTime ? 0 : 1),
        ),
      );
    }
    // lender successful lends
    final ownerId = ownerIdFor(r);
    final lIdx = _users.indexWhere((u) => u.id == ownerId);
    if (lIdx >= 0) {
      final u = _users[lIdx];
      _users[lIdx] = u.copyWith(
        stats: u.stats.copyWith(successfulLends: u.stats.successfulLends + 1),
      );
    }
    notifyListeners();
    if (liveMode) {
      final updated = _requests.firstWhere((x) => x.id == requestId);
      final borrower = userById(r.borrowerId);
      final owner = userById(ownerId);
      _mirror(
        LiveSync.instance.transitionRequest(
          request: updated,
          ownerId: ownerId,
          listingStatus: 'active',
          statsByUserId: {borrower.id: borrower.stats, owner.id: owner.stats},
        ),
      );
    }
  }

  /// Returns null on success, or an error message.
  String? createBorrowRequest(
    Item item,
    DateTime start,
    DateTime end,
    String note,
  ) {
    final today = DateTime(
      DateTime.now().year,
      DateTime.now().month,
      DateTime.now().day,
    );
    final s = DateTime(start.year, start.month, start.day);
    final e = DateTime(end.year, end.month, end.day);
    if (item.ownerId == currentUser.id) {
      return 'You cannot borrow your own item.';
    }
    if (!item.isAvailable) return 'This item is not available right now.';
    if (e.isBefore(s)) return 'End date must be on or after the start date.';
    if (s.isBefore(today)) return 'Start date cannot be in the past.';
    final days = e.difference(s).inDays + 1;
    if (days > item.borrowTerms.maxDurationDays) {
      return 'This item can be borrowed for up to ${item.borrowTerms.maxDurationDays} days.';
    }
    // overlap check against approved/active requests for same item (inclusive)
    for (final r in _requests) {
      if (r.itemId != item.id) continue;
      if (r.status != 'approved' &&
          r.status != 'active' &&
          r.status != 'pending') {
        continue;
      }
      final rs = DateTime(
        r.period.start.year,
        r.period.start.month,
        r.period.start.day,
      );
      final re = DateTime(
        r.period.end.year,
        r.period.end.month,
        r.period.end.day,
      );
      final overlaps = !s.isAfter(re) && !rs.isAfter(e);
      if (overlaps && (r.status == 'approved' || r.status == 'active')) {
        return 'Those dates overlap an existing booking for this item.';
      }
    }
    _idCounter++;
    final request = BorrowRequest(
      id: liveMode
          ? LiveSync.instance.newDocId('requests')
          : 'req-new-$_idCounter',
      itemId: item.id,
      borrowerId: currentUser.id,
      period: BorrowPeriod(start: s, end: e),
      note: note.trim(),
      status: 'pending',
      createdAt: DateTime.now(),
    );
    _requests.insert(0, request);
    notifyListeners();
    if (liveMode) {
      _mirror(LiveSync.instance.createRequest(request, item.ownerId));
    }
    return null;
  }

  // ---------------- Phase 5: section requests & deals ----------------

  static const _busyRequestStatuses = {'pending', 'approved', 'active'};

  /// Generalized request for ANY section's listing (vehicles/properties
  /// rent periods, sell offers, arena slots). Returns null on success,
  /// or an error message — mirroring the web service's rules in
  /// simplified form for the local catalog.
  String? createListingRequest({
    required Listing listing,
    required BorrowPeriod period,
    String note = '',
    int? offerAmount,
    ArenaSlot? slot,
  }) {
    if (listing.ownerId == currentUser.id) {
      return 'This is your own listing.';
    }
    if (listing.status != ListingStatus.active) {
      return 'This listing is not taking requests right now.';
    }
    if (listing.section == ListingSection.arenas) {
      if (slot == null) return 'Pick a slot first.';
      for (final r in _requests) {
        if (r.itemId == listing.id &&
            r.slot != null &&
            _busyRequestStatuses.contains(r.status) &&
            r.slot!.overlaps(slot)) {
          return 'That slot was just booked — pick another one.';
        }
      }
    } else if (listing.listingType == ListingType.sell) {
      final offer = offerAmount ?? listing.price;
      if (offer <= 0) return 'Enter an offer above Rs 0.';
      if (!listing.negotiable && offer != listing.price) {
        return 'This listing isn’t negotiable — offer the asking price.';
      }
    } else {
      // Borrow/rent by period: block overlaps with confirmed bookings.
      for (final r in _requests) {
        if (r.itemId != listing.id) continue;
        if (r.status != 'approved' && r.status != 'active') continue;
        if (_periodsOverlap(r.period, period)) {
          return 'Those dates overlap an existing booking for this listing.';
        }
      }
    }
    _idCounter++;
    final request = BorrowRequest(
      id: liveMode
          ? LiveSync.instance.newDocId('requests')
          : 'req-new-$_idCounter',
      itemId: listing.id,
      borrowerId: currentUser.id,
      period: period,
      note: note.trim(),
      status: 'pending',
      offerAmount: listing.listingType == ListingType.sell
          ? (offerAmount ?? listing.price)
          : null,
      slot: slot,
      createdAt: DateTime.now(),
    );
    _requests.insert(0, request);
    notifyListeners();
    if (liveMode) {
      _mirror(LiveSync.instance.createRequest(request, listing.ownerId));
    }
    return null;
  }

  /// Owner closes an approved deal that has no return leg: a sale is
  /// handed over (listing → sold, sales stat +1) or an arena slot was
  /// played / a rental finished (rentals stat +1 for rent deals).
  void markCompleted(String requestId) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'approved') return;
    _replaceRequest(r.copyWith(status: 'completed'));
    final listing = listingByIdOrNull(r.itemId);
    if (listing != null) {
      if (listing.listingType == ListingType.sell) {
        setListingStatus(listing.id, ListingStatus.sold);
      }
      final lIdx = _users.indexWhere((u) => u.id == listing.ownerId);
      if (lIdx >= 0) {
        final u = _users[lIdx];
        _users[lIdx] = u.copyWith(
          stats: listing.listingType == ListingType.sell
              ? u.stats.copyWith(salesCompleted: u.stats.salesCompleted + 1)
              : u.stats.copyWith(rentalsHosted: u.stats.rentalsHosted + 1),
        );
      }
    }
    notifyListeners();
    if (liveMode) {
      final updated = _requests.firstWhere((x) => x.id == requestId);
      final ownerId = ownerIdFor(updated);
      final owner = userById(ownerId);
      _mirror(
        LiveSync.instance.transitionRequest(
          request: updated,
          ownerId: ownerId,
          listingStatus: listing?.listingType == ListingType.sell
              ? 'sold'
              : null,
          statsByUserId: {owner.id: owner.stats},
        ),
      );
    }
  }

  /// Approving a sell offer reserves the listing (competing offers stay
  /// pending on the web; here the detail screen stops new offers).
  void _onRequestApproved(BorrowRequest r) {
    final listing = listingByIdOrNull(r.itemId);
    if (listing != null &&
        listing.listingType == ListingType.sell &&
        listing.status == ListingStatus.active) {
      setListingStatus(listing.id, ListingStatus.reserved);
    }
  }

  Item createItem({
    required String title,
    required String category,
    required String description,
    required String condition,
    required int maxDurationDays,
    int? depositAmount,
    int? dailyFee,
    String pickupPreference = 'either',
    String pickupInstructions = '',
    List<String> photos = const [],
  }) {
    _idCounter++;
    final item = Item(
      id: liveMode
          ? LiveSync.instance.newDocId('listings')
          : 'i-new-$_idCounter',
      ownerId: currentUser.id,
      title: title.trim(),
      description: description.trim(),
      category: category,
      condition: condition.trim(),
      photos: List.of(photos),
      location: currentUser.homeLocation,
      availability: 'available',
      borrowTerms: BorrowTerms(
        maxDurationDays: maxDurationDays,
        depositAmount: depositAmount,
        dailyFee: dailyFee,
        pickupPreference: pickupPreference,
        pickupInstructions: pickupInstructions.trim(),
      ),
      createdAt: DateTime.now(),
    );
    _items.insert(0, item);
    notifyListeners();
    if (liveMode) {
      // The legacy wizard publishes Items; the live catalog is the
      // unified Listing — create its twin so the item exists in
      // Firestore (and on the web) too.
      final twin = ItemListing(
        id: item.id,
        ownerId: item.ownerId,
        listingType: dailyFee != null ? ListingType.rent : ListingType.borrow,
        title: item.title,
        description: item.description,
        price: dailyFee ?? 0,
        priceUnit: dailyFee != null ? PriceUnit.day : PriceUnit.fixed,
        photos: item.photos,
        location: ListingLocation(
          lat: item.location.lat,
          lng: item.location.lng,
          city: currentUser.city,
          area: currentUser.neighborhood,
        ),
        status: ListingStatus.active,
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
        details: ItemListingDetails(
          category: item.category,
          condition: item.condition,
          depositAmount: depositAmount,
          maxDurationDays: maxDurationDays,
          pickupPreference: pickupPreference,
          pickupInstructions: pickupInstructions.trim(),
        ),
      );
      _listings.insert(0, twin);
      _mirror(LiveSync.instance.createListing(twin));
      notifyListeners();
    }
    return item;
  }

  void pledgePoints(String wishlistItemId, int points) {
    final idx = _wishlist.indexWhere((w) => w.id == wishlistItemId);
    if (idx < 0 || points <= 0) return;
    final w = _wishlist[idx];
    final next = w.pointsPledged + points;
    _wishlist[idx] = w.copyWith(
      pointsPledged: next > w.targetPoints ? w.targetPoints : next,
    );
    notifyListeners();
  }

  void needThisToo(String wishlistItemId) {
    final idx = _wishlist.indexWhere((w) => w.id == wishlistItemId);
    if (idx < 0) return;
    _wishlist[idx] = _wishlist[idx].copyWith(
      requestCount: _wishlist[idx].requestCount + 1,
    );
    notifyListeners();
  }

  // ---------------- Session / auth ----------------

  /// Applies the persisted session (if any) from [prefs]. A fresh install
  /// has no saved user, so the app starts logged out at Onboarding/Landing.
  Future<void> restoreFromPrefs(SharedPreferences prefs) async {
    _prefs = prefs;
    onboardingSeen = prefs.getBool(_kOnboardingSeen) ?? false;
    themePreference = themePreferenceFromStorage(
      prefs.getString(kThemePreferencePrefsKey),
    );
    _applySavedProfileSetups(prefs);
    final savedId = prefs.getString(_kSessionUserId);
    if (savedId != null && userByIdOrNull(savedId) != null) {
      _currentUserId = savedId;
      isLoggedIn = true;
    } else {
      isLoggedIn = false;
    }
    notifyListeners();
  }

  Future<void> markOnboardingSeen() async {
    onboardingSeen = true;
    await _prefs?.setBool(_kOnboardingSeen, true);
    notifyListeners();
  }

  Future<void> _persistSession() async {
    if (isLoggedIn) {
      await _prefs?.setString(_kSessionUserId, _currentUserId);
    } else {
      await _prefs?.remove(_kSessionUserId);
    }
  }

  /// Returns null on success, or an error message.
  String? login(String email, String password) {
    if (liveMode) {
      return 'This build signs in with Google or the email form above.';
    }
    final e = email.trim().toLowerCase();
    AppUser? found;
    for (final u in _users) {
      if (u.email.toLowerCase() == e) found = u;
    }
    if (found == null || found.password != password) {
      return 'Wrong email or password.';
    }
    _currentUserId = found.id;
    isLoggedIn = true;
    _persistSession();
    notifyListeners();
    return null;
  }

  /// Instant demo login as any seed neighbor (no password check — the
  /// account picker on the Login screen uses this).
  void loginAs(AppUser user) {
    if (liveMode) return; // No demo accounts exist in the live build.
    _currentUserId = user.id;
    isLoggedIn = true;
    _persistSession();
    notifyListeners();
  }

  /// Returns null on success, or an error message.
  String? signUp({
    required String name,
    required String email,
    required String password,
    required String neighborhood,
  }) {
    if (liveMode) {
      return 'This build creates accounts with the email form above.';
    }
    final e = email.trim().toLowerCase();
    if (_users.any((u) => u.email.toLowerCase() == e)) {
      return 'An account already uses that email.';
    }
    _idCounter++;
    final maya = userById('u-maya');
    final user = AppUser(
      id: 'u-new-$_idCounter',
      name: name.trim(),
      email: e,
      password: password,
      bio: 'New to the block — say hi!',
      // Phase 6: brand-new accounts complete the profile setup next.
      onboardingCompleted: false,
      neighborhood: neighborhood.trim(),
      homeLocation: LatLng(
        maya.homeLocation.lat + 0.002,
        maya.homeLocation.lng - 0.002,
      ),
      joinedAt: DateTime.now(),
      phoneVerified: false,
      emailVerified: false,
      responseRate: 0,
      avgResponseMinutes: 60,
      stats: const UserStats(
        successfulLends: 0,
        successfulBorrows: 0,
        onTimeReturns: 0,
        lateReturns: 0,
      ),
      badges: const [],
    );
    _users.add(user);
    _currentUserId = user.id;
    isLoggedIn = true;
    _persistSession();
    notifyListeners();
    return null;
  }

  /// Adopt a user authenticated outside the demo system (Firebase
  /// Auth, Phase 3): upsert them into the local user list so every
  /// screen that resolves users by id keeps working, and make them the
  /// current session.
  void adoptExternalUser(AppUser user) {
    final idx = _users.indexWhere((u) => u.id == user.id);
    if (idx >= 0) {
      _users[idx] = user;
    } else {
      _users.add(user);
    }
    // A setup finished on this device in a previous run wins over a
    // lagging remote profile, so the user is not prompted twice.
    if (_prefs != null) _applySavedProfileSetups(_prefs!);
    _currentUserId = user.id;
    isLoggedIn = true;
    _persistSession();
    notifyListeners();
    if (liveMode) {
      _adoptedUser = user;
      _startUserLive(user.id);
    }
  }

  // ---------------- Phase 6: profile setup ----------------

  /// The single place that decides whether the signed-in user must
  /// see the 3-step profile setup: they are logged in and their
  /// profile flag says setup is not done. Seed users all carry
  /// `onboardingCompleted: true`, so only genuinely new accounts
  /// (local sign-up or a fresh Firebase profile) are ever routed in.
  bool get currentUserNeedsOnboarding =>
      isLoggedIn && userByIdOrNull(_currentUserId)?.needsOnboarding == true;

  /// Re-apply any profile setup saved in a previous run over the
  /// freshly seeded users (same mechanism as the session restore).
  void _applySavedProfileSetups(SharedPreferences prefs) {
    for (var i = 0; i < _users.length; i++) {
      final raw = prefs.getString('$_kProfileSetupPrefix${_users[i].id}');
      if (raw == null) continue;
      try {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        _users[i] = _users[i].copyWith(
          name: data['name'] as String?,
          phone: data['phone'] as String?,
          city: data['city'] as String?,
          neighborhood: data['neighborhood'] as String?,
          interests: ((data['interests'] as List<dynamic>?) ?? const [])
              .map((e) => e.toString())
              .toList(),
          onboardingCompleted: data['onboardingCompleted'] as bool? ?? true,
          blockedUserIds:
              ((data['blockedUserIds'] as List<dynamic>?) ?? const [])
                  .map((e) => e.toString())
                  .toList(),
        );
      } catch (_) {
        // Corrupt payload — ignore it; the in-memory profile stands.
      }
    }
  }

  Future<void> _persistProfileSetup(AppUser user) async {
    await _prefs?.setString(
      '$_kProfileSetupPrefix${user.id}',
      jsonEncode({
        'name': user.name,
        'phone': user.phone,
        'city': user.city,
        'neighborhood': user.neighborhood,
        'interests': user.interests,
        'onboardingCompleted': user.onboardingCompleted,
        'blockedUserIds': user.blockedUserIds,
      }),
    );
  }

  /// Persist ONLY the block list, riding the same per-user profile
  /// payload as the profile setup: merge into the stored map when one
  /// exists (so setup fields survive), otherwise seed the map from the
  /// current profile exactly like [_persistProfileSetup] would.
  Future<void> _persistBlockedUserIds() async {
    final prefs = _prefs;
    if (prefs == null) return;
    final me = currentUser;
    final key = '$_kProfileSetupPrefix${me.id}';
    Map<String, dynamic> data = {
      'name': me.name,
      'phone': me.phone,
      'city': me.city,
      'neighborhood': me.neighborhood,
      'interests': me.interests,
      'onboardingCompleted': me.onboardingCompleted,
    };
    final raw = prefs.getString(key);
    if (raw != null) {
      try {
        data = jsonDecode(raw) as Map<String, dynamic>;
      } catch (_) {
        // Corrupt payload — fall back to the freshly built map above.
      }
    }
    data['blockedUserIds'] = me.blockedUserIds;
    await prefs.setString(key, jsonEncode(data));
  }

  /// Finish (or re-edit) the Phase 6 profile setup for the current
  /// user. Returns null on success, or the first validation error —
  /// the same rules the setup screen checks step by step.
  Future<String?> completeOnboarding({
    required String name,
    required String phone,
    required String city,
    required String neighborhood,
    required List<String> interests,
  }) async {
    final error =
        validateSetupName(name) ??
        validateSetupPhone(phone) ??
        validateSetupCity(city) ??
        validateSetupArea(neighborhood) ??
        validateSetupInterests(interests);
    if (error != null) return error;
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return 'No signed-in user to set up.';
    _users[idx] = _users[idx].copyWith(
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
      neighborhood: neighborhood.trim(),
      interests: List.of(interests),
      onboardingCompleted: true,
    );
    await _persistProfileSetup(_users[idx]);
    notifyListeners();
    // Mirror to Firestore when live (fire and forget, like sign-out —
    // local completion must never block on the network).
    FirebaseAuthService.instance
        .saveOnboardingProfile(_users[idx])
        .catchError((_) {});
    return null;
  }

  void signOut() {
    if (liveMode) {
      _stopUserLive();
      _adoptedUser = null;
    }
    isLoggedIn = false;
    _persistSession();
    notifyListeners();
    // Mirror the sign-out to Firebase when it's configured (fire and
    // forget — local sign-out must never block on the network).
    FirebaseAuthService.instance.signOut().catchError((_) {});
  }

  /// Returns null when a (demo) reset was "sent", or an error message.
  String? requestPasswordReset(String email) {
    final e = email.trim().toLowerCase();
    final exists = _users.any((u) => u.email.toLowerCase() == e);
    return exists ? null : 'No account uses that email.';
  }

  void resetDemoData() {
    if (liveMode) return; // There is no demo data in the live build.
    _seedAll();
    _currentUserId = 'u-maya';
    notificationsEnabled = true;
    _favoriteItemIds.clear();
    _persistSession();
    notifyListeners();
  }

  // ---------------- Profile / verification ----------------

  void updateProfile({String? name, String? bio, String? neighborhood}) {
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return;
    _users[idx] = _users[idx].copyWith(
      name: name?.trim(),
      bio: bio?.trim(),
      neighborhood: neighborhood?.trim(),
    );
    notifyListeners();
    if (liveMode) {
      _mirror(
        LiveSync.instance.updateUserFields(_currentUserId, {
          if (name != null) 'name': name.trim(),
          if (bio != null) 'bio': bio.trim(),
          if (neighborhood != null) 'neighborhood': neighborhood.trim(),
        }),
      );
    }
  }

  void verifyPhone() {
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return;
    _users[idx] = _users[idx].copyWith(phoneVerified: true);
    notifyListeners();
    if (liveMode) {
      _mirror(
        LiveSync.instance.updateUserFields(_currentUserId, {
          'phoneVerified': true,
        }),
      );
    }
  }

  void verifyEmail() {
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return;
    _users[idx] = _users[idx].copyWith(emailVerified: true);
    notifyListeners();
    if (liveMode) {
      _mirror(
        LiveSync.instance.updateUserFields(_currentUserId, {
          'emailVerified': true,
        }),
      );
    }
  }

  void setNotificationsEnabled(bool value) {
    notificationsEnabled = value;
    notifyListeners();
  }

  /// Applies a new appearance choice immediately and persists it.
  Future<void> setThemePreference(ThemePreference preference) async {
    if (preference == themePreference) return;
    themePreference = preference;
    await _prefs?.setString(
      kThemePreferencePrefsKey,
      themePreferenceToStorage(preference),
    );
    notifyListeners();
  }

  // ---------------- Manage my listings (Phase 5) ----------------

  /// Add a freshly created listing (any section). Items-section
  /// listings also land in the legacy item list via the adapter so the
  /// original borrow flows work on them immediately.
  void addListing(Listing listing) {
    _listings.insert(0, listing);
    if (listing is ItemListing) {
      _items.insert(0, itemFromListing(listing));
    }
    notifyListeners();
    if (liveMode) _mirror(LiveSync.instance.createListing(listing));
  }

  /// Owner status change, validated against the shared status machine.
  /// Internal callers batch their own notification; UI callers pass
  /// [notify] to refresh immediately.
  bool setListingStatus(
    String listingId,
    ListingStatus status, {
    bool notify = false,
  }) {
    final idx = _listings.indexWhere((l) => l.id == listingId);
    if (idx < 0) return false;
    final listing = _listings[idx];
    if (!canTransitionListingStatus(listing.status, status)) return false;
    _listings[idx] = listingWithStatus(listing, status);
    if (liveMode) {
      _mirror(LiveSync.instance.updateListingStatus(listingId, status.name));
    }
    if (listing is ItemListing) {
      final itemIdx = _items.indexWhere((i) => i.id == listingId);
      if (itemIdx >= 0) {
        _items[itemIdx] = itemFromListing(_listings[idx] as ItemListing);
      }
    }
    if (notify) notifyListeners();
    return true;
  }

  // ---------------- Manage my items ----------------

  Item? updateItem(
    String itemId, {
    required String title,
    required String category,
    required String description,
    required String condition,
    required int maxDurationDays,
    int? depositAmount,
    int? dailyFee,
    String? pickupPreference,
    String? pickupInstructions,
    List<String>? photos,
  }) {
    final idx = _items.indexWhere((i) => i.id == itemId);
    if (idx < 0) return null;
    final old = _items[idx];
    _items[idx] = old.copyWith(
      title: title.trim(),
      category: category,
      description: description.trim(),
      condition: condition.trim(),
      photos: photos,
      borrowTerms: old.borrowTerms.copyWith(
        maxDurationDays: maxDurationDays,
        depositAmount: depositAmount,
        clearDeposit: depositAmount == null,
        dailyFee: dailyFee,
        clearFee: dailyFee == null,
        pickupPreference: pickupPreference,
        pickupInstructions: pickupInstructions?.trim(),
      ),
    );
    notifyListeners();
    if (liveMode) {
      final updated = _items[idx];
      final lIdx = _listings.indexWhere((l) => l.id == itemId);
      if (lIdx >= 0 && _listings[lIdx] is ItemListing) {
        final old = _listings[lIdx] as ItemListing;
        final twin = ItemListing(
          id: old.id,
          ownerId: old.ownerId,
          listingType: old.listingType,
          title: updated.title,
          description: updated.description,
          price: old.price,
          currency: old.currency,
          priceUnit: old.priceUnit,
          negotiable: old.negotiable,
          photos: updated.photos,
          location: old.location,
          status: old.status,
          createdAt: old.createdAt,
          updatedAt: DateTime.now(),
          views: old.views,
          details: ItemListingDetails(
            category: updated.category,
            condition: updated.condition,
            depositAmount: updated.borrowTerms.depositAmount,
            maxDurationDays: updated.borrowTerms.maxDurationDays,
            pickupPreference: updated.borrowTerms.pickupPreference,
            pickupInstructions: updated.borrowTerms.pickupInstructions,
          ),
        );
        _listings[lIdx] = twin;
        _mirror(LiveSync.instance.updateListing(twin));
      }
    }
    return _items[idx];
  }

  /// Returns null on success, or an explanation when deletion is blocked.
  String? deleteItem(String itemId) {
    final pendingBefore = liveMode
        ? _requests
              .where((r) => r.itemId == itemId && r.status == 'pending')
              .map((r) => r.id)
              .toList()
        : const <String>[];
    final blocking = _requests.any(
      (r) =>
          r.itemId == itemId &&
          (r.status == 'approved' || r.status == 'active'),
    );
    if (blocking) {
      return 'This item has a borrow in progress — wait until it is returned before deleting it.';
    }
    // Decline any still-pending requests, then remove the item.
    for (var i = 0; i < _requests.length; i++) {
      final r = _requests[i];
      if (r.itemId == itemId && r.status == 'pending') {
        _requests[i] = r.copyWith(
          status: 'declined',
          respondedAt: DateTime.now(),
        );
      }
    }
    _items.removeWhere((i) => i.id == itemId);
    if (liveMode) _listings.removeWhere((l) => l.id == itemId);
    notifyListeners();
    if (liveMode) {
      _mirror(LiveSync.instance.deleteListing(itemId));
      for (final reqId in pendingBefore) {
        final r = _requests.firstWhere((x) => x.id == reqId);
        _mirror(LiveSync.instance.updateRequest(r, ownerIdFor(r)));
      }
    }
    return null;
  }

  void setItemAvailability(String itemId, String availability) {
    if (liveMode) {
      // Availability is the listing status in the live catalog.
      if (availability == 'available') {
        setListingStatus(itemId, ListingStatus.active, notify: true);
      } else if (availability == 'borrowed') {
        setListingStatus(itemId, ListingStatus.rented, notify: true);
      }
      return;
    }
    final idx = _items.indexWhere((i) => i.id == itemId);
    if (idx < 0) return;
    _items[idx] = _items[idx].copyWith(availability: availability);
    notifyListeners();
  }

  // ---------------- Reviews ----------------

  bool hasReviewed(String requestId, String userId) =>
      _reviews.any((r) => r.requestId == requestId && r.reviewerId == userId);

  List<Review> reviewsForItem(String itemId) {
    final list = _reviews.where((r) => r.itemId == itemId).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return list;
  }

  /// Returns null on success, or an error message.
  String? addReview(String requestId, int rating, String comment) {
    final r = _requests.firstWhere(
      (x) => x.id == requestId,
      orElse: () => throw StateError('unknown request'),
    );
    if (r.status != 'returned' &&
        r.status != 'completed' &&
        r.status != 'reviewed') {
      return 'Reviews open once the deal is done.';
    }
    if (rating < 1 || rating > 5) return 'Pick a star rating first.';
    final me = currentUser;
    if (hasReviewed(requestId, me.id)) {
      return 'You have already reviewed this borrow.';
    }
    final ownerId = ownerIdFor(r);
    final iAmBorrower = r.borrowerId == me.id;
    final revieweeId = iAmBorrower ? ownerId : r.borrowerId;
    _idCounter++;
    final review = Review(
      id: liveMode
          ? ReviewFirestoreMap.docId(requestId, me.id)
          : 'rev-new-$_idCounter',
      requestId: requestId,
      itemId: r.itemId,
      reviewerId: me.id,
      revieweeId: revieweeId,
      reviewerRole: iAmBorrower ? 'borrower' : 'lender',
      rating: rating,
      comment: comment.trim(),
      createdAt: DateTime.now(),
    );
    _reviews.insert(0, review);
    // Both parties reviewed -> terminal 'reviewed'.
    final reviewers = _reviews
        .where((x) => x.requestId == requestId)
        .map((x) => x.reviewerId)
        .toSet();
    final bothReviewed =
        reviewers.contains(r.borrowerId) && reviewers.contains(ownerId);
    if (bothReviewed) {
      _replaceRequest(r.copyWith(status: 'reviewed'));
    }
    notifyListeners();
    if (liveMode) {
      _mirror(
        LiveSync.instance.addReview(
          review,
          revieweeName: me.name,
          listingTitle:
              listingByIdOrNull(r.itemId)?.title ??
              itemByIdOrNull(r.itemId)?.title ??
              'your listing',
        ),
      );
      if (bothReviewed) {
        final updated = _requests.firstWhere((x) => x.id == requestId);
        _mirror(LiveSync.instance.updateRequest(updated, ownerId));
      }
    }
    return null;
  }

  // ---------------- Issues ----------------

  void reportIssue(String requestId, String reason, String note) {
    final idx = _requests.indexWhere((r) => r.id == requestId);
    if (idx < 0) return;
    _requests[idx] = _requests[idx].copyWith(
      issue: IssueReport(
        reportedBy: currentUser.id,
        reason: reason,
        note: note.trim(),
        reportedAt: DateTime.now(),
      ),
    );
    notifyListeners();
    if (liveMode) {
      final updated = _requests[idx];
      _mirror(
        LiveSync.instance.reportIssue(
          request: updated,
          ownerId: ownerIdFor(updated),
          reporterName: currentUser.name,
          listingTitle:
              listingByIdOrNull(updated.itemId)?.title ??
              itemByIdOrNull(updated.itemId)?.title ??
              'your listing',
        ),
      );
    }
  }

  // ---------------- Phase 8: reports, blocking, account deletion ----

  /// File a report about a listing or a user. The report is recorded
  /// locally and mirrored to the shared `reports` collection when
  /// Firebase is live (fire and forget, like the other mirrors — a
  /// report must never fail because the network did).
  Report submitReport({
    required ReportTargetType targetType,
    required String targetId,
    required String targetOwnerId,
    required String reason,
    String details = '',
  }) {
    _idCounter++;
    final report = Report(
      id: 'rep-new-$_idCounter',
      reporterId: _currentUserId,
      targetType: targetType,
      targetId: targetId,
      targetOwnerId: targetOwnerId,
      reason: reason,
      details: details.trim(),
      status: 'open',
      createdAt: DateTime.now(),
    );
    _reports.insert(0, report);
    notifyListeners();
    SafetyService.instance.submitReport(report).catchError((_) {});
    return report;
  }

  /// The current user's block list as a set, for the pure filters.
  Set<String> get blockedUserIdSet => Set.of(currentUser.blockedUserIds);

  bool isBlocked(String userId) => currentUser.blockedUserIds.contains(userId);

  /// Blocked neighbors that still exist, in block order — the
  /// Settings "Blocked users" list renders this.
  List<AppUser> get blockedUsers => currentUser.blockedUserIds
      .map(userByIdOrNull)
      .whereType<AppUser>()
      .toList();

  /// Block [userId]: their listings disappear from Explore and the
  /// section lists. Persisted with the profile payload and mirrored
  /// to the Firestore profile doc when live.
  void blockUser(String userId) {
    if (userId == _currentUserId || isBlocked(userId)) return;
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return;
    _users[idx] = _users[idx].copyWith(
      blockedUserIds: [..._users[idx].blockedUserIds, userId],
    );
    _persistBlockedUserIds();
    notifyListeners();
    SafetyService.instance
        .saveBlockedUserIds(_currentUserId, _users[idx].blockedUserIds)
        .catchError((_) {});
  }

  void unblockUser(String userId) {
    if (!isBlocked(userId)) return;
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return;
    _users[idx] = _users[idx].copyWith(
      blockedUserIds: _users[idx].blockedUserIds
          .where((id) => id != userId)
          .toList(),
    );
    _persistBlockedUserIds();
    notifyListeners();
    SafetyService.instance
        .saveBlockedUserIds(_currentUserId, _users[idx].blockedUserIds)
        .catchError((_) {});
  }

  /// Permanently delete the signed-in user's account.
  ///
  /// Locally: their listings (both catalogs) and their profile are
  /// removed and the session ends. In Firebase mode the remote data
  /// goes first (listing docs + profile doc), then the Auth credential
  /// LAST — if Firebase refuses that with 'requires-recent-login', the
  /// returned message says exactly what was deleted and what remains,
  /// so nothing half-deletes in silence. A server failure while
  /// deleting DATA aborts the whole thing with `deleted: false` —
  /// nothing is removed anywhere in that case.
  Future<DeleteAccountResult> deleteMyAccount() async {
    final me = currentUser;
    String? notice;
    if (firebaseReady) {
      try {
        await SafetyService.instance.deleteAccountData(
          me.id,
          myListings.map((l) => l.id).toList(),
        );
      } catch (_) {
        return const DeleteAccountResult(
          deleted: false,
          message:
              'Couldn’t reach the server to delete your data — check '
              'your connection and try again. Nothing was deleted.',
        );
      }
      try {
        await FirebaseAuthService.instance.deleteCurrentAuthUser();
      } on AuthException catch (e) {
        notice = e.code == 'requires-recent-login'
            ? 'Your listings and profile data are deleted. Removing '
                  'your sign-in needs a fresh login for security: sign '
                  'in once more and choose “Delete my account” again to '
                  'finish.'
            : 'Your listings and profile data are deleted, but removing '
                  'your sign-in didn’t finish (${e.message}). Sign in '
                  'again and delete once more to finish.';
      } catch (_) {
        notice =
            'Your listings and profile data are deleted, but removing '
            'your sign-in didn’t finish. Sign in again and delete once '
            'more to finish.';
      }
      await FirebaseAuthService.instance.signOut().catchError((_) {});
    }
    _purgeLocalAccount(me.id);
    return DeleteAccountResult(deleted: true, message: notice);
  }

  /// The local half of account deletion: drop the user's listings from
  /// both catalogs, their profile, their saved profile payload and the
  /// session. Requests other neighbors made stay in their history —
  /// they reference listing ids that simply no longer resolve, which
  /// every reader already guards against.
  void _purgeLocalAccount(String userId) {
    _listings.removeWhere((l) => l.ownerId == userId);
    _items.removeWhere((i) => i.ownerId == userId);
    _users.removeWhere((u) => u.id == userId);
    _favoriteItemIds.clear();
    _prefs?.remove('$_kProfileSetupPrefix$userId');
    isLoggedIn = false;
    _persistSession();
    notifyListeners();
  }

  // ---------------- Overlaps ----------------

  bool _periodsOverlap(BorrowPeriod a, BorrowPeriod b) {
    final as = dateOnly(a.start), ae = dateOnly(a.end);
    final bs = dateOnly(b.start), be = dateOnly(b.end);
    return !as.isAfter(be) && !bs.isAfter(ae);
  }

  /// Other *pending* requests for the same item whose dates overlap [req].
  List<BorrowRequest> pendingOverlaps(BorrowRequest req) {
    return _requests
        .where(
          (other) =>
              other.id != req.id &&
              other.itemId == req.itemId &&
              other.status == 'pending' &&
              _periodsOverlap(other.period, req.period),
        )
        .toList();
  }

  /// Pending requests for [itemId] overlapping an arbitrary date range —
  /// used for the non-blocking warning in the borrow sheet.
  List<BorrowRequest> pendingRequestsOverlapping(
    String itemId,
    DateTime start,
    DateTime end,
  ) {
    final probe = BorrowPeriod(start: start, end: end);
    return _requests
        .where(
          (r) =>
              r.itemId == itemId &&
              r.status == 'pending' &&
              _periodsOverlap(r.period, probe),
        )
        .toList();
  }

  // ---------------- Messages ----------------

  List<Message> messagesForRequest(String requestId) {
    final list = _messages.where((m) => m.requestId == requestId).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  Message? lastMessageFor(String requestId) {
    final list = messagesForRequest(requestId);
    return list.isEmpty ? null : list.last;
  }

  AppUser otherPartyFor(BorrowRequest r) {
    final ownerId = ownerIdFor(r);
    return userById(r.borrowerId == currentUser.id ? ownerId : r.borrowerId);
  }

  /// One conversation per request the current user is part of, most
  /// recently active first (requests without messages sort by creation).
  List<BorrowRequest> get myConversations {
    final mine = _requests.where((r) {
      if (itemByIdOrNull(r.itemId) == null &&
          listingByIdOrNull(r.itemId) == null) {
        return false;
      }
      return r.borrowerId == currentUser.id || ownerIdFor(r) == currentUser.id;
    }).toList();
    DateTime activity(BorrowRequest r) =>
        lastMessageFor(r.id)?.createdAt ?? r.createdAt;
    mine.sort((a, b) => activity(b).compareTo(activity(a)));
    return mine;
  }

  void sendMessage(String requestId, String body) {
    final text = body.trim();
    if (text.isEmpty) return;
    _idCounter++;
    final message = Message(
      id: liveMode
          ? LiveSync.instance.newDocId('messages')
          : 'msg-new-$_idCounter',
      requestId: requestId,
      senderId: currentUser.id,
      body: text,
      createdAt: DateTime.now(),
    );
    _messages.add(message);
    notifyListeners();
    if (liveMode) {
      final idx = _requests.indexWhere((x) => x.id == requestId);
      if (idx >= 0) {
        final r = _requests[idx];
        final recipientId = r.borrowerId == currentUser.id
            ? ownerIdFor(r)
            : r.borrowerId;
        _mirror(
          LiveSync.instance.createMessage(
            message,
            recipientId: recipientId,
            senderName: currentUser.name,
            listingId: r.itemId,
          ),
        );
      }
    }
  }

  // ---------------- Item & user threads (ask the owner) ----------------

  /// True when [m] belongs to the two-person thread between the current
  /// user and [otherUserId] for [itemId] (null itemId = general user
  /// thread). Request-thread messages never match.
  bool _inPairThread(Message m, String? itemId, String otherUserId) {
    if (m.requestId != null || m.itemId != itemId) return false;
    final me = currentUser.id;
    return (m.senderId == me && m.otherUserId == otherUserId) ||
        (m.senderId == otherUserId && m.otherUserId == me);
  }

  /// Messages where a neighbor asks the owner about one listing,
  /// before (or without) sending a borrow request.
  List<Message> messagesForItemThread(String itemId, String otherUserId) {
    final list =
        _messages.where((m) => _inPairThread(m, itemId, otherUserId)).toList()
          ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  /// Messages in the general thread between the current user and
  /// [otherUserId] (opened from their profile — not tied to an item).
  List<Message> messagesForUserThread(String otherUserId) {
    final list =
        _messages.where((m) => _inPairThread(m, null, otherUserId)).toList()
          ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  Message? lastMessageForItemThread(String itemId, String otherUserId) {
    final list = messagesForItemThread(itemId, otherUserId);
    return list.isEmpty ? null : list.last;
  }

  Message? lastMessageForUserThread(String otherUserId) {
    final list = messagesForUserThread(otherUserId);
    return list.isEmpty ? null : list.last;
  }

  void sendItemMessage(String itemId, String otherUserId, String body) {
    _sendPairMessage(itemId: itemId, otherUserId: otherUserId, body: body);
  }

  void sendUserMessage(String otherUserId, String body) {
    _sendPairMessage(itemId: null, otherUserId: otherUserId, body: body);
  }

  void _sendPairMessage({
    required String? itemId,
    required String otherUserId,
    required String body,
  }) {
    // Live mode: the shared backend (like the web app) only has chat
    // inside a request — there is no pre-request thread to write to,
    // so these sends are not persisted. The chat screen explains this
    // and routes the user to send a request instead.
    if (liveMode) return;
    final text = body.trim();
    if (text.isEmpty) return;
    _idCounter++;
    _messages.add(
      Message(
        id: 'msg-new-$_idCounter',
        itemId: itemId,
        otherUserId: otherUserId,
        senderId: currentUser.id,
        body: text,
        createdAt: DateTime.now(),
      ),
    );
    notifyListeners();
  }

  /// Every conversation the current user is part of — request threads,
  /// item inquiries, and general user threads — most recently active
  /// first. This is what the Messages screen lists.
  List<Conversation> get conversations {
    final out = <Conversation>[];
    for (final r in myConversations) {
      out.add(
        Conversation(
          key: 'request:${r.id}',
          requestId: r.id,
          itemId: r.itemId,
          item: itemByIdOrNull(r.itemId),
          listingTitle: listingByIdOrNull(r.itemId)?.title,
          other: otherPartyFor(r),
          lastMessage: lastMessageFor(r.id),
          lastActivity: lastMessageFor(r.id)?.createdAt ?? r.createdAt,
        ),
      );
    }
    final seen = <String>{};
    for (final m in _messages) {
      if (m.requestId != null) continue;
      final me = currentUser.id;
      if (m.senderId != me && m.otherUserId != me) continue;
      final otherId = m.senderId == me ? m.otherUserId : m.senderId;
      if (otherId == null) continue;
      final key = m.itemId != null
          ? 'item:${m.itemId}:$otherId'
          : 'user:$otherId';
      if (!seen.add(key)) continue;
      final last = m.itemId != null
          ? lastMessageForItemThread(m.itemId!, otherId)
          : lastMessageForUserThread(otherId);
      out.add(
        Conversation(
          key: key,
          itemId: m.itemId,
          item: m.itemId != null ? itemByIdOrNull(m.itemId!) : null,
          other: userById(otherId),
          lastMessage: last,
          lastActivity: last?.createdAt ?? m.createdAt,
        ),
      );
    }
    out.sort((a, b) => b.lastActivity.compareTo(a.lastActivity));
    return out;
  }

  // ---------------- Derived notifications ----------------

  List<DerivedNotification> get derivedNotifications {
    final me = currentUser;
    final out = <DerivedNotification>[];
    void push(
      BorrowRequest r,
      String suffix,
      String type,
      String kind,
      String title,
      String body,
      DateTime at,
    ) {
      out.add(
        DerivedNotification(
          id: 'dnf-${r.id}-$suffix',
          type: type,
          title: title,
          body: body,
          createdAt: at,
          requestId: r.id,
          itemId: r.itemId,
          kind: kind,
        ),
      );
    }

    for (final r in _requests) {
      final item = itemByIdOrNull(r.itemId);
      final listing = listingByIdOrNull(r.itemId);
      if (item == null && listing == null) continue;
      // Title/owner resolve across both catalogs (Phase 5 listings).
      final itemTitle = item?.title ?? listing!.title;
      final itemOwnerId = item?.ownerId ?? listing!.ownerId;
      final isLender = itemOwnerId == me.id;
      final isBorrower = r.borrowerId == me.id;
      if (!isLender && !isBorrower) continue;
      final borrower = userById(r.borrowerId);
      final owner = userById(itemOwnerId);
      final other = isLender ? borrower : owner;

      if (r.issue != null && r.issue!.reportedBy != me.id) {
        push(
          r,
          'issue',
          'issue-reported',
          'action',
          'Issue reported',
          '${userById(r.issue!.reportedBy).name} reported an issue (${r.issue!.reason}) with $itemTitle.',
          r.issue!.reportedAt,
        );
      }
      switch (r.status) {
        case 'pending':
          if (isLender) {
            push(
              r,
              'pending-in',
              'request-received',
              'action',
              'New request',
              '${borrower.name} sent a request for your $itemTitle.',
              r.createdAt,
            );
          }
          break;
        case 'approved':
          push(
            r,
            'approved',
            'request-approved',
            isLender ? 'action' : 'info',
            isLender ? 'Confirm pickup' : 'Request approved',
            isLender
                ? 'Once ${other.name} picks up the $itemTitle, mark it picked up in Activity.'
                : '${other.name} approved the $itemTitle — plan the pickup in Messages.',
            r.respondedAt ?? r.createdAt,
          );
          break;
        case 'declined':
          if (isBorrower) {
            push(
              r,
              'declined',
              'request-declined',
              'info',
              'Request declined',
              '${other.name} declined your request for $itemTitle.',
              r.respondedAt ?? r.createdAt,
            );
          }
          break;
        case 'active':
          if (r.isOverdue) {
            push(
              r,
              'overdue',
              'overdue',
              'action',
              isLender ? 'Item overdue' : 'Return overdue',
              isLender
                  ? '${other.name} still has your $itemTitle — it was due ${shortDate(r.period.end)}.'
                  : 'The $itemTitle was due ${shortDate(r.period.end)}. Return it or message ${other.name}.',
              r.period.end,
            );
          } else if (dueInDays(r.period.end) <= 1) {
            push(
              r,
              'due-soon',
              'return-reminder',
              'action',
              'Return coming up',
              '$itemTitle is ${dueLabel(r.period.end).toLowerCase()}.',
              r.createdAt,
            );
          }
          break;
        case 'returned':
        case 'completed':
          if (!hasReviewed(r.id, me.id)) {
            push(
              r,
              'review',
              'review-requested',
              'action',
              'Leave a review',
              'How did the $itemTitle deal go? Review ${other.name}.',
              r.returnedAt ?? r.createdAt,
            );
          }
          break;
      }
    }
    // Remote notification docs (written by either client — chat,
    // reviews, admin warnings) for the event types the derivation
    // above doesn't produce.
    for (final n in _remoteNotifications) {
      if (n.type != 'message-received' &&
          n.type != 'review-received' &&
          n.type != 'admin-warning') {
        continue;
      }
      out.add(
        DerivedNotification(
          id: 'remote-${n.id}',
          type: n.type,
          title: n.title,
          body: n.body,
          createdAt: n.createdAt,
          requestId: n.requestId,
          itemId: n.listingId,
          kind: 'info',
        ),
      );
    }
    // Action items first, newest first inside each group.
    out.sort((a, b) {
      final ka = a.kind == 'action' ? 0 : 1;
      final kb = b.kind == 'action' ? 0 : 1;
      if (ka != kb) return ka.compareTo(kb);
      return b.createdAt.compareTo(a.createdAt);
    });
    return out;
  }

  int get notificationBadgeCount =>
      derivedNotifications.where((n) => n.kind == 'action').length;
}

/// Outcome of [AppState.deleteMyAccount]: [deleted] says whether the
/// account is gone; [message] carries the honest explanation when a
/// step needs the user's attention (or why nothing was deleted).
class DeleteAccountResult {
  final bool deleted;
  final String? message;
  const DeleteAccountResult({required this.deleted, this.message});
}

/// One row in the Messages list: a borrow-request thread, an item
/// inquiry, or a general user thread. [requestId] is set only for
/// request threads; [itemId] is set for request and item threads.
class Conversation {
  final String key;
  final String? requestId;
  final String? itemId;
  final Item? item;

  /// Title of a Phase 5 listing when the thread's target is not a
  /// legacy item (vehicles, properties, arenas).
  final String? listingTitle;
  final AppUser other;
  final Message? lastMessage;
  final DateTime lastActivity;
  const Conversation({
    required this.key,
    this.requestId,
    this.itemId,
    this.item,
    this.listingTitle,
    required this.other,
    this.lastMessage,
    required this.lastActivity,
  });

  bool get isRequestThread => requestId != null;
  bool get isItemThread => requestId == null && itemId != null;
}
