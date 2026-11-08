import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/core/config.dart';
import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/ui/features/onboarding/door_intro.dart';

/// Tests for the Open Door intro: it renders the closed door +
/// tagline while the bootstrap runs, opens into the destination
/// once ready, supports tap-to-skip, takes the short path for
/// signed-in users, degrades to a static fade under reduced
/// motion, warns on slow loads, and offers a retry on failure.
void main() {
  Widget harness({
    required Future<void> Function() bootstrap,
    bool signedIn = false,
    required VoidCallback onComplete,
    bool reduceMotion = false,
    ThemeData? theme,
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
        child: const Scaffold(body: Center(child: Text('DESTINATION'))),
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

  testWidgets('renders the closed door and tagline while loading', (
    tester,
  ) async {
    final gate = Completer<void>();
    var completed = false;
    await tester.pumpWidget(
      harness(bootstrap: () => gate.future, onComplete: () => completed = true),
    );
    await tester.pump(const Duration(milliseconds: 700));
    expect(find.text(kAppTagline), findsOneWidget);
    expect(find.byType(DoorIntro), findsOneWidget);
    expect(completed, isFalse);
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
    // Signed-out minimum beat is 1250 ms: not done at 1.1 s…
    await tester.pump(const Duration(milliseconds: 1100));
    expect(completed, isFalse);
    // …but the full sequence (min + swing + exit ≈ 2.55 s) lands.
    final elapsed = await pumpUntil(tester, () => completed);
    expect(completed, isTrue);
    expect(elapsed, lessThan(2200));
    // The intro is gone; only the destination remains.
    expect(find.text('DESTINATION'), findsOneWidget);
    expect(find.text(kAppTagline), findsNothing);
    expect(tester.takeException(), isNull);
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
    // Short path ≈ 500 + 460 + 300 = 1.26 s — done well before
    // the signed-out sequence would be.
    await pumpUntil(tester, () => completed, maxMs: 1800);
    expect(completed, isTrue);
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
    await pumpUntil(tester, () => completed, maxMs: 2500);
    expect(completed, isTrue);
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
}
