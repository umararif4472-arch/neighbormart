import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:neighbor_mart/core/firebase/firebase_init.dart';
import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/core/widgets/shared_widgets.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/features/auth/login_screen.dart';

/// Tests for the login screen: rendering, the sign-in paths it
/// exposes (mock email login + the Google path's not-configured
/// surface — the real Google call needs a device and a live
/// Firebase project, so it is not exercised here), the
/// reduced-motion variant, and demo UI staying out of live builds.
///
/// Golden tests double as the design screenshots: the app's real
/// fonts (Roboto + MaterialIcons, from the Flutter SDK cache) are
/// loaded in [setUpAll] so text and icons render as real glyphs
/// instead of the test font's placeholder blocks.
/// Golden tests need the app's real fonts; CI passes SKIP_GOLDENS
/// (its SDK cache carries no font files), so the goldens are skipped
/// there and verified locally, where they're made.

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    // The app's real fonts, from the Flutter SDK cache: Roboto (the
    // Android default the app ships with) and MaterialIcons — so the
    // golden screenshots show real glyphs and real icons instead of
    // the test font's placeholder blocks. Bytes are read here, in
    // real async; reading files inside a testWidgets body hangs
    // under the fake-async zone.
    final fontsDir =
        '${Platform.environment['HOME']}/flutter/bin/cache/artifacts/material_fonts';
    Future<bool> loadFamily(String family, List<String> files) async {
      final loader = FontLoader(family);
      for (final name in files) {
        final file = File('$fontsDir/$name');
        if (!file.existsSync()) return false;
        final bytes = await file.readAsBytes();
        loader.addFont(Future.value(ByteData.view(bytes.buffer)));
      }
      await loader.load();
      return true;
    }

    if (!const bool.fromEnvironment('SKIP_GOLDENS')) {
      await loadFamily('Roboto', [
        'Roboto-Regular.ttf',
        'Roboto-Medium.ttf',
        'Roboto-Bold.ttf',
      ]);
      await loadFamily('MaterialIcons', ['MaterialIcons-Regular.otf']);
    }
  });

  ThemeData withRealFont(ThemeData base) =>
      base.copyWith(textTheme: base.textTheme.apply(fontFamily: 'Roboto'));

  Widget harness(
    AppState state, {
    ThemeData? theme,
    bool reduceMotion = false,
    bool realFont = false,
  }) {
    final base = theme ?? buildAppTheme();
    return ChangeNotifierProvider<AppState>.value(
      value: state,
      child: MaterialApp(
        theme: realFont ? withRealFont(base) : base,
        builder: reduceMotion
            ? (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(disableAnimations: true),
                child: child!,
              )
            : null,
        home: const LoginScreen(),
      ),
    );
  }

  AppState signedOut() => AppState()..signOut();

  /// Run the 900ms staggered entrance out so elements sit at
  /// their settled positions/opacities.
  Future<void> settleEntrance(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1000));
  }

  group('rendering', () {
    testWidgets('brand, Google path, divider and email form all render', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(harness(signedOut()));
      await settleEntrance(tester);

      expect(find.text('NeighborMart'), findsOneWidget);
      // The tagline is one Text.rich with the exact brand copy.
      expect(
        find.text('Everything behind the door'),
        findsOneWidget,
      );
      expect(find.byType(GoogleGLogo), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      // The Google button honours the 52px minimum height.
      final googleButton = tester.getSize(find.byType(ElevatedButton).first);
      expect(googleButton.height, greaterThanOrEqualTo(52));
      expect(find.text('or'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(find.text('Welcome back'), findsOneWidget);
      expect(
        find.text('Log in to borrow, rent, buy and sell on your block.'),
        findsOneWidget,
      );
      expect(find.text('Log in'), findsOneWidget);
      expect(find.text('Forgot password?'), findsOneWidget);
      expect(find.text('Create an account'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('no overflow at 360px wide with enlarged text', (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: signedOut(),
          child: MaterialApp(
            theme: buildAppTheme(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: const TextScaler.linear(1.3)),
              child: child!,
            ),
            home: const LoginScreen(),
          ),
        ),
      );
      await settleEntrance(tester);
      expect(tester.takeException(), isNull);
    });

    testWidgets('no overflow in landscape on a small phone', (tester) async {
      tester.view.physicalSize = const Size(740, 360);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(harness(signedOut()));
      await settleEntrance(tester);
      expect(find.text('NeighborMart'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('email sign-in path', () {
    Future<void> pumpTall(WidgetTester tester, AppState state) async {
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(harness(state));
      await settleEntrance(tester);
    }

    testWidgets('empty submit shows the field validators', (tester) async {
      await pumpTall(tester, signedOut());
      await tester.tap(find.text('Log in'));
      await tester.pump();
      expect(find.text('Enter your email.'), findsOneWidget);
      expect(find.text('Enter your password.'), findsOneWidget);
    });

    testWidgets('malformed email is rejected by the validator', (tester) async {
      await pumpTall(tester, signedOut());
      await tester.enterText(find.byType(TextFormField).at(0), 'not-an-email');
      await tester.enterText(find.byType(TextFormField).at(1), 'whatever1');
      await tester.tap(find.text('Log in'));
      await tester.pump();
      expect(
        find.text('That does not look like an email address.'),
        findsOneWidget,
      );
    });

    testWidgets('wrong password surfaces the friendly error inline', (
      tester,
    ) async {
      final state = signedOut();
      await pumpTall(tester, state);
      await tester.enterText(
        find.byType(TextFormField).at(0),
        'maya.chen@example.com',
      );
      await tester.enterText(find.byType(TextFormField).at(1), 'wrong-pass');
      await tester.tap(find.text('Log in'));
      await tester.pump();
      expect(find.text('Wrong email or password.'), findsOneWidget);
      expect(state.isLoggedIn, isFalse);
    });

    testWidgets('correct credentials sign in through AppState', (tester) async {
      final state = signedOut();
      await pumpTall(tester, state);
      await tester.enterText(
        find.byType(TextFormField).at(0),
        'maya.chen@example.com',
      );
      await tester.enterText(find.byType(TextFormField).at(1), 'borrow123');
      await tester.tap(find.text('Log in'));
      await tester.pump();
      expect(state.isLoggedIn, isTrue);
      expect(state.currentUser.email, 'maya.chen@example.com');
    });

    testWidgets('demo card fills and logs in as Maya (mock builds)', (
      tester,
    ) async {
      final state = signedOut();
      await pumpTall(tester, state);
      expect(find.text('Demo account'), findsOneWidget);
      await tester.tap(find.text('Fill & log in as Maya'));
      await tester.pump();
      expect(state.isLoggedIn, isTrue);
      expect(state.currentUser.email, 'maya.chen@example.com');
    });
  });

  group('Google sign-in path', () {
    testWidgets('tap surfaces the not-configured message in mock builds', (
      tester,
    ) async {
      // In the test environment Firebase is not initialised, so
      // firebaseReady is false and the preserved behaviour is the
      // friendly config message — the real Google call itself needs
      // a device and is not exercised here.
      expect(firebaseReady, isFalse);
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(harness(signedOut()));
      await settleEntrance(tester);
      await tester.tap(find.text('Continue with Google'));
      await tester.pump();
      expect(
        find.textContaining('Google sign-in needs this build'),
        findsOneWidget,
      );
      // Busy state cleared afterwards — the button label is back.
      expect(find.text('Continue with Google'), findsOneWidget);
    });
  });

  group('live builds', () {
    testWidgets('demo card and neighbor shortcuts never render', (
      tester,
    ) async {
      final state = signedOut(); // built while firebaseReady is false
      firebaseReady = true;
      addTearDown(() => firebaseReady = false);
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(harness(state));
      await settleEntrance(tester);
      expect(find.text('Demo account'), findsNothing);
      expect(find.text('Or continue as a neighbor'), findsNothing);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('reduced motion', () {
    testWidgets('renders fully at the first frame, statically', (tester) async {
      await tester.pumpWidget(harness(signedOut(), reduceMotion: true));
      await tester.pump();
      expect(find.text('NeighborMart'), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      // Time passing changes nothing and throws nothing.
      await tester.pump(const Duration(seconds: 3));
      expect(find.text('NeighborMart'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('goldens', () {
    Future<void> pumpShot(
      WidgetTester tester, {
      required ThemeData theme,
    }) async {
      tester.view.physicalSize = const Size(780, 1688);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        harness(signedOut(), theme: theme, realFont: true),
      );
      // Pump past the whole 900ms entrance: goldens capture the
      // settled state (the backdrop drift is deterministic under
      // fake async, so its phase is stable at this timestamp).
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1000));
      expect(tester.takeException(), isNull);
    }

    testWidgets(
      'login — light, settled',
      skip: const bool.fromEnvironment('SKIP_GOLDENS'),
      (tester) async {
        await pumpShot(tester, theme: buildAppTheme());
        await expectLater(
          find.byType(LoginScreen),
          matchesGoldenFile('goldens/login_light.png'),
        );
      },
    );

    testWidgets(
      'login — dark, settled',
      skip: const bool.fromEnvironment('SKIP_GOLDENS'),
      (tester) async {
        await pumpShot(tester, theme: buildDarkAppTheme());
        await expectLater(
          find.byType(LoginScreen),
          matchesGoldenFile('goldens/login_dark.png'),
        );
      },
    );
  });
}
