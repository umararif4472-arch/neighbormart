class BorrowPeriod {
  final DateTime start;
  final DateTime end;
  const BorrowPeriod({required this.start, required this.end});
}

/// A booked arena slot (Phase 5): a calendar date plus local HH:mm
/// start/end on the venue's slot grid. Mirrors web ArenaSlot.
class ArenaSlot {
  final String date; // YYYY-MM-DD
  final String startTime; // HH:mm
  final String endTime; // HH:mm
  const ArenaSlot({
    required this.date,
    required this.startTime,
    required this.endTime,
  });

  bool overlaps(ArenaSlot other) =>
      date == other.date &&
      startTime.compareTo(other.endTime) < 0 &&
      other.startTime.compareTo(endTime) < 0;
}

/// Escalation record for problem borrows (port of web IssueReport).
class IssueReport {
  final String reportedBy;
  final String reason;
  final String note;
  final DateTime reportedAt;
  const IssueReport({
    required this.reportedBy,
    required this.reason,
    required this.note,
    required this.reportedAt,
  });
}

class BorrowRequest {
  final String id;

  /// The listing being requested — an Item id for the legacy items flow,
  /// or any Listing id for the Phase 5 section flows (the ids coincide
  /// for items-section listings).
  final String itemId;
  final String borrowerId;
  final BorrowPeriod period;
  final String note;
  final String status; // pending, approved, active, returned, completed, reviewed, declined, cancelled

  /// Sell listings (Phase 5): the buyer's offer in PKR. null = asking
  /// price (or not a sell request).
  final int? offerAmount;

  /// Arena listings (Phase 5): the booked slot. [period] mirrors the
  /// slot's date so date logic stays uniform.
  final ArenaSlot? slot;
  final DateTime createdAt;
  final DateTime? respondedAt;
  final DateTime? dueAt;
  final DateTime? returnedAt;
  final IssueReport? issue;
  const BorrowRequest({
    required this.id,
    required this.itemId,
    required this.borrowerId,
    required this.period,
    required this.note,
    required this.status,
    this.offerAmount,
    this.slot,
    required this.createdAt,
    this.respondedAt,
    this.dueAt,
    this.returnedAt,
    this.issue,
  });
  bool get isOverdue {
    if (status != 'active' || dueAt == null) return false;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final due = DateTime(dueAt!.year, dueAt!.month, dueAt!.day);
    return due.isBefore(today);
  }

  BorrowRequest copyWith({
    String? status,
    DateTime? respondedAt,
    DateTime? dueAt,
    DateTime? returnedAt,
    IssueReport? issue,
  }) {
    return BorrowRequest(
      id: id,
      itemId: itemId,
      borrowerId: borrowerId,
      period: period,
      note: note,
      status: status ?? this.status,
      offerAmount: offerAmount,
      slot: slot,
      createdAt: createdAt,
      respondedAt: respondedAt ?? this.respondedAt,
      dueAt: dueAt ?? this.dueAt,
      returnedAt: returnedAt ?? this.returnedAt,
      issue: issue ?? this.issue,
    );
  }
}
