import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('auth', () {
    test('login succeeds with seed credentials', () {
      final s = AppState();
      s.signOut();
      final err = s.login('maya.chen@example.com', 'borrow123');
      expect(err, isNull);
      expect(s.isLoggedIn, isTrue);
      expect(s.currentUser.id, 'u-maya');
    });

    test('login is case-insensitive on email and trims spaces', () {
      final s = AppState();
      final err = s.login('  Joan.Whitfield@Example.COM ', 'borrow123');
      expect(err, isNull);
      expect(s.currentUser.id, 'u-joan');
    });

    test('login with wrong password fails and stays logged out', () {
      final s = AppState();
      s.signOut();
      final err = s.login('maya.chen@example.com', 'wrong-password');
      expect(err, isNotNull);
      expect(s.isLoggedIn, isFalse);
    });

    test('login with unknown email fails', () {
      final s = AppState();
      s.signOut();
      expect(s.login('nobody@example.com', 'borrow123'), isNotNull);
      expect(s.isLoggedIn, isFalse);
    });

    test('signUp creates the user and logs in as them', () {
      final s = AppState();
      final countBefore = s.users.length;
      final err = s.signUp(
        name: 'Test Neighbor',
        email: 'test.neighbor@example.com',
        password: 'secret6',
        neighborhood: 'Richmond',
      );
      expect(err, isNull);
      expect(s.users.length, countBefore + 1);
      expect(s.isLoggedIn, isTrue);
      expect(s.currentUser.name, 'Test Neighbor');
      expect(s.currentUser.email, 'test.neighbor@example.com');
      // Brand-new user: zero stats, no items, trust starts at the floor.
      expect(s.currentUser.stats.successfulBorrows, 0);
      expect(s.myItems, isEmpty);
      expect(s.trustFor(s.currentUser).tierName, 'New Neighbor');
    });

    test('signUp rejects a duplicate email', () {
      final s = AppState();
      final err = s.signUp(
        name: 'Copy Cat',
        email: 'MAYA.CHEN@example.com',
        password: 'secret6',
        neighborhood: 'Richmond',
      );
      expect(err, isNotNull);
      expect(
        s.users.where((u) => u.email == 'maya.chen@example.com').length,
        1,
      );
    });

    test('signOut flips isLoggedIn and login works again', () {
      final s = AppState();
      expect(s.isLoggedIn, isTrue);
      s.signOut();
      expect(s.isLoggedIn, isFalse);
      expect(s.login('tom.alvarez@example.com', 'borrow123'), isNull);
      expect(s.currentUser.id, 'u-tom');
    });

    test('password reset only succeeds for known emails', () {
      final s = AppState();
      expect(s.requestPasswordReset('maya.chen@example.com'), isNull);
      expect(s.requestPasswordReset('ghost@example.com'), isNotNull);
    });
  });
}
