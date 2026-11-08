// Long sweep: many screens × many configs — give the file room.
// ignore: unnecessary_library_name
@Timeout(Duration(minutes: 20))
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:neighbor_mart/core/theme/app_theme.dart';
import 'package:neighbor_mart/data/models/listing.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:neighbor_mart/ui/app_shell.dart';
import 'package:neighbor_mart/ui/features/activity/activity_screen.dart';
import 'package:neighbor_mart/ui/features/auth/forgot_password_screen.dart';
import 'package:neighbor_mart/ui/features/auth/landing_screen.dart';
import 'package:neighbor_mart/ui/features/auth/login_screen.dart';
import 'package:neighbor_mart/ui/features/auth/signup_screen.dart';
import 'package:neighbor_mart/ui/features/explore/explore_screen.dart';
import 'package:neighbor_mart/ui/features/explore/item_map_view.dart';
import 'package:neighbor_mart/ui/features/item_detail/item_detail_screen.dart';
import 'package:neighbor_mart/ui/features/item_detail/photo_gallery_screen.dart';
import 'package:neighbor_mart/ui/features/list_item/list_item_screen.dart';
import 'package:neighbor_mart/ui/features/list_item/list_listing_screen.dart';
import 'package:neighbor_mart/ui/features/listing_detail/listing_detail_screen.dart';
import 'package:neighbor_mart/ui/features/messages/chat_screen.dart';
import 'package:neighbor_mart/ui/features/messages/messages_screen.dart';
import 'package:neighbor_mart/ui/features/not_found/not_found_screen.dart';
import 'package:neighbor_mart/ui/features/notifications/notifications_screen.dart';
import 'package:neighbor_mart/ui/features/onboarding/onboarding_screen.dart';
import 'package:neighbor_mart/ui/features/onboarding/profile_setup_screen.dart';
import 'package:neighbor_mart/ui/features/onboarding/splash_screen.dart';
import 'package:neighbor_mart/ui/features/profile/edit_profile_screen.dart';
import 'package:neighbor_mart/ui/features/profile/manage_items_screen.dart';
import 'package:neighbor_mart/ui/features/profile/profile_screen.dart';
import 'package:neighbor_mart/ui/features/profile/settings_screen.dart';
import 'package:neighbor_mart/ui/features/profile/user_profile_screen.dart';
import 'package:neighbor_mart/ui/features/profile/verification_screen.dart';
import 'package:neighbor_mart/ui/features/trust/trust_explainer_screen.dart';
import 'package:neighbor_mart/ui/features/wishlist/wishlist_screen.dart';

/// Exhaustive overflow sweep: EVERY user-facing screen is pumped
/// at a matrix of small-phone sizes and accessibility text scales:
///
///   320×568 @ 1.0 / 1.6 / 2.0
///   360×800 @ 1.0 / 1.3 / 1.6 / 2.0
///   411×915 @ 1.3
///
/// Any layout error (RenderFlex overflow, unbounded constraints,
/// "not laid out", …) is collected per screen + config and the
/// test fails with the full readable list, so one run shows every
/// offender. Non-layout FlutterErrors (e.g. network-image noise in
/// the test environment) are printed for visibility but do not
/// fail the sweep — they are environmental, not layout defects.

class _Cfg {
  final Size size;
  final double scale;
  const _Cfg(this.size, this.scale);
  String get label =>
      '${size.width.toInt()}x${size.height.toInt()} @ ${scale}x';
}

const _configs = <_Cfg>[
  _Cfg(Size(320, 568), 1.0),
  _Cfg(Size(320, 568), 1.6),
  _Cfg(Size(320, 568), 2.0),
  _Cfg(Size(360, 800), 1.0),
  _Cfg(Size(360, 800), 1.3),
  _Cfg(Size(360, 800), 1.6),
  _Cfg(Size(360, 800), 2.0),
  _Cfg(Size(411, 915), 1.3),
];

bool _isLayoutError(String text) =>
    text.contains('overflowed') ||
    text.contains('RenderFlex') ||
    text.contains('was not laid out') ||
    text.contains('unbounded') ||
    text.contains('infinite') ||
    text.contains('layout') && text.contains('Error');

class _Case {
  final String name;
  final AppState Function() makeState;
  final Widget Function(AppState state) build;
  final Future<void> Function(WidgetTester tester)? interact;
  const _Case(this.name, this.makeState, this.build, {this.interact});
}

void main() {
  // Measure with the app's REAL fonts (Roboto + MaterialIcons from
  // the SDK cache), like the login tests do: the default test font
  // draws every glyph a full em wide, which reports phantom
  // overflows no device ever hits — and hides the real text
  // metrics. When the font files are unavailable (CI passes
  // SKIP_GOLDENS for the same reason), the sweep still runs with
  // the test font; the layouts are hardened to survive both.
  var realFontLoaded = false;
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    if (const bool.fromEnvironment('SKIP_GOLDENS')) return;
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

    final roboto = await loadFamily('Roboto', [
      'Roboto-Regular.ttf',
      'Roboto-Medium.ttf',
      'Roboto-Bold.ttf',
    ]);
    await loadFamily('MaterialIcons', ['MaterialIcons-Regular.otf']);
    realFontLoaded = roboto;
  });

  ThemeData themed(ThemeData base) => realFontLoaded
      ? base.copyWith(textTheme: base.textTheme.apply(fontFamily: 'Roboto'))
      : base;

  AppState signedIn() => AppState();
  AppState signedOut() => AppState()..signOut();

  final probe = AppState();
  final firstItem = probe.items.first;
  final firstListing = probe.listings.first;
  final listingBySection = <ListingSection, Listing>{};
  for (final l in probe.listings) {
    listingBySection.putIfAbsent(l.section, () => l);
  }
  final firstRequest = probe.requests.isNotEmpty ? probe.requests.first : null;
  final otherUser = probe.users.firstWhere(
    (u) => u.id != probe.currentUser.id,
    orElse: () => probe.users.first,
  );

  final cases = <_Case>[
    _Case('LoginScreen', signedOut, (_) => const LoginScreen()),
    _Case('SignUpScreen', signedOut, (_) => const SignUpScreen()),
    _Case(
      'ForgotPasswordScreen',
      signedOut,
      (_) => const ForgotPasswordScreen(),
    ),
    _Case('LandingScreen', signedOut, (_) => const LandingScreen()),
    _Case('SplashScreen', signedOut, (_) => const SplashScreen()),
    _Case('OnboardingScreen', signedOut, (_) => const OnboardingScreen()),
    _Case(
      'ProfileSetupScreen',
      signedIn,
      (_) => const ProfileSetupScreen(),
      interact: (tester) async {
        // Fill whatever text fields step 1 shows, then try to
        // advance — validation may hold us on step 1 (which still
        // renders the error state, also worth covering).
        final fields = find.byType(TextFormField);
        final count = fields.evaluate().length;
        for (var i = 0; i < count; i++) {
          await tester.enterText(fields.at(i), 'Test value 123');
        }
        final cont = find.text('Continue');
        if (cont.evaluate().isNotEmpty) {
          await tester.ensureVisible(cont.first);
          await tester.tap(cont.first);
          await tester.pump(const Duration(milliseconds: 400));
        }
      },
    ),
    _Case('ExploreScreen (items)', signedIn, (_) => const ExploreScreen()),
    _Case(
      'ExploreScreen (vehicles section)',
      signedIn,
      (_) => const ExploreScreen(),
      interact: (tester) async {
        final chip = find.textContaining('Vehicles');
        if (chip.evaluate().isNotEmpty) {
          await tester.tap(chip.first);
          await tester.pump(const Duration(milliseconds: 500));
        }
      },
    ),
    _Case(
      'ExploreScreen (filters sheet)',
      signedIn,
      (_) => const ExploreScreen(),
      interact: (tester) async {
        final btn = find.byIcon(Icons.tune);
        if (btn.evaluate().isNotEmpty) {
          await tester.tap(btn.first);
          await tester.pump(const Duration(milliseconds: 700));
        }
      },
    ),
    _Case(
      'ExploreScreen (map view)',
      signedIn,
      (_) => const ExploreScreen(),
      interact: (tester) async {
        final btn = find.byTooltip('Map view');
        if (btn.evaluate().isNotEmpty) {
          await tester.tap(btn.first);
          await tester.pump(const Duration(milliseconds: 500));
        }
      },
    ),
    _Case(
      'ItemMapView (standalone)',
      signedIn,
      (s) => ItemMapView(items: s.items),
    ),
    _Case(
      'ItemDetailScreen',
      signedIn,
      (_) => ItemDetailScreen(itemId: firstItem.id),
    ),
    _Case(
      'PhotoGalleryScreen',
      signedIn,
      (_) => PhotoGalleryScreen(item: firstItem),
    ),
    for (final entry in listingBySection.entries)
      _Case(
        'ListingDetailScreen (${entry.key.name})',
        signedIn,
        (_) => ListingDetailScreen(listingId: entry.value.id),
      ),
    _Case(
      'ListingDetailScreen (first)',
      signedIn,
      (_) => ListingDetailScreen(listingId: firstListing.id),
    ),
    _Case(
      'ListItemScreen (wizard step 1)',
      signedIn,
      (_) => const ListItemScreen(),
    ),
    _Case(
      'ListItemScreen (wizard all steps)',
      signedIn,
      (_) => const ListItemScreen(),
      interact: (tester) async {
        // Advance through the wizard steps via its Continue button.
        for (var step = 0; step < 2; step++) {
          final cont = find.text('Continue');
          if (cont.evaluate().isEmpty) break;
          await tester.ensureVisible(cont.first);
          await tester.tap(cont.first);
          await tester.pump(const Duration(milliseconds: 400));
        }
      },
    ),
    for (final section in ListingSection.values)
      if (section != ListingSection.items)
        _Case(
          'ListListingScreen (${section.name})',
          signedIn,
          (_) => ListListingScreen(section: section),
        ),
    _Case('ActivityScreen', signedIn, (_) => const ActivityScreen()),
    _Case('MessagesScreen', signedIn, (_) => const MessagesScreen()),
    if (firstRequest != null)
      _Case(
        'ChatScreen (request)',
        signedIn,
        (_) => ChatScreen(requestId: firstRequest.id),
      ),
    _Case(
      'ChatScreen (forUser)',
      signedIn,
      (_) => ChatScreen.forUser(otherUserId: otherUser.id),
    ),
    _Case('NotificationsScreen', signedIn, (_) => const NotificationsScreen()),
    _Case('WishlistScreen', signedIn, (_) => const WishlistScreen()),
    _Case('ProfileScreen', signedIn, (_) => const ProfileScreen()),
    _Case(
      'UserProfileScreen',
      signedIn,
      (_) => UserProfileScreen(userId: otherUser.id),
    ),
    _Case('EditProfileScreen', signedIn, (_) => const EditProfileScreen()),
    _Case('SettingsScreen', signedIn, (_) => const SettingsScreen()),
    _Case('ManageItemsScreen', signedIn, (_) => const ManageItemsScreen()),
    _Case('VerificationScreen', signedIn, (_) => const VerificationScreen()),
    _Case(
      'TrustExplainerScreen',
      signedIn,
      (_) => const TrustExplainerScreen(),
    ),
    _Case('NotFoundScreen', signedIn, (_) => const NotFoundScreen()),
    _Case(
      'AppShell (all tabs)',
      signedIn,
      (_) => const AppShell(),
      interact: (tester) async {
        for (final label in ['Wishlist', 'Activity', 'Profile', 'Explore']) {
          final tab = find.text(label);
          if (tab.evaluate().isNotEmpty) {
            await tester.tap(tab.first);
            await tester.pump(const Duration(milliseconds: 400));
          }
        }
      },
    ),
  ];

  Future<void> runCase(WidgetTester tester, _Case c) async {
    final failures = <String>[];
    final noise = <String>[];
    final state = c.makeState();
    for (final cfg in _configs) {
      tester.view.physicalSize = cfg.size;
      tester.view.devicePixelRatio = 1.0;
      final previousOnError = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.toString();
        final firstLine = details.exceptionAsString().split('\n').first;
        if (_isLayoutError(text)) {
          failures.add('${c.name} @ ${cfg.label}: $firstLine');
        } else {
          noise.add('${c.name} @ ${cfg.label}: $firstLine');
          previousOnError?.call(details);
        }
      };
      try {
        await tester.pumpWidget(
          ChangeNotifierProvider<AppState>.value(
            value: state,
            child: MaterialApp(
              theme: themed(buildAppTheme()),
              darkTheme: themed(buildDarkAppTheme()),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(cfg.scale)),
                child: child!,
              ),
              home: c.build(state),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 700));
        if (c.interact != null) {
          try {
            await c.interact!(tester);
          } catch (e) {
            failures.add('${c.name} @ ${cfg.label}: interact failed: $e');
          }
          await tester.pump(const Duration(milliseconds: 400));
        }
        await tester.pump(const Duration(milliseconds: 700));
        final exception = tester.takeException();
        if (exception != null) {
          final text = exception.toString();
          if (_isLayoutError(text)) {
            failures.add('${c.name} @ ${cfg.label}: ${text.split('\n').first}');
          } else {
            noise.add('${c.name} @ ${cfg.label}: $text');
          }
        }
      } finally {
        FlutterError.onError = previousOnError;
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      }
    }
    if (noise.isNotEmpty) {
      debugPrint(
        '--- non-layout errors (not failing) for ${c.name} ---\n'
        '${noise.join('\n')}',
      );
    }
    expect(failures, isEmpty, reason: failures.join('\n'));
  }

  for (final c in cases) {
    testWidgets('overflow sweep: ${c.name}', (tester) => runCase(tester, c));
  }
}
