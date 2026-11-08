import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/features/activity/activity_screen.dart';
import 'package:neighbor_mart/ui/features/auth/login_screen.dart';
import 'package:neighbor_mart/ui/features/auth/signup_screen.dart';
import 'package:neighbor_mart/ui/features/explore/explore_screen.dart';
import 'package:neighbor_mart/ui/features/item_detail/item_detail_screen.dart';
import 'package:neighbor_mart/ui/features/listing_detail/listing_detail_screen.dart';
import 'package:neighbor_mart/ui/features/messages/chat_screen.dart';
import 'package:neighbor_mart/ui/features/messages/messages_screen.dart';
import 'package:neighbor_mart/ui/features/profile/profile_screen.dart';
import 'package:neighbor_mart/ui/features/profile/settings_screen.dart';
import 'package:neighbor_mart/ui/features/wishlist/wishlist_screen.dart';

/// Overflow sweep: every top-level screen is pumped at a small
/// size with big text (320×568 @ 1.6x) and at a standard phone
/// size (360×800 @ 1.0x). Any RenderFlex overflow is reported by
/// the framework as a FlutterError — we collect them per screen
/// and fail with the full list, so one run shows every offender.
void main() {
  final failures = <String>[];

  Future<void> check(
    WidgetTester tester,
    String name,
    Widget screen,
    AppState state,
    Size size,
    double textScale,
  ) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    final previousOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      final text = details.toString();
      if (text.contains('overflowed')) {
        failures.add(
          '$name @ ${size.width}x${size.height} scale $textScale: '
          '${details.exceptionAsString().split('\n').first}',
        );
      } else {
        previousOnError?.call(details);
      }
    };
    try {
      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: MaterialApp(
            theme: buildAppTheme(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(textScale)),
              child: child!,
            ),
            home: screen,
          ),
        ),
      );
      // A few frames so entrance fades / skeleton timers run out.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 700));
      await tester.pump(const Duration(milliseconds: 700));
      final exception = tester.takeException();
      if (exception != null) {
        failures.add(
          '$name @ ${size.width}x${size.height} scale $textScale: $exception',
        );
      }
    } finally {
      FlutterError.onError = previousOnError;
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    }
  }

  testWidgets('no RenderFlex overflow on any main screen', (tester) async {
    final signedIn = AppState();
    final signedOut = AppState()..signOut();
    final listingId = signedIn.listings.first.id;
    final itemId = signedIn.items.first.id;
    final request = signedIn.requests.isNotEmpty
        ? signedIn.requests.first
        : null;

    final screens = <(String, Widget, AppState)>[
      ('LoginScreen', const LoginScreen(), signedOut),
      ('SignUpScreen', const SignUpScreen(), signedOut),
      ('ExploreScreen', const ExploreScreen(), signedIn),
      (
        'ListingDetailScreen',
        ListingDetailScreen(listingId: listingId),
        signedIn,
      ),
      ('ItemDetailScreen', ItemDetailScreen(itemId: itemId), signedIn),
      ('ActivityScreen', const ActivityScreen(), signedIn),
      ('ProfileScreen', const ProfileScreen(), signedIn),
      ('SettingsScreen', const SettingsScreen(), signedIn),
      ('MessagesScreen', const MessagesScreen(), signedIn),
      if (request != null)
        ('ChatScreen', ChatScreen(requestId: request.id), signedIn),
      ('WishlistScreen', const WishlistScreen(), signedIn),
    ];

    for (final (name, screen, state) in screens) {
      await check(tester, name, screen, state, const Size(320, 568), 1.6);
      await check(tester, name, screen, state, const Size(360, 800), 1.0);
    }

    expect(failures, isEmpty, reason: failures.join('\n'));
  });
}
