import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/core/widgets/shared_widgets.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/features/activity/activity_screen.dart';

/// WCAG contrast ratio between two colors (relative luminance).
double contrastRatio(Color a, Color b) {
  double luminance(Color c) {
    double channel(double v) => v <= 0.03928
        ? v / 12.92
        : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
    return 0.2126 * channel(c.r) +
        0.7152 * channel(c.g) +
        0.0722 * channel(c.b);
  }

  final l1 = luminance(a);
  final l2 = luminance(b);
  final hi = l1 > l2 ? l1 : l2;
  final lo = l1 > l2 ? l2 : l1;
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  group('theme foreground colors meet WCAG AA on their surfaces', () {
    for (final entry in {
      'light': buildAppTheme(),
      'dark': buildDarkAppTheme(),
    }.entries) {
      test('${entry.key} theme pairs all reach 4.5:1', () {
        final scheme = entry.value.colorScheme;
        final pairs = <String, (Color, Color)>{
          'onSurface/surface': (scheme.onSurface, scheme.surface),
          'onSurfaceVariant/surface': (scheme.onSurfaceVariant, scheme.surface),
          'onSurfaceVariant/surfaceContainerHighest': (
            scheme.onSurfaceVariant,
            scheme.surfaceContainerHighest,
          ),
          'secondary/surface': (scheme.secondary, scheme.surface),
          'error/surface': (scheme.error, scheme.surface),
        };
        for (final pair in pairs.entries) {
          expect(
            contrastRatio(pair.value.$1, pair.value.$2),
            greaterThanOrEqualTo(4.5),
            reason: '${entry.key} ${pair.key} must meet AA for normal text',
          );
        }
        // The brand primary carries large text, icons and button fills
        // rather than body text; it is held to the 3:1 large/graphic
        // threshold. (Light terracotta sits at ~4.2:1 — a shipped brand
        // value, not changed by the dark-mode pass.)
        expect(
          contrastRatio(scheme.primary, scheme.surface),
          greaterThanOrEqualTo(3.0),
          reason: '${entry.key} primary/surface must meet 3:1',
        );
        expect(
          contrastRatio(scheme.onPrimary, scheme.primary),
          greaterThanOrEqualTo(3.0),
          reason: '${entry.key} onPrimary/primary must meet 3:1',
        );
      });
    }

    test('amber accent reaches AA on both themes, incl. its own tint', () {
      for (final brightness in Brightness.values) {
        final accent = amberAccentColor(brightness);
        final surface = brightness == Brightness.dark
            ? AppColors.darkSurface
            : AppColors.creamSurface;
        expect(contrastRatio(accent, surface), greaterThanOrEqualTo(4.5));
        final tint = Color.alphaBlend(accent.withValues(alpha: 0.12), surface);
        expect(contrastRatio(accent, tint), greaterThanOrEqualTo(4.5));
      }
    });

    test('tier and status colors flip to lightened variants in dark', () {
      expect(
        tierColor('Trusted', Brightness.dark),
        isNot(tierColor('Trusted', Brightness.light)),
      );
      expect(
        tierColor('Community Pillar', Brightness.dark),
        AppColors.darkMoss,
      );
      expect(tierColor('Reliable', Brightness.dark), const Color(0xFFF0B35E));
    });
  });

  group('dark-mode widget regressions', () {
    testWidgets('StatusChip pending label uses the dark amber accent', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildDarkAppTheme(),
          home: const Scaffold(body: StatusChip(status: 'pending')),
        ),
      );
      final text = tester.widget<Text>(find.text('Pending'));
      expect(text.style?.color, const Color(0xFFF0B35E));
    });

    testWidgets('Activity tabs use marketplace wording', (tester) async {
      await tester.pumpWidget(
        ChangeNotifierProvider(
          create: (_) => AppState(),
          child: MaterialApp(
            theme: buildDarkAppTheme(),
            home: const ActivityScreen(),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('My requests'), findsOneWidget);
      expect(find.text('Requests for me'), findsOneWidget);
      expect(find.text('Borrowing'), findsNothing);
      expect(find.text('Lending'), findsNothing);
    });
  });
}
