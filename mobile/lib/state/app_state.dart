import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/utils/trust_score.dart';
import '../core/utils/formatters.dart';
import '../data/models/user.dart';
import '../data/models/item.dart';
import '../data/models/borrow_request.dart';
import '../data/models/wishlist_item.dart';
import '../data/models/message.dart';
import '../data/models/app_notification.dart';
import '../data/mock/seed_data.dart';
import '../data/services/auth_service.dart';

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

class AppState extends ChangeNotifier {
  static const _kSessionUserId = 'sessionUserId';
  static const _kOnboardingSeen = 'onboardingSeen';

  late List<AppUser> _users;
  late List<Item> _items;
  late List<BorrowRequest> _requests;
  late List<WishlistItem> _wishlist;
  late List<Review> _reviews;
  late List<Message> _messages;
  int _idCounter = 100;

  String _currentUserId = 'u-maya';

  /// Defaults keep widget/unit tests working without any session setup;
  /// [restoreFromPrefs] applies the real persisted session at app start.
  bool isLoggedIn = true;
  bool onboardingSeen = true;
  bool notificationsEnabled = true;
  final Set<String> _favoriteItemIds = {};
  SharedPreferences? _prefs;

  AppState() {
    _seedAll();
  }

  void _seedAll() {
    _users = List.of(seedUsers());
    _items = List.of(seedItems(_users));
    _requests = List.of(seedRequests());
    _reviews = List.of(seedReviews());
    _wishlist = List.of(seedWishlist());
    _messages = List.of(seedMessages());
  }

  // For tests / custom seeding
  AppState.withData({
    required List<AppUser> users,
    required List<Item> items,
    required List<BorrowRequest> requests,
    required List<WishlistItem> wishlist,
    required List<Review> reviews,
    List<Message>? messages,
    String currentUserId = 'u-maya',
  }) {
    _users = users;
    _items = items;
    _requests = requests;
    _wishlist = wishlist;
    _reviews = reviews;
    _messages = List.of(messages ?? seedMessages());
    _currentUserId = currentUserId;
  }

  List<AppUser> get users => List.unmodifiable(_users);
  List<Item> get items => List.unmodifiable(_items);
  List<BorrowRequest> get requests => List.unmodifiable(_requests);
  List<WishlistItem> get wishlist => List.unmodifiable(_wishlist);
  List<Review> get reviews => List.unmodifiable(_reviews);
  List<Message> get messages => List.unmodifiable(_messages);

  AppUser get currentUser => userById(_currentUserId);
  AppUser userById(String id) =>
      _users.firstWhere((u) => u.id == id, orElse: () => _users.first);
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
    var result = _items.where((item) {
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
  }

  /// Favorited items that still exist, in catalog order.
  List<Item> get favoriteItems =>
      _items.where((i) => _favoriteItemIds.contains(i.id)).toList();

  List<BorrowRequest> get incomingRequests {
    final myIds = myItems.map((i) => i.id).toSet();
    // include items owned by Maya even if list changes
    final owned = _items
        .where((i) => i.ownerId == currentUser.id)
        .map((i) => i.id)
        .toSet();
    final ids = {...myIds, ...owned};
    return _requests.where((r) => ids.contains(r.itemId)).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  List<BorrowRequest> get outgoingRequests {
    return _requests.where((r) => r.borrowerId == currentUser.id).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  int get pendingIncomingCount =>
      incomingRequests.where((r) => r.status == 'pending').length;

  String ownerIdFor(BorrowRequest r) => itemById(r.itemId).ownerId;

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
    notifyListeners();
  }

  void declineRequest(String requestId) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'pending') return;
    _replaceRequest(
      r.copyWith(status: 'declined', respondedAt: DateTime.now()),
    );
    notifyListeners();
  }

  void markPickedUp(String requestId) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'approved') return;
    _replaceRequest(r.copyWith(status: 'active'));
    // mark item borrowed
    final idx = _items.indexWhere((i) => i.id == r.itemId);
    if (idx >= 0) _items[idx] = _items[idx].copyWith(availability: 'borrowed');
    notifyListeners();
  }

  void markReturned(String requestId, {required bool onTime}) {
    final r = _requests.firstWhere((x) => x.id == requestId);
    if (r.status != 'active' && r.status != 'approved') return;
    _replaceRequest(r.copyWith(status: 'returned', returnedAt: DateTime.now()));
    final idx = _items.indexWhere((i) => i.id == r.itemId);
    if (idx >= 0) _items[idx] = _items[idx].copyWith(availability: 'available');
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
    final ownerId = itemById(r.itemId).ownerId;
    final lIdx = _users.indexWhere((u) => u.id == ownerId);
    if (lIdx >= 0) {
      final u = _users[lIdx];
      _users[lIdx] = u.copyWith(
        stats: u.stats.copyWith(successfulLends: u.stats.successfulLends + 1),
      );
    }
    notifyListeners();
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
    _requests.insert(
      0,
      BorrowRequest(
        id: 'req-new-$_idCounter',
        itemId: item.id,
        borrowerId: currentUser.id,
        period: BorrowPeriod(start: s, end: e),
        note: note.trim(),
        status: 'pending',
        createdAt: DateTime.now(),
      ),
    );
    notifyListeners();
    return null;
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
      id: 'i-new-$_idCounter',
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
    _currentUserId = user.id;
    isLoggedIn = true;
    _persistSession();
    notifyListeners();
  }

  void signOut() {
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
  }

  void verifyPhone() {
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return;
    _users[idx] = _users[idx].copyWith(phoneVerified: true);
    notifyListeners();
  }

  void verifyEmail() {
    final idx = _users.indexWhere((u) => u.id == _currentUserId);
    if (idx < 0) return;
    _users[idx] = _users[idx].copyWith(emailVerified: true);
    notifyListeners();
  }

  void setNotificationsEnabled(bool value) {
    notificationsEnabled = value;
    notifyListeners();
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
    return _items[idx];
  }

  /// Returns null on success, or an explanation when deletion is blocked.
  String? deleteItem(String itemId) {
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
    notifyListeners();
    return null;
  }

  void setItemAvailability(String itemId, String availability) {
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
    if (r.status != 'returned' && r.status != 'reviewed') {
      return 'Reviews open once the item is returned.';
    }
    if (rating < 1 || rating > 5) return 'Pick a star rating first.';
    final me = currentUser;
    if (hasReviewed(requestId, me.id)) {
      return 'You have already reviewed this borrow.';
    }
    final item = itemById(r.itemId);
    final iAmBorrower = r.borrowerId == me.id;
    final revieweeId = iAmBorrower ? item.ownerId : r.borrowerId;
    _idCounter++;
    _reviews.insert(
      0,
      Review(
        id: 'rev-new-$_idCounter',
        requestId: requestId,
        itemId: r.itemId,
        reviewerId: me.id,
        revieweeId: revieweeId,
        reviewerRole: iAmBorrower ? 'borrower' : 'lender',
        rating: rating,
        comment: comment.trim(),
        createdAt: DateTime.now(),
      ),
    );
    // Both parties reviewed -> terminal 'reviewed'.
    final reviewers = _reviews
        .where((x) => x.requestId == requestId)
        .map((x) => x.reviewerId)
        .toSet();
    if (reviewers.contains(r.borrowerId) && reviewers.contains(item.ownerId)) {
      _replaceRequest(r.copyWith(status: 'reviewed'));
    }
    notifyListeners();
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
    final ownerId = itemById(r.itemId).ownerId;
    return userById(r.borrowerId == currentUser.id ? ownerId : r.borrowerId);
  }

  /// One conversation per request the current user is part of, most
  /// recently active first (requests without messages sort by creation).
  List<BorrowRequest> get myConversations {
    final mine = _requests.where((r) {
      if (itemByIdOrNull(r.itemId) == null) return false;
      return r.borrowerId == currentUser.id ||
          itemById(r.itemId).ownerId == currentUser.id;
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
    _messages.add(
      Message(
        id: 'msg-new-$_idCounter',
        requestId: requestId,
        senderId: currentUser.id,
        body: text,
        createdAt: DateTime.now(),
      ),
    );
    notifyListeners();
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
      if (item == null) continue;
      final isLender = item.ownerId == me.id;
      final isBorrower = r.borrowerId == me.id;
      if (!isLender && !isBorrower) continue;
      final borrower = userById(r.borrowerId);
      final owner = userById(item.ownerId);
      final other = isLender ? borrower : owner;

      if (r.issue != null && r.issue!.reportedBy != me.id) {
        push(
          r,
          'issue',
          'issue-reported',
          'action',
          'Issue reported',
          '${userById(r.issue!.reportedBy).name} reported an issue (${r.issue!.reason}) with ${item.title}.',
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
              'New borrow request',
              '${borrower.name} wants to borrow your ${item.title}.',
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
                ? 'Once ${other.name} picks up the ${item.title}, mark it picked up in Activity.'
                : '${other.name} approved the ${item.title} — plan the pickup in Messages.',
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
              '${other.name} declined your request for ${item.title}.',
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
                  ? '${other.name} still has your ${item.title} — it was due ${shortDate(r.period.end)}.'
                  : 'The ${item.title} was due ${shortDate(r.period.end)}. Return it or message ${other.name}.',
              r.period.end,
            );
          } else if (dueInDays(r.period.end) <= 1) {
            push(
              r,
              'due-soon',
              'return-reminder',
              'action',
              'Return coming up',
              '${item.title} is ${dueLabel(r.period.end).toLowerCase()}.',
              r.createdAt,
            );
          }
          break;
        case 'returned':
          if (!hasReviewed(r.id, me.id)) {
            push(
              r,
              'review',
              'review-requested',
              'action',
              'Leave a review',
              'How did borrowing ${item.title} go? Review ${other.name}.',
              r.returnedAt ?? r.createdAt,
            );
          }
          break;
      }
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

/// One row in the Messages list: a borrow-request thread, an item
/// inquiry, or a general user thread. [requestId] is set only for
/// request threads; [itemId] is set for request and item threads.
class Conversation {
  final String key;
  final String? requestId;
  final String? itemId;
  final Item? item;
  final AppUser other;
  final Message? lastMessage;
  final DateTime lastActivity;
  const Conversation({
    required this.key,
    this.requestId,
    this.itemId,
    this.item,
    required this.other,
    this.lastMessage,
    required this.lastActivity,
  });

  bool get isRequestThread => requestId != null;
  bool get isItemThread => requestId == null && itemId != null;
}
