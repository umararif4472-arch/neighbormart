import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/firebase/firebase_init.dart';
import '../models/borrow_request.dart';
import '../models/firestore_maps.dart';
import '../models/listing.dart';
import '../models/message.dart';
import '../models/user.dart';
import 'auth_service.dart';

/// The live data layer (Phase 10): keeps AppState's in-memory lists in
/// step with Firestore and mirrors every mutation to the shared
/// backend, following the exact contract the web client uses —
/// document shapes from `firestore_maps.dart`, the rate-limit counter
/// protocol from web `rateLimit.ts`, and the transition batches from
/// web `requests.ts` — so the Firestore security rules accept every
/// write and both platforms see each other's data.
///
/// Everything here is a no-op unless [firebaseReady]. AppState stays
/// the UI's source of truth locally; this layer hydrates it from
/// snapshot listeners and writes through on mutation, fire-and-forget
/// with errors swallowed by the caller pattern the app already uses
/// for mirrors (a write must never crash the UI; the snapshot echo
/// reconciles state when it lands).

// ---------------------------------------------------------------------------
// Rate limiting — a direct port of web src/utils/rateLimit.ts checkWindow.

const int kListingRateLimit = 10;
const Duration kListingRateWindow = Duration(hours: 24);
const int kMessageRateLimit = 30;
const Duration kMessageRateWindow = Duration(minutes: 1);

// ---------------------------------------------------------------------------
// Bounded reads — the canonical browse contract shared with the web
// client. Listings are fetched ONE PAGE at a time (never a
// whole-collection listener): status == 'active', optionally
// section / listingType / location.city, newest first. Notifications
// and per-thread messages are likewise capped.

const int kListingPageSize = 24;
const int kNotificationLimit = 50;
const int kOwnListingsLimit = 100;
const int kMessageThreadPageSize = 100;

/// The canonical browse query for one page of listings. [section],
/// [listingType] and [city] are the optional facets; [startAfter] is
/// the previous page's last document snapshot.
Query<Map<String, dynamic>> browseListingsQuery(
  FirebaseFirestore db, {
  ListingSection? section,
  ListingType? listingType,
  String? city,
  DocumentSnapshot<Map<String, dynamic>>? startAfter,
}) {
  Query<Map<String, dynamic>> query = db
      .collection('listings')
      .where('status', isEqualTo: ListingStatus.active.name);
  if (section != null) {
    query = query.where('section', isEqualTo: section.name);
  }
  if (listingType != null) {
    query = query.where('listingType', isEqualTo: listingType.name);
  }
  if (city != null) {
    query = query.where('location.city', isEqualTo: city);
  }
  query = query.orderBy('createdAt', descending: true).limit(kListingPageSize);
  if (startAfter != null) {
    query = query.startAfterDocument(startAfter);
  }
  return query;
}

class RateWindowDecision {
  final bool allowed;
  final DateTime windowStart;
  final int count;
  const RateWindowDecision({
    required this.allowed,
    required this.windowStart,
    required this.count,
  });
}

RateWindowDecision checkRateWindow({
  required int count,
  required DateTime? windowStart,
  required DateTime now,
  required int limit,
  required Duration window,
}) {
  if (windowStart == null || now.difference(windowStart) >= window) {
    return RateWindowDecision(allowed: true, windowStart: now, count: 1);
  }
  if (count >= limit) {
    return RateWindowDecision(
      allowed: false,
      windowStart: windowStart,
      count: count,
    );
  }
  return RateWindowDecision(
    allowed: true,
    windowStart: windowStart,
    count: count + 1,
  );
}

// ---------------------------------------------------------------------------

class LiveSync {
  LiveSync._();
  static final LiveSync instance = LiveSync._();

  FirebaseFirestore get _db => FirebaseFirestore.instance;

  bool get active => firebaseReady;

  /// A fresh Firestore document id (client-minted, like the web —
  /// the rate-limit counter binds to it before the create).
  String newDocId(String collection) => _db.collection(collection).doc().id;

  // --- Rate-limit counter bumps (must precede listing/message creates)

  Future<void> _bump(
    String uid,
    String kind,
    String targetId, {
    required int limit,
    required Duration window,
  }) async {
    final ref = _db.collection('rateLimits').doc(uid);
    final snap = await ref.get();
    final data = snap.data() ?? const <String, dynamic>{};
    final countKey = kind == 'listings' ? 'listingsCount' : 'messagesCount';
    final startKey = kind == 'listings'
        ? 'listingsWindowStartTs'
        : 'messagesWindowStartTs';
    final lastKey = kind == 'listings' ? 'lastListingId' : 'lastMessageId';
    final startTs = data[startKey];
    final decision = checkRateWindow(
      count: (data[countKey] as num?)?.toInt() ?? 0,
      windowStart: startTs is Timestamp ? startTs.toDate() : null,
      now: DateTime.now(),
      limit: limit,
      window: window,
    );
    if (!decision.allowed) {
      throw StateError(
        kind == 'listings'
            ? 'You can publish at most $limit listings in 24 hours.'
            : 'You are sending messages too fast — slow down a moment.',
      );
    }
    await ref.set({
      countKey: decision.count,
      startKey: Timestamp.fromDate(decision.windowStart),
      lastKey: targetId,
    }, SetOptions(merge: true));
  }

  Future<void> bumpListingQuota(String uid, String listingId) => _bump(
    uid,
    'listings',
    listingId,
    limit: kListingRateLimit,
    window: kListingRateWindow,
  );

  Future<void> bumpMessageQuota(String uid, String messageId) => _bump(
    uid,
    'messages',
    messageId,
    limit: kMessageRateLimit,
    window: kMessageRateWindow,
  );

  // --- Listings ------------------------------------------------------

  Future<void> createListing(Listing listing) async {
    if (!active) return;
    await bumpListingQuota(listing.ownerId, listing.id);
    await _db
        .collection('listings')
        .doc(listing.id)
        .set(listing.toFirestoreMap());
  }

  Future<void> updateListing(Listing listing) async {
    if (!active) return;
    await _db
        .collection('listings')
        .doc(listing.id)
        .set(listing.toFirestoreMap(), SetOptions(merge: true));
  }

  Future<void> updateListingStatus(String listingId, String status) async {
    if (!active) return;
    await _db.collection('listings').doc(listingId).update({
      'status': status,
      'updatedAt': DateTime.now().toIso8601String(),
    });
  }

  Future<void> deleteListing(String listingId) async {
    if (!active) return;
    await _db.collection('listings').doc(listingId).delete();
  }

  // --- Requests --------------------------------------------------------

  Future<void> createRequest(BorrowRequest request, String ownerId) async {
    if (!active) return;
    await _db
        .collection('requests')
        .doc(request.id)
        .set(request.toFirestoreMap(ownerId));
  }

  Future<void> updateRequest(BorrowRequest request, String ownerId) async {
    if (!active) return;
    await _db
        .collection('requests')
        .doc(request.id)
        .update(request.toFirestoreMap(ownerId));
  }

  /// The multi-document transition batches, mirroring web requests.ts:
  /// the request, the listing's status flip, and both parties' stats
  /// land atomically or not at all.
  ///
  /// Stats (Workstream D) move by [FieldValue.increment] on the
  /// dotted counter paths — [statIncrementsByUserId] maps a user id
  /// to the counter NAMES this deal bumps (each by exactly 1). No
  /// read-modify-write of a whole stats object, and unchanged
  /// counters are never written; the rules' stats-delta branch
  /// (diff limited to stats, each counter old-or-old+1) is satisfied
  /// by construction.
  Future<void> transitionRequest({
    required BorrowRequest request,
    required String ownerId,
    String? listingStatus,
    Map<String, List<String>> statIncrementsByUserId = const {},
  }) async {
    if (!active) return;
    final batch = _db.batch();
    batch.update(
      _db.collection('requests').doc(request.id),
      request.toFirestoreMap(ownerId),
    );
    if (listingStatus != null) {
      batch.update(_db.collection('listings').doc(request.itemId), {
        'status': listingStatus,
        'updatedAt': DateTime.now().toIso8601String(),
      });
    }
    for (final entry in statIncrementsByUserId.entries) {
      if (entry.value.isEmpty) continue;
      batch.update(_db.collection('users').doc(entry.key), {
        for (final counter in entry.value)
          'stats.$counter': FieldValue.increment(1),
      });
    }
    await batch.commit();
  }

  // --- Messages --------------------------------------------------------

  Future<void> createMessage(
    Message message, {
    required String recipientId,
    required String senderName,
    required String listingId,
  }) async {
    if (!active) return;
    await bumpMessageQuota(message.senderId, message.id);
    await _db
        .collection('messages')
        .doc(message.id)
        .set(message.toFirestoreMap());
    await notifyUser(
      userId: recipientId,
      type: 'message-received',
      title: 'New message from $senderName',
      body: message.body.length > 80
          ? message.body.substring(0, 80)
          : message.body,
      requestId: message.requestId,
      listingId: listingId,
    );
  }

  // --- Reviews ---------------------------------------------------------

  Future<void> addReview(
    Review review, {
    required String revieweeName,
    required String listingTitle,
  }) async {
    if (!active) return;
    final docId = ReviewFirestoreMap.docId(review.requestId, review.reviewerId);
    await _db.collection('reviews').doc(docId).set(review.toFirestoreMap());
    await notifyUser(
      userId: review.revieweeId,
      type: 'review-received',
      title: 'New review from $revieweeName',
      body: '${'★' * review.rating} on $listingTitle',
      requestId: review.requestId,
      listingId: review.itemId,
    );
  }

  // --- Issues ------------------------------------------------------------

  /// Mirrors web reportIssue: the request gains its issue, a report
  /// lands in the moderation queue, and the other party is notified.
  Future<void> reportIssue({
    required BorrowRequest request,
    required String ownerId,
    required String reporterName,
    required String listingTitle,
  }) async {
    if (!active) return;
    final issue = request.issue;
    if (issue == null) return;
    final batch = _db.batch();
    batch.update(_db.collection('requests').doc(request.id), {
      'issue': {
        'reportedBy': issue.reportedBy,
        'reason': issue.reason,
        'note': issue.note,
        'reportedAt': issue.reportedAt.toIso8601String(),
      },
    });
    final reportRef = _db.collection('reports').doc();
    batch.set(reportRef, {
      'kind': 'borrow-issue',
      'requestId': request.id,
      'listingId': request.itemId,
      'reportedBy': issue.reportedBy,
      'reason': issue.reason,
      'note': issue.note,
      'status': 'open',
      'createdAt': issue.reportedAt.toIso8601String(),
    });
    await batch.commit();
    final recipientId = issue.reportedBy == ownerId
        ? request.borrowerId
        : ownerId;
    await notifyUser(
      userId: recipientId,
      type: 'issue-reported',
      title: 'Issue reported on a borrow',
      body:
          '$reporterName flagged "${issue.reason}" on the $listingTitle borrow — please check your messages.',
      requestId: request.id,
      listingId: request.itemId,
    );
  }

  // --- Notifications ------------------------------------------------------

  Future<void> notifyUser({
    required String userId,
    required String type,
    required String title,
    required String body,
    String? requestId,
    String? listingId,
  }) async {
    if (!active) return;
    final doc = NotificationDoc(
      id: '',
      userId: userId,
      type: type,
      title: title,
      body: body,
      requestId: requestId,
      listingId: listingId,
      read: false,
      createdAt: DateTime.now(),
    );
    await _db.collection('notifications').add(doc.toFirestoreMap());
  }

  // --- Profiles -------------------------------------------------------------

  Future<void> updateUserFields(String uid, Map<String, dynamic> fields) async {
    if (!active) return;
    await _db.collection('users').doc(uid).update(fields);
  }

  // --- Bounded one-shot reads (no whole-collection mirroring) --------------
  //
  // Profiles, reviews and single listings are fetched ON DEMAND and
  // cached by AppState — the users/reviews collections are never
  // listened to or downloaded wholesale.

  /// One user profile by id, or null when it does not exist.
  ///
  /// PUBLIC doc only — this feeds the on-demand cache for OTHER
  /// users (owner cards, chat counterparts, profile screens), and
  /// the privacy contract forbids reading another user's private
  /// doc. Missing private fields parse as safe defaults (no phone,
  /// empty block list, Lahore-centre placeholder location — never
  /// used for display or distance; distances use listing.location).
  /// The signed-in user's own merged profile comes from
  /// [FirebaseAuthService.ensureProfile] and the own-profile
  /// listener in [LiveSession.listenUserActivity] instead.
  Future<AppUser?> fetchUserById(String uid) async {
    if (!active || uid.isEmpty) return null;
    final snap = await _db.collection('users').doc(uid).get();
    if (!snap.exists || snap.data() == null) return null;
    return FirebaseAuthService.instance.userFromDocData(uid, snap.data()!);
  }

  /// One listing by id (detail screens deep-linked past the loaded
  /// browse window), or null when it does not exist.
  Future<Listing?> fetchListingById(String id) async {
    if (!active || id.isEmpty) return null;
    final snap = await _db.collection('listings').doc(id).get();
    if (!snap.exists || snap.data() == null) return null;
    return ListingFirestoreMap.fromMap(snap.id, snap.data()!);
  }

  /// ALL of one owner's listings, any status, newest first, capped
  /// at [kOwnListingsLimit] (Part 3a): the paged browse windows hold
  /// ACTIVE listings only, so an owner's paused / sold / rented
  /// listings would otherwise vanish from Manage Items after a
  /// restart. Served by the existing ownerId + createdAt composite
  /// index. This is a one-shot fetch for the signed-in user's own
  /// listings — it never touches the browse windows' state.
  Future<List<Listing>> fetchOwnListings(String uid) async {
    if (!active || uid.isEmpty) return const [];
    final snap = await _db
        .collection('listings')
        .where('ownerId', isEqualTo: uid)
        .orderBy('createdAt', descending: true)
        .limit(kOwnListingsLimit)
        .get();
    return snap.docs
        .map((d) => ListingFirestoreMap.fromMap(d.id, d.data()))
        .toList();
  }

  /// Reviews for one reviewee, newest first (profile / trust screens).
  Future<List<Review>> fetchReviewsForUser(String userId) async {
    if (!active || userId.isEmpty) return const [];
    final snap = await _db
        .collection('reviews')
        .where('revieweeId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .get();
    return snap.docs
        .map((d) => ReviewFirestoreMap.fromMap(d.id, d.data()))
        .toList();
  }

  /// Reviews for one listing, newest first (detail screens).
  Future<List<Review>> fetchReviewsForListing(String listingId) async {
    if (!active || listingId.isEmpty) return const [];
    final snap = await _db
        .collection('reviews')
        .where('listingId', isEqualTo: listingId)
        .orderBy('createdAt', descending: true)
        .get();
    return snap.docs
        .map((d) => ReviewFirestoreMap.fromMap(d.id, d.data()))
        .toList();
  }
}

// ---------------------------------------------------------------------------
// Snapshot sessions

/// Owns a set of Firestore listeners and fans merged snapshots out to
/// AppState. Two instances exist in live mode: one for the public
/// catalog (PAGED listing reads — no listeners on listings, users or
/// reviews at all) and one per signed-in user (their requests,
/// messages, notifications, favorites), cancelled on sign-out.
class LiveSession {
  final List<StreamSubscription<dynamic>> _subs = [];
  bool _cancelled = false;

  void _add(StreamSubscription<dynamic> sub) {
    if (_cancelled) {
      sub.cancel();
    } else {
      _subs.add(sub);
    }
  }

  Future<void> cancel() async {
    _cancelled = true;
    for (final sub in _subs) {
      await sub.cancel();
    }
    _subs.clear();
  }

  FirebaseFirestore get _db => FirebaseFirestore.instance;

  // --- Paged listing browse -------------------------------------------------
  //
  // One cursor per section: the last document snapshot of the page
  // most recently fetched for it. A short page (< [kListingPageSize])
  // marks the section exhausted; [loadMoreListings] is then a no-op.

  final Map<ListingSection, DocumentSnapshot<Map<String, dynamic>>?>
  _listingCursors = {};
  final Set<ListingSection> _listingExhausted = {};
  final Set<ListingSection> _listingInFlight = {};

  bool hasMoreListings(ListingSection section) =>
      !_listingExhausted.contains(section);

  /// Fetch the first page (24, newest first, active only) for EVERY
  /// section, so signed-out browse works for the whole catalog.
  /// [onPage] fires once per section as its page lands.
  Future<void> loadListingFirstPages(
    void Function(ListingSection section, List<Listing> page) onPage,
  ) async {
    await Future.wait([
      for (final section in ListingSection.values)
        _fetchListingPage(section, onPage, firstPage: true),
    ]);
  }

  /// Fetch the next page for [section] and deliver it through
  /// [onPage]. A no-op once the section is exhausted or while a page
  /// for it is already in flight.
  Future<void> loadMoreListings(
    ListingSection section,
    void Function(ListingSection section, List<Listing> page) onPage,
  ) => _fetchListingPage(section, onPage, firstPage: false);

  Future<void> _fetchListingPage(
    ListingSection section,
    void Function(ListingSection section, List<Listing> page) onPage, {
    required bool firstPage,
  }) async {
    if (_cancelled || !firebaseReady) return;
    if (!firstPage && _listingExhausted.contains(section)) return;
    if (!_listingInFlight.add(section)) return;
    try {
      final snap = await browseListingsQuery(
        _db,
        section: section,
        startAfter: firstPage ? null : _listingCursors[section],
      ).get();
      if (_cancelled) return;
      if (snap.docs.isNotEmpty) {
        _listingCursors[section] = snap.docs.last;
      }
      if (snap.docs.length < kListingPageSize) {
        _listingExhausted.add(section);
      }
      onPage(
        section,
        snap.docs
            .map((d) => ListingFirestoreMap.fromMap(d.id, d.data()))
            .toList(),
      );
    } catch (_) {
      // A failed page leaves the cursor untouched — the next
      // loadMore retries the same page.
    } finally {
      _listingInFlight.remove(section);
    }
  }

  // --- Per-thread messages: latest page + load-older ------------------------
  //
  // Thread state lives on the session (not in the listenUserActivity
  // closure) so [loadOlderMessages] can page backwards later. Each
  // thread listens to its LATEST [kMessageThreadPageSize] messages
  // (newest-first query, reversed for display); older pages are
  // one-shot gets merged in front.

  final Map<String, List<Message>> _threadMessages = {};
  final Map<String, DocumentSnapshot<Map<String, dynamic>>?> _threadOldestDoc =
      {};
  final Set<String> _threadHasOlder = {};
  void Function(List<Message>)? _emitMessages;

  /// True when [requestId]'s thread returned a full latest page, so
  /// an older page likely exists.
  bool threadHasOlder(String requestId) => _threadHasOlder.contains(requestId);

  void _emitAllMessages() {
    final emit = _emitMessages;
    if (emit == null || _cancelled) return;
    final all = _threadMessages.values.expand((l) => l).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    emit(all);
  }

  /// Fetch the next OLDER page (up to [kMessageThreadPageSize]) for a
  /// thread and merge it in. Returns true when a page was fetched;
  /// false at the start of the thread (or while signed out).
  Future<bool> loadOlderMessages(String requestId) async {
    if (_cancelled || !firebaseReady) return false;
    if (!_threadHasOlder.contains(requestId)) return false;
    final cursor = _threadOldestDoc[requestId];
    if (cursor == null) return false;
    try {
      final snap = await _db
          .collection('messages')
          .where('requestId', isEqualTo: requestId)
          .orderBy('createdAt', descending: true)
          .limit(kMessageThreadPageSize)
          .startAfterDocument(cursor)
          .get();
      if (_cancelled) return false;
      if (snap.docs.isNotEmpty) {
        _threadOldestDoc[requestId] = snap.docs.last;
        final older = snap.docs
            .map((d) => MessageFirestoreMap.fromMap(d.id, d.data()))
            .toList()
            .reversed
            .toList();
        final existing = _threadMessages[requestId] ?? const <Message>[];
        final known = existing.map((m) => m.id).toSet();
        _threadMessages[requestId] = [
          ...older.where((m) => !known.contains(m.id)),
          ...existing,
        ];
      }
      if (snap.docs.length < kMessageThreadPageSize) {
        _threadHasOlder.remove(requestId);
      }
      _emitAllMessages();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Requests where the user is borrower OR owner (two queries merged
  /// by id), plus the per-request message threads for those requests.
  void listenUserActivity(
    String uid, {
    required void Function(List<BorrowRequest>) onRequests,
    required void Function(List<Message>) onMessages,
    required void Function(List<NotificationDoc>) onNotifications,
    required void Function(Map<String, dynamic>) onOwnProfile,
  }) {
    final byBorrower = <String, BorrowRequest>{};
    final byOwner = <String, BorrowRequest>{};
    final threadSubs = <String, StreamSubscription<dynamic>>{};
    _emitMessages = onMessages;

    void emitRequests() {
      final merged = <String, BorrowRequest>{
        ...byBorrower,
        ...byOwner,
      }.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      onRequests(merged);
      // Keep one message listener per known request (bounded: the
      // 60 most recent threads — far beyond real usage). Each thread
      // listener is capped at the latest [kMessageThreadPageSize]
      // messages; older history pages in via [loadOlderMessages].
      final ids = merged.take(60).map((r) => r.id).toSet();
      for (final id in ids) {
        if (threadSubs.containsKey(id)) continue;
        final sub = _db
            .collection('messages')
            .where('requestId', isEqualTo: id)
            .orderBy('createdAt', descending: true)
            .limit(kMessageThreadPageSize)
            .snapshots()
            .listen((snap) {
              if (snap.docs.isNotEmpty) {
                _threadOldestDoc[id] = snap.docs.last;
              }
              if (snap.docs.length >= kMessageThreadPageSize) {
                _threadHasOlder.add(id);
              }
              // The listener owns the LATEST page; any older pages
              // already merged in front of it stay in front. The two
              // sets are disjoint by construction (older pages start
              // strictly after the latest page's oldest document);
              // dedup by id guards the boundary anyway.
              final latest = snap.docs
                  .map((d) => MessageFirestoreMap.fromMap(d.id, d.data()))
                  .toList()
                  .reversed
                  .toList();
              final latestIds = latest.map((m) => m.id).toSet();
              final older = (_threadMessages[id] ?? const <Message>[])
                  .where((m) => !latestIds.contains(m.id))
                  .toList();
              // Note: if the thread grows past one page, the oldest
              // message of the previous latest page drops out of the
              // listener window — it remains reachable again through
              // loadOlderMessages, whose cursor tracks the live
              // window's oldest document.
              _threadMessages[id] = [...older, ...latest];
              _emitAllMessages();
            }, onError: (_) {});
        threadSubs[id] = sub;
        _subs.add(sub);
      }
      for (final id in threadSubs.keys.toList()) {
        if (!ids.contains(id)) {
          threadSubs.remove(id)?.cancel();
          _threadMessages.remove(id);
          _threadOldestDoc.remove(id);
          _threadHasOlder.remove(id);
        }
      }
    }

    _add(
      _db
          .collection('requests')
          .where('borrowerId', isEqualTo: uid)
          .snapshots()
          .listen((snap) {
            byBorrower
              ..clear()
              ..addEntries(
                snap.docs.map(
                  (d) => MapEntry(
                    d.id,
                    BorrowRequestFirestoreMap.fromMap(d.id, d.data()),
                  ),
                ),
              );
            emitRequests();
          }, onError: (_) {}),
    );
    _add(
      _db
          .collection('requests')
          .where('ownerId', isEqualTo: uid)
          .snapshots()
          .listen((snap) {
            byOwner
              ..clear()
              ..addEntries(
                snap.docs.map(
                  (d) => MapEntry(
                    d.id,
                    BorrowRequestFirestoreMap.fromMap(d.id, d.data()),
                  ),
                ),
              );
            emitRequests();
          }, onError: (_) {}),
    );
    _add(
      _db
          .collection('notifications')
          .where('userId', isEqualTo: uid)
          .orderBy('createdAt', descending: true)
          .limit(kNotificationLimit)
          .snapshots()
          .listen(
            (snap) => onNotifications(
              snap.docs
                  .map((d) => NotificationDoc.fromMap(d.id, d.data()))
                  .toList(),
            ),
            onError: (_) {},
          ),
    );
    // Own profile (privacy split): the public doc and the private
    // doc are listened to separately and emitted MERGED (private
    // wins per-field, legacy public fields are the fallback — see
    // mergeProfileData). Nothing is emitted until the public doc has
    // arrived; a missing private doc (pre-migration user) simply
    // contributes nothing.
    Map<String, dynamic>? ownPublic;
    Map<String, dynamic>? ownPrivate;
    void emitOwnProfile() {
      final pub = ownPublic;
      if (pub == null) return;
      onOwnProfile(mergeProfileData(pub, ownPrivate));
    }

    _add(
      _db.collection('users').doc(uid).snapshots().listen((snap) {
        ownPublic = snap.data() ?? const {};
        emitOwnProfile();
      }, onError: (_) {}),
    );
    _add(
      _db
          .collection('users')
          .doc(uid)
          .collection('private')
          .doc('data')
          .snapshots()
          .listen((snap) {
            ownPrivate = snap.data();
            emitOwnProfile();
          }, onError: (_) {}),
    );
  }
}
