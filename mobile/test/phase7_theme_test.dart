import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/core/theme/section_colors.dart';
import 'package:neighbor_mart/core/theme/theme_preference.dart';
import 'package:neighbor_mart/core/widgets/listing_card_skeleton.dart';
import 'package:neighbor_mart/data/models/listing.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/features/profile/settings_screen.dart';

void main() {
  group('theme preference storage codec', () {
    test('parses stored values, defaulting to system', () {
      expect(themePreferenceFromStorage('light'), ThemePreference.light);
      expect(themePreferenceFromStorage('dark'), ThemePreference.dark);
      expect(themePreferenceFromStorage('system'), ThemePreference.system);
      expect(themePreferenceFromStorage(null), ThemePreference.system);
      expect(themePreferenceFromStorage('sepia'), ThemePreference.system);
    });

    test('round-trips through storage strings', () {
      for (final preference in ThemePreference.values) {
        expect(
          themePreferenceFromStorage(themePreferenceToStorage(preference)),
          preference,
        );
      }
      expect(kThemePreferencePrefsKey, 'neighbormart:theme-mode');
    });

    test('maps to ThemeMode', () {
      expect(themeModeForPreference(ThemePreference.system), ThemeMode.system);
      expect(themeModeForPreference(ThemePreference.light), ThemeMode.light);
      expect(themeModeForPreference(ThemePreference.dark), ThemeMode.dark);
    });
  });

  group('AppState theme preference persistence', () {
    test('restores the saved preference on launch', () async {
      SharedPreferences.setMockInitialValues({
        'neighbormart:theme-mode': 'dark',
      });
      final prefs = await SharedPreferences.getInstance();
      final state = AppState();
      await state.restoreFromPrefs(prefs);
      expect(state.themePreference, ThemePreference.dark);
    });

    test('defaults to system with no saved value', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final state = AppState();
      await state.restoreFromPrefs(prefs);
      expect(state.themePreference, ThemePreference.system);
    });

    test('setThemePreference persists and notifies', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final state = AppState();
      await state.restoreFromPrefs(prefs);
      var notified = 0;
      state.addListener(() => notified++);
      await state.setThemePreference(ThemePreference.light);
      expect(state.themePreference, ThemePreference.light);
      expect(prefs.getString('neighbormart:theme-mode'), 'light');
      expect(notified, 1);
    });
  });

  group('app themes', () {
    test('light theme uses the cream canvas + terracotta palette', () {
      final theme = buildAppTheme();
      expect(theme.brightness, Brightness.light);
      expect(theme.scaffoldBackgroundColor, AppColors.cream);
      expect(theme.colorScheme.primary, AppColors.terracotta);
      expect(theme.colorScheme.surface, AppColors.creamSurface);
      expect(theme.colorScheme.surfaceContainerHighest, AppColors.creamDark);
      expect(theme.colorScheme.onSurface, AppColors.bark);
    });

    test('dark theme is warm charcoal with lighter terracotta', () {
      final theme = buildDarkAppTheme();
      expect(theme.brightness, Brightness.dark);
      expect(theme.scaffoldBackgroundColor, AppColors.darkCanvas);
      expect(theme.colorScheme.primary, AppColors.darkPrimary);
      expect(theme.colorScheme.onPrimary, AppColors.darkOnPrimary);
      expect(theme.colorScheme.surface, AppColors.darkSurface);
      expect(
        theme.colorScheme.surfaceContainerHighest,
        AppColors.darkSurfaceVariant,
      );
      expect(theme.colorScheme.secondary, AppColors.darkMoss);
    });
  });

  group('section accents', () {
    test('every section has the specified light + dark accent', () {
      const expected = {
        ListingSection.items: (Color(0xFFB45309), Color(0xFFFBBF24)),
        ListingSection.vehicles: (Color(0xFF1D4ED8), Color(0xFF60A5FA)),
        ListingSection.properties: (Color(0xFF7E22CE), Color(0xFFC084FC)),
        ListingSection.arenas: (Color(0xFF15803D), Color(0xFF4ADE80)),
      };
      for (final section in ListingSection.values) {
        final (light, dark) = expected[section]!;
        expect(sectionAccentColor(section, Brightness.light), light);
        expect(sectionAccentColor(section, Brightness.dark), dark);
      }
    });

    test('container tint is a translucent wash of the accent', () {
      for (final section in ListingSection.values) {
        for (final brightness in Brightness.values) {
          final accent = sectionAccentColor(section, brightness);
          final container = sectionAccentContainerColor(section, brightness);
          expect(container.a, lessThan(1));
          expect(container.r, accent.r);
          expect(container.g, accent.g);
          expect(container.b, accent.b);
        }
      }
    });
  });

  group('skeletons', () {
    testWidgets('listing list skeleton renders placeholder cards', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: ListingListSkeleton())),
      );
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byType(ListingCardSkeleton), findsNWidgets(5));
      expect(find.byType(SkeletonBlock), findsWidgets);
      // Unmount so the pulse controller is disposed before teardown.
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    });

    testWidgets('skeleton renders statically under reduced motion', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: true),
            child: Scaffold(body: ListingListSkeleton(count: 2)),
          ),
        ),
      );
      await tester.pump();
      expect(find.byType(ListingCardSkeleton), findsNWidgets(2));
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    });
  });

  group('settings appearance control', () {
    testWidgets('segmented control reflects + changes the preference', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final state = AppState();
      await state.restoreFromPrefs(prefs);
      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: MaterialApp(
            theme: buildAppTheme(),
            darkTheme: buildDarkAppTheme(),
            home: const SettingsScreen(),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Appearance'), findsOneWidget);
      expect(find.byType(SegmentedButton<ThemePreference>), findsOneWidget);
      await tester.tap(find.text('Dark'));
      await tester.pump();
      expect(state.themePreference, ThemePreference.dark);
      expect(prefs.getString('neighbormart:theme-mode'), 'dark');
      await tester.tap(find.text('Light'));
      await tester.pump();
      expect(state.themePreference, ThemePreference.light);
    });
  });
}
