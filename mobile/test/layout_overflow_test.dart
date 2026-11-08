import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/app_shell.dart';
import 'package:neighbor_mart/ui/features/item_detail/item_detail_screen.dart';

/// Layout audit guard: the whole shell (all four tabs render at once
/// in the IndexedStack) and the item detail page for the longest
/// seeded title must lay out cleanly on a small phone with enlarged
/// text — no RenderFlex overflow, no exceptions.
void main() {
  Widget harness(Widget home, AppState state) {
    return ChangeNotifierProvider<AppState>.value(
      value: state,
      child: MaterialApp(
        theme: buildAppTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: const TextScaler.linear(1.3)),
          child: child!,
        ),
        home: home,
      ),
    );
  }

  void useSmallScreen(WidgetTester tester) {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
  }

  testWidgets('AppShell: no overflow at 360x640, text scale 1.3', (
    tester,
  ) async {
    useSmallScreen(tester);
    await tester.pumpWidget(harness(const AppShell(), AppState()));
    await tester.pump();
    expect(tester.takeException(), isNull);
    // Visit each tab so its app bar and chrome lay out too.
    for (final label in ['Wishlist', 'Activity', 'Profile', 'Explore']) {
      await tester.tap(find.text(label).first);
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'overflow on $label tab');
    }
  });

  testWidgets('ItemDetail (longest title): no overflow at 360x640, 1.3x', (
    tester,
  ) async {
    useSmallScreen(tester);
    final state = AppState();
    final longest = state.items.reduce(
      (a, b) => a.title.length >= b.title.length ? a : b,
    );
    await tester.pumpWidget(
      harness(ItemDetailScreen(itemId: longest.id), state),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    // Scroll to the bottom (request button, ask button, reviews).
    await tester.drag(find.byType(ListView), const Offset(0, -1200));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
