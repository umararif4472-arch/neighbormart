import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/app_drawer.dart';
import 'package:neighbor_mart/ui/app_shell.dart';
import 'package:neighbor_mart/ui/features/explore/listing_section_view.dart';

/// Part 7: the shell-level navigation drawer — opens from every
/// tab (via the shell scope, not the tabs' inner scaffolds), drives
/// tabs + Explore sections, highlights the current destination, and
/// signs out.
void main() {
  Widget harness(AppState state, {bool dark = false, double scale = 1}) {
    return ChangeNotifierProvider<AppState>.value(
      value: state,
      child: MaterialApp(
        theme: buildAppTheme(),
        darkTheme: buildDarkAppTheme(),
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: const AppShell(),
      ),
    );
  }

  void useSize(WidgetTester tester, Size size) {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
  }

  Future<void> openDrawer(WidgetTester tester) async {
    await tester.tap(find.byTooltip('Menu').first);
    await tester.pumpAndSettle();
    expect(find.byType(AppDrawer), findsOneWidget);
  }

  Future<void> scrollDrawerTo(WidgetTester tester, String key) async {
    await tester.scrollUntilVisible(
      find.byKey(ValueKey(key)),
      120,
      scrollable: find
          .descendant(
            of: find.byType(AppDrawer),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapDrawerRow(WidgetTester tester, String key) async {
    await scrollDrawerTo(tester, key);
    await tester.tap(find.byKey(ValueKey(key)));
    await tester.pumpAndSettle();
  }

  group('shell drawer', () {
    testWidgets('opens from each of the four tabs', (tester) async {
      useSize(tester, const Size(411, 915));
      await tester.pumpWidget(harness(AppState()));
      await tester.pumpAndSettle();
      for (final label in ['Explore', 'Wishlist', 'Activity', 'Profile']) {
        await tester.tap(
          find
              .descendant(
                of: find.byType(NavigationBar),
                matching: find.text(label),
              )
              .first,
        );
        await tester.pumpAndSettle();
        await openDrawer(tester);
        await scrollDrawerTo(tester, 'drawer-sign-out');
        expect(
          find.byKey(const ValueKey('drawer-sign-out')),
          findsOneWidget,
          reason: 'drawer from $label tab',
        );
        expect(tester.takeException(), isNull);
        // Close via the scrim before moving to the next tab.
        await tester.tapAt(const Offset(395, 300));
        await tester.pumpAndSettle();
        expect(find.byType(AppDrawer), findsNothing);
      }
    });

    testWidgets('current tab MAIN entry is highlighted with the tint', (
      tester,
    ) async {
      useSize(tester, const Size(411, 915));
      await tester.pumpWidget(harness(AppState()));
      await tester.pumpAndSettle();
      await tester.tap(
        find
            .descendant(
              of: find.byType(NavigationBar),
              matching: find.text('Profile'),
            )
            .first,
      );
      await tester.pumpAndSettle();
      await openDrawer(tester);
      final profileTile = tester.widget<ListTile>(
        find.descendant(
          of: find.byKey(const ValueKey('drawer-tab-profile')),
          matching: find.byType(ListTile),
        ),
      );
      expect(profileTile.selected, isTrue);
      expect(
        profileTile.selectedTileColor,
        buildAppTheme().navigationBarTheme.indicatorColor,
      );
      final exploreTile = tester.widget<ListTile>(
        find.descendant(
          of: find.byKey(const ValueKey('drawer-tab-explore')),
          matching: find.byType(ListTile),
        ),
      );
      expect(exploreTile.selected, isFalse);
    });

    testWidgets('a SECTIONS entry lands on Explore with it selected', (
      tester,
    ) async {
      useSize(tester, const Size(411, 915));
      await tester.pumpWidget(harness(AppState()));
      await tester.pumpAndSettle();
      // Start away from Explore to prove the drawer navigates back.
      await tester.tap(
        find
            .descendant(
              of: find.byType(NavigationBar),
              matching: find.text('Wishlist'),
            )
            .first,
      );
      await tester.pumpAndSettle();
      await openDrawer(tester);
      await tapDrawerRow(tester, 'drawer-section-vehicles');
      expect(find.byType(AppDrawer), findsNothing);
      final nav = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(nav.selectedIndex, 0);
      final chip = tester.widget<ChoiceChip>(
        find.ancestor(
          of: find.text('🚗 Vehicles'),
          matching: find.byType(ChoiceChip),
        ),
      );
      expect(chip.selected, isTrue);
      expect(find.byType(SectionListingList), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('sign out entry signs out without crashing', (tester) async {
      useSize(tester, const Size(411, 915));
      final state = AppState();
      expect(state.isLoggedIn, isTrue);
      await tester.pumpWidget(harness(state));
      await tester.pumpAndSettle();
      await openDrawer(tester);
      await tapDrawerRow(tester, 'drawer-sign-out');
      expect(state.isLoggedIn, isFalse);
      expect(tester.takeException(), isNull);
    });

    for (final dark in [false, true]) {
      for (final size in [const Size(320, 568), const Size(568, 320)]) {
        testWidgets(
          'open drawer renders at ${size.width.toInt()}x${size.height.toInt()} '
          '@2.0 ${dark ? 'dark' : 'light'}',
          (tester) async {
            useSize(tester, size);
            await tester.pumpWidget(harness(AppState(), dark: dark, scale: 2));
            await tester.pumpAndSettle();
            await openDrawer(tester);
            // The tall 2.0x header pushes the first rows below the
            // fold — scroll the drawer's list to prove they render.
            await tester.scrollUntilVisible(
              find.byKey(const ValueKey('drawer-tab-explore')),
              120,
              scrollable: find
                  .descendant(
                    of: find.byType(AppDrawer),
                    matching: find.byType(Scrollable),
                  )
                  .first,
            );
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('drawer-tab-explore')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  });
}
