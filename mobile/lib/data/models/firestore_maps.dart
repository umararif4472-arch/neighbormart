import 'borrow_request.dart';
import 'listing.dart';
import 'message.dart';
import 'user.dart';

/// Firestore document mappings for the live backend (Phase 10 — the
/// Flutter live-data pass). The web client's document shape is the
/// contract (see web `src/services/live/firestoreData.ts`): a document
/// body is the model as plain JSON — ISO date strings, enum names as
/// strings — minus its `id`, which becomes the document id.
///
/// These extensions are the write/read twins of the mappings the web
/// writes, so a listing or request created on either platform reads
/// correctly on the other.

String _iso(DateTime d) => d.toIso8601String();

/// Calendar stamp (yyyy-MM-dd) for borrow periods — the web stores
/// periods as local calendar stamps, not instants.
String _dateStamp(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

DateTime _parseDate(Object? v) =>
    DateTime.tryParse(v as String? ?? '') ?? DateTime.now();

extension ListingFirestoreWrite on Listing {
  /// The exact inverse of [ListingFirestoreMap.fromMap].
  Map<String, dynamic> toFirestoreMap() {
    final base = <String, dynamic>{
      'section': section.name,
      'ownerId': ownerId,
      'listingType': listingType.name,
      'title': title,
      'description': description,
      'price': price,
      'currency': currency,
      'priceUnit': priceUnit.name,
      'negotiable': negotiable,
      'photos': photos,
      'location': {
        'lat': location.lat,
        'lng': location.lng,
        'city': location.city,
        'area': location.area,
      },
      'status': status.name,
      'createdAt': _iso(createdAt),
      'updatedAt': _iso(updatedAt),
      'views': views,
    };
    switch (this) {
      case ItemListing l:
        final d = l.details;
        base['details'] = <String, dynamic>{
          'category': d.category,
          'condition': d.condition,
          if (d.depositAmount != null) 'depositAmount': d.depositAmount,
          'maxDurationDays': d.maxDurationDays,
          'pickupPreference': d.pickupPreference,
          'pickupInstructions': d.pickupInstructions,
        };
      case VehicleListing l:
        final d = l.details;
        base['details'] = <String, dynamic>{
          'make': d.make,
          'model': d.model,
          'year': d.year,
          'mileageKm': d.mileageKm,
          'fuelType': d.fuelType.name,
          'transmission': d.transmission.name,
          'condition': d.condition,
          'withDriver': d.withDriver,
          'registrationCity': d.registrationCity,
        };
      case PropertyListing l:
        final d = l.details;
        base['details'] = <String, dynamic>{
          'propertyType': d.propertyType.name,
          'bedrooms': d.bedrooms,
          'bathrooms': d.bathrooms,
          'areaSize': d.areaSize,
          'areaUnit': d.areaUnit.name,
          'furnished': d.furnished,
          'floor': d.floor,
          'amenities': d.amenities,
          'availableFrom': _iso(d.availableFrom),
        };
      case ArenaListing l:
        final d = l.details;
        base['details'] = <String, dynamic>{
          'sportTypes': d.sportTypes,
          'surface': d.surface,
          'capacity': d.capacity,
          'slotMinutes': d.slotMinutes,
          'openingHours': {'opens': d.opensAt, 'closes': d.closesAt},
          'facilities': {
            'floodlights': d.facilities.floodlights,
            'parking': d.facilities.parking,
            'washrooms': d.facilities.washrooms,
            'changingRooms': d.facilities.changingRooms,
          },
          'advanceBooking': {
            'maxAdvanceDays': d.advanceBooking.maxAdvanceDays,
            'minAdvanceHours': d.advanceBooking.minAdvanceHours,
          },
        };
    }
    return base;
  }
}

extension BorrowRequestFirestoreMap on BorrowRequest {
  /// [ownerId] is denormalized onto the document (the rules'
  /// participant checks read it) even though the Dart model derives
  /// ownership from the listing.
  Map<String, dynamic> toFirestoreMap(String ownerId) {
    return <String, dynamic>{
      'listingId': itemId,
      'borrowerId': borrowerId,
      'ownerId': ownerId,
      'period': {
        'start': _dateStamp(period.start),
        'end': _dateStamp(period.end),
      },
      'note': note,
      'offerAmount': offerAmount,
      'slot': slot == null
          ? null
          : {
              'date': slot!.date,
              'startTime': slot!.startTime,
              'endTime': slot!.endTime,
            },
      'status': status,
      'createdAt': _iso(createdAt),
      'respondedAt': respondedAt == null ? null : _iso(respondedAt!),
      'dueAt': dueAt == null ? null : _iso(dueAt!),
      'returnedAt': returnedAt == null ? null : _iso(returnedAt!),
      if (issue != null)
        'issue': {
          'reportedBy': issue!.reportedBy,
          'reason': issue!.reason,
          'note': issue!.note,
          'reportedAt': _iso(issue!.reportedAt),
        },
    };
  }

  static BorrowRequest fromMap(String id, Map<String, dynamic> map) {
    final period = map['period'] as Map<String, dynamic>? ?? const {};
    final slot = map['slot'] as Map<String, dynamic>?;
    final issue = map['issue'] as Map<String, dynamic>?;
    DateTime? opt(String key) =>
        map[key] == null ? null : DateTime.tryParse(map[key] as String);
    return BorrowRequest(
      id: id,
      itemId: map['listingId'] as String? ?? '',
      borrowerId: map['borrowerId'] as String? ?? '',
      period: BorrowPeriod(
        start: _parseDate(period['start']),
        end: _parseDate(period['end']),
      ),
      note: map['note'] as String? ?? '',
      status: map['status'] as String? ?? 'pending',
      offerAmount: (map['offerAmount'] as num?)?.toInt(),
      slot: slot == null
          ? null
          : ArenaSlot(
              date: slot['date'] as String? ?? '',
              startTime: slot['startTime'] as String? ?? '',
              endTime: slot['endTime'] as String? ?? '',
            ),
      createdAt: _parseDate(map['createdAt']),
      respondedAt: opt('respondedAt'),
      dueAt: opt('dueAt'),
      returnedAt: opt('returnedAt'),
      issue: issue == null
          ? null
          : IssueReport(
              reportedBy: issue['reportedBy'] as String? ?? '',
              reason: issue['reason'] as String? ?? '',
              note: issue['note'] as String? ?? '',
              reportedAt: _parseDate(issue['reportedAt']),
            ),
    );
  }

  /// The listing owner's id as stored on the document (rules parity).
  static String ownerIdOf(Map<String, dynamic> map) =>
      map['ownerId'] as String? ?? '';
}

extension MessageFirestoreMap on Message {
  Map<String, dynamic> toFirestoreMap() {
    return <String, dynamic>{
      'requestId': requestId,
      'senderId': senderId,
      'body': body,
      'createdAt': _iso(createdAt),
    };
  }

  static Message fromMap(String id, Map<String, dynamic> map) {
    return Message(
      id: id,
      requestId: map['requestId'] as String?,
      senderId: map['senderId'] as String? ?? '',
      body: map['body'] as String? ?? '',
      createdAt: _parseDate(map['createdAt']),
    );
  }
}

extension ReviewFirestoreMap on Review {
  /// The rules require the deterministic id `${requestId}_$reviewerId`
  /// (one review per party per deal, enforced by create-only-if-absent).
  static String docId(String requestId, String reviewerId) =>
      '${requestId}_$reviewerId';

  Map<String, dynamic> toFirestoreMap() {
    return <String, dynamic>{
      'requestId': requestId,
      'listingId': itemId,
      'reviewerId': reviewerId,
      'revieweeId': revieweeId,
      'reviewerRole': reviewerRole,
      'rating': rating,
      'comment': comment,
      'createdAt': _iso(createdAt),
    };
  }

  static Review fromMap(String id, Map<String, dynamic> map) {
    return Review(
      id: id,
      requestId: map['requestId'] as String? ?? '',
      itemId: map['listingId'] as String? ?? '',
      reviewerId: map['reviewerId'] as String? ?? '',
      revieweeId: map['revieweeId'] as String? ?? '',
      reviewerRole: map['reviewerRole'] as String? ?? 'borrower',
      rating: (map['rating'] as num?)?.toInt() ?? 0,
      comment: map['comment'] as String? ?? '',
      createdAt: _parseDate(map['createdAt']),
    );
  }
}

/// A document from the shared `notifications` collection (written by
/// either client for the other party; Flutter's own feed stays derived
/// from request state, and these merge in for the event types the
/// derivation doesn't produce: message-received, review-received,
/// admin-warning).
class NotificationDoc {
  final String id;
  final String userId;
  final String type;
  final String title;
  final String body;
  final String? requestId;
  final String? listingId;
  final bool read;
  final DateTime createdAt;
  const NotificationDoc({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.body,
    this.requestId,
    this.listingId,
    this.read = false,
    required this.createdAt,
  });

  static NotificationDoc fromMap(String id, Map<String, dynamic> map) {
    return NotificationDoc(
      id: id,
      userId: map['userId'] as String? ?? '',
      type: map['type'] as String? ?? '',
      title: map['title'] as String? ?? '',
      body: map['body'] as String? ?? '',
      requestId: map['requestId'] as String?,
      listingId: map['listingId'] as String?,
      read: map['read'] as bool? ?? false,
      createdAt: _parseDate(map['createdAt']),
    );
  }

  Map<String, dynamic> toFirestoreMap() {
    return <String, dynamic>{
      'userId': userId,
      'type': type,
      'title': title,
      'body': body,
      if (requestId != null) 'requestId': requestId,
      if (listingId != null) 'listingId': listingId,
      'read': read,
      'createdAt': _iso(createdAt),
    };
  }
}

extension UserStatsFirestoreMap on UserStats {
  Map<String, dynamic> toFirestoreMap() {
    return <String, dynamic>{
      'successfulLends': successfulLends,
      'successfulBorrows': successfulBorrows,
      'salesCompleted': salesCompleted,
      'rentalsHosted': rentalsHosted,
      'onTimeReturns': onTimeReturns,
      'lateReturns': lateReturns,
    };
  }
}
