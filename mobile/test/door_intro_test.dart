import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:neighbor_mart/core/config.dart';
import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/features/auth/landing_screen.dart';
import 'package:neighbor_mart/ui/features/onboarding/door_intro.dart';

/// Tests for the Open Door intro: the real destination is
/// mounted (miniaturised, input-blocked) behind the wall's
/// doorway cutout from frame 0, the door opens into it once
/// ready, tap-to-skip and the signed-in short path work, the
/// final frame is pixel-identical to the standalone destination
/// (shared goldens), reduced motion degrades to a static fade,
/// slow loads warn, and failures offer a retry.
///
/// Golden tests need the app's real fonts; CI passes SKIP_GOLDENS
/// (its SDK cache carries no font files), so the goldens are
/// skipped there and verified locally, where they're made.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    // Roboto + MaterialIcons from the Flutter SDK cache, the
    // same pattern as login_screen_test.dart, so goldens render
    // real glyphs. Reading files inside a testWidgets body
    // hangs under the fake-async zone, hence setUpAll.
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

  Widget harness({
    required Future<void> Function() bootstrap,
    bool signedIn = false,
    required VoidCallback onComplete,
    bool reduceMotion = false,
    ThemeData? theme,
    Widget? child,
  }) {
    return MaterialApp(
      theme: theme ?? buildAppTheme(),
      builder: reduceMotion
          ? (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: true),
              child: child!,
            )
          : null,
      home: DoorIntro(
        bootstrap: bootstrap,
        signedIn: signedIn,
        onComplete: onComplete,
        child:
            child ?? const Scaffold(body: Center(child: Text('DESTINATION'))),
      ),
    );
  }

  /// Pumps in 50 ms steps until [condition] holds or [maxMs] of
  /// fake time has passed; returns the fake milliseconds pumped.
  Future<int> pumpUntil(
    WidgetTester tester,
    bool Function() condition, {
    int maxMs = 6000,
  }) async {
    var elapsed = 0;
    while (!condition() && elapsed < maxMs) {
      await tester.pump(const Duration(milliseconds: 50));
      elapsed += 50;
    }
    return elapsed;
  }

  testWidgets('destination is mounted behind the closed door at frame 0', (
    tester,
  ) async {
    final gate = Completer<void>();
    var completed = false;
    await tester.pumpWidget(
      harness(bootstrap: () => gate.future, onComplete: () => completed = true),
    );
    await tester.pump(const Duration(milliseconds: 700));
    // The destination is already in the tree…
    expect(find.text('DESTINATION'), findsOneWidget);
    expect(find.text(kAppTagline), findsOneWidget);
    expect(completed, isFalse);
    // …input-blocked by an absorbing AbsorbPointer…
    final absorbs = tester.widgetList<AbsorbPointer>(
      find.ancestor(
        of: find.text('DESTINATION'),
        matching: find.byType(AbsorbPointer),
      ),
    );
    expect(absorbs.any((a) => a.absorbing), isTrue);
    // …and miniaturised by a Transform ancestor (scale < 1).
    final transforms = tester.widgetList<Transform>(
      find.ancestor(
        of: find.text('DESTINATION'),
        matching: find.byType(Transform),
      ),
    );
    expect(
      transforms.any((t) => t.transform.storage[0] < 0.5),
      isTrue,
      reason: 'destination should be scaled down into the doorway',
    );
    expect(tester.takeException(), isNull);
    gate.complete();
    await pumpUntil(tester, () => completed);
    expect(completed, isTrue);
  });

  testWidgets('renders in dark mode without errors', (tester) async {
    final gate = Completer<void>();
    await tester.pumpWidget(
      harness(
        bootstrap: () => gate.future,
        onComplete: () {},
        theme: buildDarkAppTheme(),
      ),
    );
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.text(kAppTagline), findsOneWidget);
    expect(tester.takeException(), isNull);
    gate.complete();
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('opens into the destination once the bootstrap lands', (
    tester,
  ) async {
    var completed = false;
    await tester.pumpWidget(
      harness(bootstrap: () async {}, onComplete: () => completed = true),
    );
    // Signed-out gate is ~600 ms and the swing runs 700 ms:
    // not done at 1.1 s…
    await tester.pump(const Duration(milliseconds: 1100));
    expect(completed, isFalse);
    // …but gate + swing + zoom + settle (~2.5 s total) lands.
    final rest = await pumpUntil(tester, () => completed, maxMs: 3000);
    expect(completed, isTrue);
    expect(rest, lessThan(2200));
    // The intro is gone; only the destination remains.
    expect(find.text('DESTINATION'), findsOneWidget);
    expect(find.text(kAppTagline), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('signed-out total time is within bounds', (tester) async {
    var completed = false;
    await tester.pumpWidget(
      harness(bootstrap: () async {}, onComplete: () => completed = true),
    );
    final elapsed = await pumpUntil(tester, () => completed, maxMs: 4000);
    expect(completed, isTrue);
    // Gate ~600 + swing 700 + zoom 900 + settle 300 ≈ 2.5 s.
    expect(elapsed, greaterThanOrEqualTo(2200));
    expect(elapsed, lessThanOrEqualTo(3200));
  });

  testWidgets('tap skips the choreography', (tester) async {
    var completed = false;
    await tester.pumpWidget(
      harness(bootstrap: () async {}, onComplete: () => completed = true),
    );
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tapAt(const Offset(400, 300));
    final elapsed = await pumpUntil(tester, () => completed, maxMs: 1200);
    expect(completed, isTrue);
    expect(elapsed, lessThan(1200));
  });

  testWidgets('skip while still loading finishes as soon as ready', (
    tester,
  ) async {
    final gate = Completer<void>();
    var completed = false;
    await tester.pumpWidget(
      harness(bootstrap: () => gate.future, onComplete: () => completed = true),
    );
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tapAt(const Offset(400, 300));
    await tester.pump(const Duration(milliseconds: 400));
    expect(completed, isFalse); // still waiting on the bootstrap
    gate.complete();
    await pumpUntil(tester, () => completed, maxMs: 800);
    expect(completed, isTrue);
  });

  testWidgets('signed-in users get the short version', (tester) async {
    var completed = false;
    await tester.pumpWidget(
      harness(
        bootstrap: () async {},
        signedIn: true,
        onComplete: () => completed = true,
      ),
    );
    // Short path: gate ~320 + swing 350 + zoom 450 + settle 150
    // ≈ 1.27 s — well inside the signed-out bounds above.
    final elapsed = await pumpUntil(tester, () => completed, maxMs: 2500);
    expect(completed, isTrue);
    expect(elapsed, lessThanOrEqualTo(1800));
  });

  testWidgets('destination input is blocked during the intro', (tester) async {
    var taps = 0;
    var completed = false;
    await tester.pumpWidget(
      harness(
        bootstrap: () async {},
        onComplete: () => completed = true,
        child: Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => taps++,
              child: const Text('TAP TARGET'),
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    // The tap is expected to miss the button (that is the point
    // of the test), so don't warn about the miss.
    await tester.tap(find.text('TAP TARGET'), warnIfMissed: false);
    await tester.pump(const Duration(milliseconds: 100));
    expect(taps, 0);
    // After the intro completes the same button fires.
    await pumpUntil(tester, () => completed, maxMs: 3000);
    expect(completed, isTrue);
    await tester.tap(find.text('TAP TARGET'));
    await tester.pump();
    expect(taps, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('reduced motion: static door, plain fade, still completes', (
    tester,
  ) async {
    var completed = false;
    await tester.pumpWidget(
      harness(
        bootstrap: () async {},
        onComplete: () => completed = true,
        reduceMotion: true,
      ),
    );
    // Tagline is up from the first frame (no entrance timing).
    await tester.pump();
    expect(find.text(kAppTagline), findsOneWidget);
    // No swing/zoom/settle: just the 220 ms fade once ready.
    final elapsed = await pumpUntil(tester, () => completed, maxMs: 2500);
    expect(completed, isTrue);
    expect(elapsed, lessThanOrEqualTo(1200));
    expect(tester.takeException(), isNull);
  });

  testWidgets('slow load shows the friendly note after 8 s', (tester) async {
    final gate = Completer<void>();
    var completed = false;
    await tester.pumpWidget(
      harness(bootstrap: () => gate.future, onComplete: () => completed = true),
    );
    await tester.pump(const Duration(seconds: 7));
    expect(find.text('This is taking longer than usual…'), findsNothing);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('This is taking longer than usual…'), findsOneWidget);
    gate.complete();
    await pumpUntil(tester, () => completed);
    expect(completed, isTrue);
  });

  testWidgets('bootstrap failure offers a retry that re-runs it', (
    tester,
  ) async {
    var calls = 0;
    var completed = false;
    await tester.pumpWidget(
      harness(
        bootstrap: () async {
          calls++;
          if (calls == 1) throw StateError('offline');
        },
        onComplete: () => completed = true,
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Retry'), findsOneWidget);
    expect(find.textContaining("Something didn't load"), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await pumpUntil(tester, () => completed);
    expect(calls, 2);
    expect(completed, isTrue);
    expect(tester.takeException(), isNull);
  });

  group('final frame goldens', () {
    Widget landingHarness({
      required AppState state,
      required ThemeData theme,
      required Widget home,
    }) {
      return ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(theme: withRealFont(theme), home: home),
      );
    }

    AppState signedOut() => AppState()..signOut();

    Future<void> driveToCompletion(
      WidgetTester tester,
      bool Function() completed,
    ) async {
      // Stepped 25 ms pumps so the animations land
      // deterministically on their final frame.
      var elapsed = 0;
      while (!completed() && elapsed < 4000) {
        await tester.pump(const Duration(milliseconds: 25));
        elapsed += 25;
      }
      expect(completed(), isTrue);
      await tester.pump();
    }

    testWidgets(
      'final frame equals standalone destination — light',
      skip: const bool.fromEnvironment('SKIP_GOLDENS'),
      (tester) async {
        tester.view.physicalSize = const Size(780, 1688);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(tester.view.reset);
        final state = signedOut();
        // Standalone destination first: it defines the golden.
        await tester.pumpWidget(
          landingHarness(
            state: state,
            theme: buildAppTheme(),
            home: const LandingScreen(),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        await expectLater(
          find.byType(LandingScreen),
          matchesGoldenFile('goldens/door_final_light.png'),
        );
        // Then the same destination behind the door intro,
        // driven to completion: its final frame must match the
        // SAME golden file, pixel for pixel.
        var completed = false;
        await tester.pumpWidget(
          landingHarness(
            state: state,
            theme: buildAppTheme(),
            home: DoorIntro(
              bootstrap: () async {},
              signedIn: false,
              onComplete: () => completed = true,
              child: const LandingScreen(),
            ),
          ),
        );
        await driveToCompletion(tester, () => completed);
        await expectLater(
          find.byType(LandingScreen),
          matchesGoldenFile('goldens/door_final_light.png'),
        );
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'final frame equals standalone destination — dark',
      skip: const bool.fromEnvironment('SKIP_GOLDENS'),
      (tester) async {
        tester.view.physicalSize = const Size(780, 1688);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(tester.view.reset);
        final state = signedOut();
        await tester.pumpWidget(
          landingHarness(
            state: state,
            theme: buildDarkAppTheme(),
            home: const LandingScreen(),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        await expectLater(
          find.byType(LandingScreen),
          matchesGoldenFile('goldens/door_final_dark.png'),
        );
        var completed = false;
        await tester.pumpWidget(
          landingHarness(
            state: state,
            theme: buildDarkAppTheme(),
            home: DoorIntro(
              bootstrap: () async {},
              signedIn: false,
              onComplete: () => completed = true,
              child: const LandingScreen(),
            ),
          ),
        );
        await driveToCompletion(tester, () => completed);
        await expectLater(
          find.byType(LandingScreen),
          matchesGoldenFile('goldens/door_final_dark.png'),
        );
        expect(tester.takeException(), isNull);
      },
    );
  });
}
