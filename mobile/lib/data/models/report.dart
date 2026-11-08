/// Content reports (Phase 8) — mirrors the web's `reports` Firestore
/// collection exactly, so both clients write identical documents:
/// { reportedBy, kind, targetId, targetOwnerId, reason, details,
///   status: 'open', createdAt (ISO string) }.
/// The Firestore field names (`reportedBy`, `kind`) are the ones the
/// security rules enforce and the web moderation queue reads; the Dart
/// field names stay local to this model.
///
/// [targetOwnerId] is the listing owner's id for a listing report and
/// the reported user's own id for a user report — it lets moderation
/// group every report about one neighbor without extra lookups.
enum ReportTargetType { listing, user }

/// The fixed reason vocabulary, shared with the web client. Anything
/// outside this list is invalid — the UI only offers these.
const List<String> kReportReasons = [
  'scam',
  'fake',
  'inappropriate',
  'spam',
  'safety',
  'other',
];

/// Human labels for [kReportReasons], shown in the report dialog.
const Map<String, String> kReportReasonLabels = {
  'scam': 'Scam or fraud',
  'fake': 'Fake or misleading',
  'inappropriate': 'Inappropriate content',
  'spam': 'Spam',
  'safety': 'Safety concern',
  'other': 'Something else',
};

class Report {
  final String id;
  final String reporterId;
  final ReportTargetType targetType;
  final String targetId;
  final String targetOwnerId;

  /// One of [kReportReasons].
  final String reason;

  /// Optional free-text detail from the reporter (may be empty).
  final String details;

  /// Moderation state — always 'open' when filed.
  final String status;
  final DateTime createdAt;

  const Report({
    required this.id,
    required this.reporterId,
    required this.targetType,
    required this.targetId,
    required this.targetOwnerId,
    required this.reason,
    this.details = '',
    this.status = 'open',
    required this.createdAt,
  });

  /// The exact Firestore document shape the web client writes.
  Map<String, Object> toFirestoreMap() => {
    'reportedBy': reporterId,
    'kind': targetType.name,
    'targetId': targetId,
    'targetOwnerId': targetOwnerId,
    'reason': reason,
    'details': details,
    'status': status,
    'createdAt': createdAt.toIso8601String(),
  };
}
