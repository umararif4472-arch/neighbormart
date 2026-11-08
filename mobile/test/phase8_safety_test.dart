import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/data/models/report.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/features/profile/settings_screen.dart';

void main() {
  group('report document shape (mirrors the web reports collection)', () {
    test('toFirestoreMap writes exactly the shared fields', () {
      final report = Report(
        id: 'rep-1',
        reporterId: 'u-maya',
        targetType: ReportTargetType.listing,
        targetId: 'v-civic',
        targetOwnerId: 'u-joan',
        reason: 'scam',
        details: 'Asked for an advance payment off-platform',
        status: 'open',
        createdAt: DateTime.utc(2026, 11, 8, 12, 30),
      );
      final map = report.toFirestoreMap();
      expect(map.keys.toSet(), {
        'reportedBy',
        'kind',
        'targetId',
        'targetOwnerId',
        'reason',
        'details',
        'status',
        'createdAt',
      });
      expect(map['reportedBy'], 'u-maya');
      expect(map['kind'], 'listing');
      expect(map['targetId'], 'v-civic');
      expect(map['targetOwnerId'], 'u-joan');
      expect(map['reason'], 'scam');
      expect(map['details'], 'Asked for an advance payment off-platform');
      expect(map['status'], 'open');
      // ISO string, parseable back to the same instant.
      expect(DateTime.parse(map['createdAt'] as String), report.createdAt);
    });

    test('all six reasons belong to the shared vocabulary', () {
      expect(kReportReasons, [
        'scam',
        'fake',
        'inappropriate',
        'spam',
        'safety',
        'other',
      ]);
      for (final reason in kReportReasons) {
        expect(kReportReasonLabels[reason], isNotNull);
      }
    });

    test('submitReport records an open report from the current user', () {
      final state = AppState();
      final report = state.submitReport(
        targetType: ReportTargetType.listing,
        targetId: 'i-drill',
        targetOwnerId: 'u-joan',
        reason: 'fake',
        details: '  Photos are from a catalogue  ',
      );
      expect(report.reporterId, 'u-maya');
      expect(report.status, 'open');
      expect(report.details, 'Photos are from a catalogue');
      expect(state.reports, contains(report));
    });

    test('a user report carries the user id as targetOwnerId', () {
      final state = AppState();
      final report = state.submitReport(
        targetType: ReportTargetType.user,
        targetId: 'u-joan',
        targetOwnerId: 'u-joan',
        reason: 'spam',
      );
      expect(report.targetType, ReportTargetType.user);
      expect(report.targetOwnerId, report.targetId);
      expect(report.details, '');
      expect(report.toFirestoreMap()['kind'], 'user');
    });
  });

  group('block filtering', () {
    test('pure filters drop only the blocked owners', () {
      final state = AppState();
      final blocked = {'u-joan'};
      final listings = listingsExcludingBlocked(state.listings, blocked);
      expect(listings.any((l) => l.ownerId == 'u-joan'), isFalse);
      expect(listings.length, state.listings.length - 4);
      final items = itemsExcludingBlocked(state.items, blocked);
      expect(items.any((i) => i.ownerId == 'u-joan'), isFalse);
      expect(items.length, lessThan(state.items.length));
      // Nobody blocked → nothing dropped.
      expect(
        listingsExcludingBlocked(state.listings, const {}).length,
        state.listings.length,
      );
    });

    test('blockUser hides the owner from Explore data until unblocked', () {
      final state = AppState();
      expect(state.filteredItems().any((i) => i.ownerId == 'u-joan'), isTrue);
      expect(
        listingsExcludingBlocked(
          state.listings,
          state.blockedUserIdSet,
        ).any((l) => l.ownerId == 'u-joan'),
        isTrue,
      );

      state.blockUser('u-joan');
      expect(state.isBlocked('u-joan'), isTrue);
      expect(state.blockedUsers.map((u) => u.id), ['u-joan']);
      expect(state.filteredItems().any((i) => i.ownerId == 'u-joan'), isFalse);
      expect(
        listingsExcludingBlocked(
          state.listings,
          state.blockedUserIdSet,
        ).any((l) => l.ownerId == 'u-joan'),
        isFalse,
      );

      state.unblockUser('u-joan');
      expect(state.isBlocked('u-joan'), isFalse);
      expect(state.filteredItems().any((i) => i.ownerId == 'u-joan'), isTrue);
    });

    test('blocking yourself is a no-op', () {
      final state = AppState();
      state.blockUser('u-maya');
      expect(state.isBlocked('u-maya'), isFalse);
      expect(state.currentUser.blockedUserIds, isEmpty);
    });
  });

  group('blocked persistence', () {
    test('the block list survives a relaunch via SharedPreferences', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final state = AppState();
      await state.restoreFromPrefs(prefs);
      state.blockUser('u-joan');
      state.blockUser('u-tom');
      // Let the unawaited prefs write land.
      await Future<void>.delayed(Duration.zero);

      final relaunched = AppState();
      await relaunched.restoreFromPrefs(prefs);
      expect(relaunched.currentUser.id, 'u-maya');
      expect(relaunched.currentUser.blockedUserIds, ['u-joan', 'u-tom']);
      expect(relaunched.isBlocked('u-joan'), isTrue);

      relaunched.unblockUser('u-joan');
      await Future<void>.delayed(Duration.zero);
      final third = AppState();
      await third.restoreFromPrefs(prefs);
      expect(third.currentUser.blockedUserIds, ['u-tom']);
    });

    test(
      'blocking merges into the profile-setup payload, not over it',
      () async {
        SharedPreferences.setMockInitialValues({});
        final prefs = await SharedPreferences.getInstance();
        final state = AppState();
        await state.restoreFromPrefs(prefs);
        await state.completeOnboarding(
          name: 'Maya Chen',
          phone: '03001234567',
          city: 'Lahore',
          neighborhood: 'Gulberg',
          interests: const ['Tools'],
        );
        state.blockUser('u-joan');
        await Future<void>.delayed(Duration.zero);

        final relaunched = AppState();
        await relaunched.restoreFromPrefs(prefs);
        // Setup fields AND the block list both survived the round-trip.
        expect(relaunched.currentUser.phone, '03001234567');
        expect(relaunched.currentUser.interests, ['Tools']);
        expect(relaunched.currentUser.blockedUserIds, ['u-joan']);
      },
    );
  });

  group('delete my account (local purge)', () {
    test('listings, items and profile are removed; session ends', () async {
      final state = AppState();
      expect(state.myListings, isNotEmpty);
      expect(state.myItems, isNotEmpty);
      expect(state.userByIdOrNull('u-maya'), isNotNull);

      final result = await state.deleteMyAccount();

      expect(result.deleted, isTrue);
      // Local mode has no remote step, so there is nothing to explain.
      expect(result.message, isNull);
      expect(state.userByIdOrNull('u-maya'), isNull);
      expect(state.listings.any((l) => l.ownerId == 'u-maya'), isFalse);
      expect(state.items.any((i) => i.ownerId == 'u-maya'), isFalse);
      expect(state.isLoggedIn, isFalse);
      // Everyone else is untouched.
      expect(state.userByIdOrNull('u-joan'), isNotNull);
      expect(state.listings.any((l) => l.ownerId == 'u-joan'), isTrue);
    });
  });

  group('Settings safety UI', () {
    Widget harness(AppState state) => MaterialApp(
      theme: buildAppTheme(),
      home: ChangeNotifierProvider<AppState>.value(
        value: state,
        child: const SettingsScreen(),
      ),
    );

    testWidgets('blocked users are listed and can be unblocked', (
      tester,
    ) async {
      final state = AppState();
      state.blockUser('u-joan');
      await tester.pumpWidget(harness(state));
      await tester.scrollUntilVisible(find.text('Unblock'), 200);
      expect(find.text('Blocked users'), findsOneWidget);
      expect(find.text('Unblock'), findsOneWidget);

      await tester.tap(find.text('Unblock'));
      await tester.pump();
      expect(state.isBlocked('u-joan'), isFalse);
      expect(find.text('You haven’t blocked anyone.'), findsOneWidget);
    });

    testWidgets('delete requires typing DELETE, then purges the account', (
      tester,
    ) async {
      final state = AppState();
      await tester.pumpWidget(harness(state));
      await tester.scrollUntilVisible(find.text('Delete my account'), 200);
      await tester.tap(find.text('Delete my account'));
      await tester.pumpAndSettle();

      final dialog = find.byType(AlertDialog);
      expect(dialog, findsOneWidget);
      final deleteButton = find.descendant(
        of: dialog,
        matching: find.widgetWithText(ElevatedButton, 'Delete'),
      );
      // Disabled until the confirmation text is typed exactly.
      expect(tester.widget<ElevatedButton>(deleteButton).onPressed, isNull);
      await tester.enterText(
        find.descendant(of: dialog, matching: find.byType(TextField)),
        'DELETE',
      );
      await tester.pump();
      expect(tester.widget<ElevatedButton>(deleteButton).onPressed, isNotNull);

      await tester.tap(deleteButton);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(state.userByIdOrNull('u-maya'), isNull);
      expect(state.isLoggedIn, isFalse);
      // Flush the confirmation snackbar's timer before the test ends.
      await tester.pump(const Duration(seconds: 5));
    });
  });
}
