import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('AppState filtering', () {
    test('filters by query', () {
      final s = AppState();
      final results = s.filteredItems(query: 'drill');
      expect(results.any((i) => i.id == 'i-drill'), isTrue);
      expect(
        results.every(
          (i) => '${i.title} ${i.description}'.toLowerCase().contains('drill'),
        ),
        isTrue,
      );
    });
    test('filters by category', () {
      final s = AppState();
      final results = s.filteredItems(category: 'Kitchen');
      expect(results, isNotEmpty);
      expect(results.every((i) => i.category == 'Kitchen'), isTrue);
    });
    test('onlyAvailable excludes borrowed/unavailable', () {
      final s = AppState();
      final results = s.filteredItems(onlyAvailable: true);
      expect(results.every((i) => i.isAvailable), isTrue);
    });
    test('seed has required requests', () {
      final s = AppState();
      expect(
        s.incomingRequests.where((r) => r.status == 'pending').length,
        greaterThanOrEqualTo(2),
      );
      expect(
        s.outgoingRequests.where((r) => r.status == 'pending').length,
        greaterThanOrEqualTo(1),
      );
      expect(s.requests.any((r) => r.isOverdue), isTrue);
    });
  });
  group('request lifecycle', () {
    test(
      'approve -> pickup -> return on-time updates status and borrower stats',
      () {
        final s = AppState();
        const reqId = 'req-in-pasta-diego';
        final borrowerBefore = s.userById('u-diego').stats;
        s.approveRequest(reqId);
        expect(s.requests.firstWhere((r) => r.id == reqId).status, 'approved');
        s.markPickedUp(reqId);
        expect(s.requests.firstWhere((r) => r.id == reqId).status, 'active');
        s.markReturned(reqId, onTime: true);
        expect(s.requests.firstWhere((r) => r.id == reqId).status, 'returned');
        final borrowerAfter = s.userById('u-diego').stats;
        expect(borrowerAfter.onTimeReturns, borrowerBefore.onTimeReturns + 1);
        expect(borrowerAfter.lateReturns, borrowerBefore.lateReturns);
      },
    );
    test('late return increments lateReturns', () {
      final s = AppState();
      const reqId = 'req-overdue-drill';
      final before = s.userById('u-priya').stats.lateReturns;
      s.markReturned(reqId, onTime: false);
      expect(s.userById('u-priya').stats.lateReturns, before + 1);
    });
    test('declined is terminal — approve after decline does nothing', () {
      final s = AppState();
      const reqId = 'req-in-pasta-nina';
      s.declineRequest(reqId);
      expect(s.requests.firstWhere((r) => r.id == reqId).status, 'declined');
      s.approveRequest(reqId);
      expect(s.requests.firstWhere((r) => r.id == reqId).status, 'declined');
    });
  });
  group('createItem and wishlist', () {
    test('createItem appears in filtered results', () {
      final s = AppState();
      s.createItem(
        title: 'Test Hedge Trimmer XYZ',
        category: 'Tools',
        description: 'A sturdy hedge trimmer for testing.',
        condition: 'Good',
        maxDurationDays: 5,
      );
      final results = s.filteredItems(query: 'Hedge Trimmer XYZ');
      expect(results.length, 1);
      expect(results.first.ownerId, 'u-maya');
    });
    test('pledge points increases progress', () {
      final s = AppState();
      final w = s.wishlist.first;
      final before = w.pointsPledged;
      s.pledgePoints(w.id, 10);
      expect(s.wishlist.first.pointsPledged, before + 10);
      expect(s.wishlist.first.progress, greaterThan(w.progress == 1 ? 0 : 0));
    });
    test('needThisToo increments requestCount', () {
      final s = AppState();
      final w = s.wishlist.first;
      s.needThisToo(w.id);
      expect(s.wishlist.first.requestCount, w.requestCount + 1);
    });
    test('createBorrowRequest validates own item', () {
      final s = AppState();
      final own = s.itemById('i-mixer');
      final err = s.createBorrowRequest(
        own,
        DateTime.now().add(const Duration(days: 1)),
        DateTime.now().add(const Duration(days: 2)),
        'hi',
      );
      expect(err, isNotNull);
    });
  });
}
