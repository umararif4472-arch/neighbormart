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
  Future<void> transitionRequest({
    required BorrowRequest request,
    required String ownerId,
    String? listingStatus,
    Map<String, UserStats> statsByUserId = const {},
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
    for (final entry in statsByUserId.entries) {
      batch.update(_db.collection('users').doc(entry.key), {
        'stats': entry.value.toFirestoreMap(),
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
}

// ---------------------------------------------------------------------------
// Snapshot sessions

/// Owns a set of Firestore listeners and fans merged snapshots out to
/// AppState. Two instances exist in live mode: one for the public
/// catalog (listings / users / reviews, readable signed-out) and one
/// per signed-in user (their requests, messages, notifications,
/// favorites), cancelled on sign-out.
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

  void listenListings(void Function(List<Listing>) onData) {
    _add(
      _db
          .collection('listings')
          .orderBy('createdAt', descending: true)
          .snapshots()
          .listen(
            (snap) => onData(
              snap.docs
                  .map((d) => ListingFirestoreMap.fromMap(d.id, d.data()))
                  .toList(),
            ),
            onError: (_) {},
          ),
    );
  }

  void listenUsers(void Function(List<AppUser>) onData) {
    _add(
      _db
          .collection('users')
          .snapshots()
          .listen(
            (snap) => onData(
              snap.docs
                  .map(
                    (d) => FirebaseAuthService.instance.userFromDocData(
                      d.id,
                      d.data(),
                    ),
                  )
                  .toList(),
            ),
            onError: (_) {},
          ),
    );
  }

  void listenReviews(void Function(List<Review>) onData) {
    _add(
      _db
          .collection('reviews')
          .snapshots()
          .listen(
            (snap) => onData(
              snap.docs
                  .map((d) => ReviewFirestoreMap.fromMap(d.id, d.data()))
                  .toList(),
            ),
            onError: (_) {},
          ),
    );
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
    final threadMessages = <String, List<Message>>{};
    final threadSubs = <String, StreamSubscription<dynamic>>{};

    void emitRequests() {
      final merged = <String, BorrowRequest>{
        ...byBorrower,
        ...byOwner,
      }.values.toList()..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      onRequests(merged);
      // Keep one message listener per known request (bounded: the
      // 60 most recent threads — far beyond real usage).
      final ids = merged.take(60).map((r) => r.id).toSet();
      for (final id in ids) {
        if (threadSubs.containsKey(id)) continue;
        final sub = _db
            .collection('messages')
            .where('requestId', isEqualTo: id)
            .snapshots()
            .listen((snap) {
              threadMessages[id] = snap.docs
                  .map((d) => MessageFirestoreMap.fromMap(d.id, d.data()))
                  .toList();
              final all = threadMessages.values.expand((l) => l).toList()
                ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
              onMessages(all);
            }, onError: (_) {});
        threadSubs[id] = sub;
        _subs.add(sub);
      }
      for (final id in threadSubs.keys.toList()) {
        if (!ids.contains(id)) {
          threadSubs.remove(id)?.cancel();
          threadMessages.remove(id);
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
    _add(
      _db
          .collection('users')
          .doc(uid)
          .snapshots()
          .listen(
            (snap) => onOwnProfile(snap.data() ?? const {}),
            onError: (_) {},
          ),
    );
  }
}
