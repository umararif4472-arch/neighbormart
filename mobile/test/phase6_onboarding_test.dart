import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/core/utils/profile_setup_validation.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/features/auth/login_screen.dart';
import 'package:neighbor_mart/ui/features/onboarding/profile_setup_screen.dart';

/// Phase 6 (Flutter mirror): profile-setup gating, completion,
/// validation, persistence, and the setup screen walk-through.
void main() {
  group('needs-onboarding decision', () {
    test('seed users never need onboarding', () {
      final s = AppState();
      expect(s.users, isNotEmpty);
      expect(s.users.every((u) => u.onboardingCompleted), isTrue);
      expect(s.users.every((u) => !u.needsOnboarding), isTrue);
      expect(s.currentUserNeedsOnboarding, isFalse);
    });

    test('a brand-new sign-up needs onboarding', () {
      final s = AppState();
      final err = s.signUp(
        name: 'Fresh Neighbor',
        email: 'fresh.neighbor@example.com',
        password: 'borrow123',
        neighborhood: 'Gulberg',
      );
      expect(err, isNull);
      expect(s.currentUser.onboardingCompleted, isFalse);
      expect(s.currentUserNeedsOnboarding, isTrue);
    });

    test('signing out clears the gate', () {
      final s = AppState();
      s.signUp(
        name: 'Fresh Neighbor',
        email: 'fresh.neighbor@example.com',
        password: 'borrow123',
        neighborhood: 'Gulberg',
      );
      expect(s.currentUserNeedsOnboarding, isTrue);
      s.signOut();
      expect(s.currentUserNeedsOnboarding, isFalse);
    });
  });

  group('completeOnboarding', () {
    AppState signedUpState() {
      final s = AppState();
      s.signUp(
        name: 'Fresh Neighbor',
        email: 'fresh.neighbor@example.com',
        password: 'borrow123',
        neighborhood: 'Gulberg',
      );
      return s;
    }

    test('saves name, phone, city, area, interests and the flag', () async {
      final s = signedUpState();
      final err = await s.completeOnboarding(
        name: 'Ayesha Khan',
        phone: '0300 1112233',
        city: 'Lahore',
        neighborhood: 'Johar Town',
        interests: const ['Vehicles', 'Tools'],
      );
      expect(err, isNull);
      final me = s.currentUser;
      expect(me.name, 'Ayesha Khan');
      expect(me.phone, '0300 1112233');
      expect(me.city, 'Lahore');
      expect(me.neighborhood, 'Johar Town');
      expect(me.interests, ['Vehicles', 'Tools']);
      expect(me.onboardingCompleted, isTrue);
      expect(s.currentUserNeedsOnboarding, isFalse);
    });

    test('phone is optional', () async {
      final s = signedUpState();
      final err = await s.completeOnboarding(
        name: 'Ayesha Khan',
        phone: '',
        city: 'Lahore',
        neighborhood: 'Johar Town',
        interests: const ['Tools'],
      );
      expect(err, isNull);
      expect(s.currentUser.phone, '');
    });

    test('rejects a one-letter name and changes nothing', () async {
      final s = signedUpState();
      final err = await s.completeOnboarding(
        name: 'A',
        phone: '',
        city: 'Lahore',
        neighborhood: 'Johar Town',
        interests: const ['Tools'],
      );
      expect(err, isNotNull);
      expect(s.currentUser.onboardingCompleted, isFalse);
    });

    test('rejects a too-short phone when one is entered', () async {
      final s = signedUpState();
      final err = await s.completeOnboarding(
        name: 'Ayesha Khan',
        phone: '123',
        city: 'Lahore',
        neighborhood: 'Johar Town',
        interests: const ['Tools'],
      );
      expect(err, isNotNull);
      expect(s.currentUserNeedsOnboarding, isTrue);
    });

    test('rejects an empty area', () async {
      final s = signedUpState();
      final err = await s.completeOnboarding(
        name: 'Ayesha Khan',
        phone: '',
        city: 'Lahore',
        neighborhood: '   ',
        interests: const ['Tools'],
      );
      expect(err, isNotNull);
      expect(s.currentUserNeedsOnboarding, isTrue);
    });

    test('rejects zero interests', () async {
      final s = signedUpState();
      final err = await s.completeOnboarding(
        name: 'Ayesha Khan',
        phone: '',
        city: 'Lahore',
        neighborhood: 'Johar Town',
        interests: const [],
      );
      expect(err, isNotNull);
      expect(s.currentUserNeedsOnboarding, isTrue);
    });

    test('survives a restart via SharedPreferences', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final s = AppState();
      await s.restoreFromPrefs(prefs);
      s.loginAs(s.userById('u-maya'));
      final err = await s.completeOnboarding(
        name: 'Maya Chen',
        phone: '0300 9998877',
        city: 'Lahore',
        neighborhood: 'Cantt',
        interests: const ['Sports Arenas', 'Electronics'],
      );
      expect(err, isNull);

      final restarted = AppState();
      await restarted.restoreFromPrefs(prefs);
      final maya = restarted.userById('u-maya');
      expect(maya.phone, '0300 9998877');
      expect(maya.neighborhood, 'Cantt');
      expect(maya.interests, ['Sports Arenas', 'Electronics']);
      expect(maya.onboardingCompleted, isTrue);
    });
  });

  group('validators', () {
    test('name needs at least 2 characters', () {
      expect(validateSetupName(''), isNotNull);
      expect(validateSetupName(' A '), isNotNull);
      expect(validateSetupName('Al'), isNull);
    });

    test('phone optional but needs 7 digits when present', () {
      expect(validateSetupPhone(''), isNull);
      expect(validateSetupPhone('  '), isNull);
      expect(validateSetupPhone('123456'), isNotNull);
      expect(validateSetupPhone('0300 1234567'), isNull);
      expect(validateSetupPhone('+92 300 1234567'), isNull);
    });

    test('area and interests are required', () {
      expect(validateSetupArea(''), isNotNull);
      expect(validateSetupArea('Gulberg'), isNull);
      expect(validateSetupInterests(const []), isNotNull);
      expect(validateSetupInterests(const ['Tools']), isNull);
    });

    test('interest options cover the four sections', () {
      expect(
        kInterestOptions,
        containsAll([
          'Items & Tools',
          'Vehicles',
          'Properties',
          'Sports Arenas',
        ]),
      );
    });
  });

  group('ProfileSetupScreen', () {
    Widget harness(AppState state, {bool editMode = false}) {
      return ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          theme: buildAppTheme(),
          home: ProfileSetupScreen(editMode: editMode),
        ),
      );
    }

    testWidgets('walk-through enforces each step then saves', (tester) async {
      final s = AppState();
      s.signUp(
        name: 'New Person',
        email: 'new.person@example.com',
        password: 'borrow123',
        neighborhood: 'Gulberg',
      );
      await tester.pumpWidget(harness(s));
      await tester.pumpAndSettle();
      expect(find.text('Step 1 of 3'), findsOneWidget);

      // Step 1: a one-letter name is rejected in place.
      await tester.enterText(find.byType(TextField).at(0), 'A');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Step 1 of 3'), findsOneWidget);
      expect(find.textContaining('at least 2 characters'), findsOneWidget);

      // A too-short phone is rejected too.
      await tester.enterText(find.byType(TextField).at(0), 'New Person');
      await tester.enterText(find.byType(TextField).at(1), '123');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Step 1 of 3'), findsOneWidget);
      expect(find.textContaining('too short'), findsOneWidget);

      await tester.enterText(find.byType(TextField).at(1), '0300 1234567');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Step 2 of 3'), findsOneWidget);

      // Step 2: clearing the prefilled area blocks progress.
      await tester.enterText(find.byType(TextField).at(1), '');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Step 2 of 3'), findsOneWidget);
      expect(find.textContaining('Enter your area'), findsOneWidget);

      await tester.enterText(find.byType(TextField).at(1), 'Johar Town');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Step 3 of 3'), findsOneWidget);

      // Step 3: finishing with no interest picked is rejected.
      await tester.tap(find.text('Finish'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Pick at least one interest'), findsOneWidget);
      expect(s.currentUser.onboardingCompleted, isFalse);

      await tester.tap(find.text('Vehicles'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Finish'));
      await tester.pumpAndSettle();
      expect(s.currentUser.onboardingCompleted, isTrue);
      expect(s.currentUser.name, 'New Person');
      expect(s.currentUser.phone, '0300 1234567');
      expect(s.currentUser.city, 'Lahore');
      expect(s.currentUser.neighborhood, 'Johar Town');
      expect(s.currentUser.interests, contains('Vehicles'));
    });

    testWidgets('edit mode opens prefilled with a Back button', (tester) async {
      final s = AppState(); // signed in as Maya, setup already done
      await tester.pumpWidget(harness(s, editMode: true));
      await tester.pumpAndSettle();
      expect(find.text('Set up profile'), findsOneWidget);
      expect(find.text('Back'), findsOneWidget);
      final nameField = tester.widget<TextField>(find.byType(TextField).at(0));
      expect(nameField.controller?.text, 'Maya Chen');
    });
  });

  group('LoginScreen header', () {
    testWidgets('brand header and tagline render, form still works', (
      tester,
    ) async {
      final s = AppState();
      s.signOut();
      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: s,
          child: MaterialApp(theme: buildAppTheme(), home: const LoginScreen()),
        ),
      );
      // No pumpAndSettle: the float animation loops forever by design.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 700));
      expect(find.text('NeighborMart'), findsOneWidget);
      expect(
        find.text('Borrow, rent, buy and sell, right on your block'),
        findsOneWidget,
      );
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('header renders statically with reduced motion', (
      tester,
    ) async {
      final s = AppState();
      s.signOut();
      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: s,
          child: MaterialApp(
            theme: buildAppTheme(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: true),
              child: child!,
            ),
            home: const LoginScreen(),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('NeighborMart'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
