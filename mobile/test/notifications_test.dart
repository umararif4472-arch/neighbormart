import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('derived notifications', () {
    test('includes pending-incoming entries for Maya\u2019s seed state', () {
      final s = AppState();
      final feed = s.derivedNotifications;
      final pending = feed.where((n) => n.type == 'request-received').toList();
      expect(pending.length, greaterThanOrEqualTo(2));
      expect(
        pending.map((n) => n.requestId),
        containsAll(['req-in-pasta-diego', 'req-in-pasta-nina']),
      );
      expect(pending.every((n) => n.kind == 'action'), isTrue);
    });

    test('includes the overdue drill entry', () {
      final s = AppState();
      final overdue = s.derivedNotifications
          .where((n) => n.type == 'overdue')
          .toList();
      expect(overdue, isNotEmpty);
      expect(overdue.first.requestId, 'req-overdue-drill');
      expect(overdue.first.itemId, 'i-drill');
    });

    test('includes a review prompt for the returned washer', () {
      final s = AppState();
      final prompts = s.derivedNotifications
          .where((n) => n.type == 'review-requested')
          .toList();
      expect(prompts.map((n) => n.requestId), contains('req-done-washer'));
    });

    test('includes a return reminder for the karaoke due tomorrow', () {
      final s = AppState();
      final reminders = s.derivedNotifications
          .where((n) => n.type == 'return-reminder')
          .toList();
      expect(reminders.map((n) => n.requestId), contains('req-active-karaoke'));
    });

    test('acting on a request clears its notification', () {
      final s = AppState();
      s.approveRequest('req-in-pasta-diego');
      final stillThere = s.derivedNotifications.any(
        (n) =>
            n.requestId == 'req-in-pasta-diego' && n.type == 'request-received',
      );
      expect(stillThere, isFalse);
    });

    test('badge count counts action items only', () {
      final s = AppState();
      final actions = s.derivedNotifications
          .where((n) => n.kind == 'action')
          .length;
      expect(s.notificationBadgeCount, actions);
      expect(actions, greaterThan(0));
    });
  });
}
