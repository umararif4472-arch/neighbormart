import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('manage my items', () {
    test('updateItem changes the title and terms', () {
      final s = AppState();
      final updated = s.updateItem(
        'i-mixer',
        title: 'Renamed Stand Mixer Pro',
        category: 'Kitchen',
        description: 'For the sourdough era of your life.',
        condition: 'Excellent — like new.',
        maxDurationDays: 9,
        depositAmount: 10,
        dailyFee: null,
      );
      expect(updated, isNotNull);
      expect(updated!.title, 'Renamed Stand Mixer Pro');
      expect(s.itemById('i-mixer').borrowTerms.maxDurationDays, 9);
      expect(s.itemById('i-mixer').borrowTerms.depositAmount, 10);
    });

    test('deleteItem removes an item with no active borrows', () {
      final s = AppState();
      expect(s.itemByIdOrNull('i-mixer'), isNotNull);
      final err = s.deleteItem('i-mixer');
      expect(err, isNull);
      expect(s.itemByIdOrNull('i-mixer'), isNull);
      // Its old pending/declined requests were declined, not crashed on.
      expect(
        s.requests
            .where((r) => r.itemId == 'i-mixer')
            .every((r) => r.status != 'pending'),
        isTrue,
      );
    });

    test('deleteItem is blocked while a borrow is active', () {
      final s = AppState();
      // i-drill is actively borrowed by Priya (overdue).
      final err = s.deleteItem('i-drill');
      expect(err, isNotNull);
      expect(s.itemByIdOrNull('i-drill'), isNotNull);
    });

    test('setItemAvailability toggles available/unavailable', () {
      final s = AppState();
      expect(s.itemById('i-mixer').availability, 'available');
      s.setItemAvailability('i-mixer', 'unavailable');
      expect(s.itemById('i-mixer').availability, 'unavailable');
      expect(
        s.filteredItems(onlyAvailable: true).any((i) => i.id == 'i-mixer'),
        isFalse,
      );
      s.setItemAvailability('i-mixer', 'available');
      expect(s.itemById('i-mixer').isAvailable, isTrue);
    });
  });

  group('verification', () {
    test('verifyEmail raises the verification breakdown points', () {
      final s = AppState();
      // Leo is fully unverified in the seed.
      expect(s.login('leo.park@example.com', 'borrow123'), isNull);
      final before = s.trustFor(s.currentUser).breakdown.verification;
      expect(before, 0);
      s.verifyEmail();
      final after = s.trustFor(s.currentUser).breakdown.verification;
      // Phase 2 split: email is worth 3, phone 4 (ID would add 3 more).
      expect(after, before + 3);
      s.verifyPhone();
      expect(s.trustFor(s.currentUser).breakdown.verification, 7);
    });

    test('updateProfile saves name, bio, neighborhood', () {
      final s = AppState();
      s.updateProfile(
        name: 'Maya C.',
        bio: 'New bio',
        neighborhood: 'Irvington',
      );
      expect(s.currentUser.name, 'Maya C.');
      expect(s.currentUser.bio, 'New bio');
      expect(s.currentUser.neighborhood, 'Irvington');
    });

    test('reportIssue flags the request', () {
      final s = AppState();
      s.reportIssue('req-overdue-drill', 'Not returned', 'No reply in 3 days.');
      final r = s.requests.firstWhere((x) => x.id == 'req-overdue-drill');
      expect(r.issue, isNotNull);
      expect(r.issue!.reason, 'Not returned');
      expect(r.issue!.reportedBy, 'u-maya');
    });

    test('pendingOverlaps finds the pasta-roller conflict', () {
      final s = AppState();
      final diego = s.requests.firstWhere((r) => r.id == 'req-in-pasta-diego');
      final overlaps = s.pendingOverlaps(diego);
      expect(overlaps.map((r) => r.id), contains('req-in-pasta-nina'));
    });
  });
}
