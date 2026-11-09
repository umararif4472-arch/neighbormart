import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/core/theme/section_colors.dart';
import 'package:neighbor_mart/core/widgets/shared_widgets.dart';
import 'package:neighbor_mart/data/models/listing.dart';
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
        // The brand primary is the button fill and onPrimary is the
        // button label, so that pair is held to the full 4.5:1 AA text
        // threshold (white on terracottaDark #A44B2D is ~5.8:1).
        // primary against the surface stays at 3:1 — it is also used
        // for large icons and graphic accents.
        expect(
          contrastRatio(scheme.primary, scheme.surface),
          greaterThanOrEqualTo(3.0),
          reason: '${entry.key} primary/surface must meet 3:1',
        );
        expect(
          contrastRatio(scheme.onPrimary, scheme.primary),
          greaterThanOrEqualTo(4.5),
          reason: '${entry.key} onPrimary/primary must meet 4.5:1',
        );
      });
    }

    test('navigation bar pairs meet text 4.5:1 / icon 3:1 thresholds', () {
      // Built from the ACTUAL themes, so the guard pins the real
      // navigationBarTheme tokens (indicator pill, iconTheme and
      // labelTextStyle state colors) — the exact pairing that used
      // to render the selected icon white-on-pale and invisible.
      for (final entry in {
        'light': buildAppTheme(),
        'dark': buildDarkAppTheme(),
      }.entries) {
        final nav = entry.value.navigationBarTheme;
        final barSurface = nav.backgroundColor!;
        final indicator = nav.indicatorColor!;
        final selectedIcon = nav.iconTheme!.resolve({
          WidgetState.selected,
        })!.color!;
        final unselectedIcon = nav.iconTheme!.resolve({})!.color!;
        final selectedLabel = nav.labelTextStyle!.resolve({
          WidgetState.selected,
        });
        final unselectedLabel = nav.labelTextStyle!.resolve({});
        expect(selectedLabel?.fontSize, 12);
        expect(selectedLabel?.fontWeight, FontWeight.w500);
        expect(unselectedLabel?.fontWeight, FontWeight.w500);

        final textPairs = <String, (Color, Color)>{
          'selected label/bar surface': (selectedLabel!.color!, barSurface),
          'unselected label/bar surface': (unselectedLabel!.color!, barSurface),
        };
        for (final pair in textPairs.entries) {
          expect(
            contrastRatio(pair.value.$1, pair.value.$2),
            greaterThanOrEqualTo(4.5),
            reason: '${entry.key} nav ${pair.key} must meet AA for text',
          );
        }
        final iconPairs = <String, (Color, Color)>{
          'selected icon/indicator pill': (selectedIcon, indicator),
          'unselected icon/bar surface': (unselectedIcon, barSurface),
        };
        for (final pair in iconPairs.entries) {
          expect(
            contrastRatio(pair.value.$1, pair.value.$2),
            greaterThanOrEqualTo(3.0),
            reason: '${entry.key} nav ${pair.key} must meet 3:1 for icons',
          );
        }
        // The Activity badge label (onError) on its error fill.
        final scheme = entry.value.colorScheme;
        expect(
          contrastRatio(scheme.onError, scheme.error),
          greaterThanOrEqualTo(4.5),
          reason: '${entry.key} badge text must meet AA',
        );

        // Drawer rows (Part 7) reuse the same tokens: the selected
        // row sits on the nav indicator tint with primary icon +
        // label; unselected rows are onSurface text / onSurfaceVariant
        // icons on the drawer surface (= nav bar surface).
        expect(
          contrastRatio(scheme.primary, indicator),
          greaterThanOrEqualTo(4.5),
          reason: '${entry.key} drawer selected label/tint must meet AA',
        );
        expect(
          contrastRatio(scheme.primary, indicator),
          greaterThanOrEqualTo(3.0),
          reason: '${entry.key} drawer selected icon/tint must meet 3:1',
        );
        expect(
          contrastRatio(scheme.onSurface, barSurface),
          greaterThanOrEqualTo(4.5),
          reason: '${entry.key} drawer unselected label/surface must meet AA',
        );
        expect(
          contrastRatio(scheme.onSurfaceVariant, barSurface),
          greaterThanOrEqualTo(3.0),
          reason: '${entry.key} drawer unselected icon/surface must meet 3:1',
        );
      }
    });

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

    test('Open Door brand pairs all reach 4.5:1', () {
      // The pairs the brand guard pins (docs/BRAND.md): cream text
      // on the terracotta and door-dark fields (intro, splash,
      // logo plate), ink on the cream canvas, and the kit amber on
      // the dark canvas (knob/mat graphics that double as large
      // text accents in dark mode).
      final pairs = <String, (Color, Color)>{
        'cream/terracotta': (AppColors.cream, AppColors.terracottaDark),
        'cream/doorDark': (AppColors.cream, AppColors.doorDark),
        'ink/cream': (AppColors.bark, AppColors.cream),
        'brandAmber/darkCanvas': (AppColors.brandAmber, AppColors.darkCanvas),
      };
      for (final pair in pairs.entries) {
        expect(
          contrastRatio(pair.value.$1, pair.value.$2),
          greaterThanOrEqualTo(4.5),
          reason: '${pair.key} must meet AA for text',
        );
      }
    });

    test('section text shades reach AA on surfaces and their tints', () {
      // sectionAccentColor is graphics-only (exact kit hex); the
      // text shade must pass on the plain surface AND on the
      // accent's own container tint (the section badge pairing).
      for (final section in ListingSection.values) {
        for (final brightness in Brightness.values) {
          final text = sectionAccentTextColor(section, brightness);
          final surface = brightness == Brightness.dark
              ? AppColors.darkSurface
              : AppColors.creamSurface;
          expect(
            contrastRatio(text, surface),
            greaterThanOrEqualTo(4.5),
            reason: '$section $brightness text on surface',
          );
          final tint = Color.alphaBlend(
            sectionAccentContainerColor(section, brightness),
            surface,
          );
          expect(
            contrastRatio(text, tint),
            greaterThanOrEqualTo(4.5),
            reason: '$section $brightness text on its container tint',
          );
        }
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
