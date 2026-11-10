import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/data/models/firestore_maps.dart';
import 'package:neighbor_mart/data/models/listing.dart';
import 'package:neighbor_mart/data/models/user.dart';
import 'package:neighbor_mart/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('privacy split merge (Workstream C)', () {
    test('private doc wins per-field, legacy public fields fall back', () {
      final merged = mergeProfileData(
        {
          'phone': '+92 300 0000000',
          'email': 'legacy@example.com',
          'blockedUserIds': ['u-old'],
          'homeLocation': {'lat': 31.1, 'lng': 74.1},
          'name': 'Maya',
        },
        {'phone': '+92 321 9999999'},
      );
      expect(merged['phone'], '+92 321 9999999');
      expect(merged['email'], 'legacy@example.com');
      expect(merged['blockedUserIds'], ['u-old']);
      expect(merged['homeLocation'], {'lat': 31.1, 'lng': 74.1});
      expect(merged['name'], 'Maya');
    });

    test('a null private doc returns the public body unchanged', () {
      final public = {'name': 'Maya', 'phone': ''};
      expect(mergeProfileData(public, null), same(public));
    });

    test(
      'an explicitly emptied private block list wins over the legacy one',
      () {
        final merged = mergeProfileData(
          {
            'blockedUserIds': ['u-old'],
          },
          {'blockedUserIds': <dynamic>[]},
        );
        expect(merged['blockedUserIds'], isEmpty);
      },
    );

    test('AppUser.copyWith can replace email and homeLocation', () {
      final user = AppUser(
        id: 'u-1',
        name: 'Test',
        email: 'old@example.com',
        bio: '',
        neighborhood: 'Gulberg',
        homeLocation: const LatLng(31.1, 74.1),
        joinedAt: DateTime(2026, 1, 1),
        phoneVerified: false,
        emailVerified: false,
        responseRate: 1,
        avgResponseMinutes: 60,
        stats: const UserStats(
          successfulLends: 0,
          successfulBorrows: 0,
          onTimeReturns: 0,
          lateReturns: 0,
        ),
        badges: const [],
      );
      final updated = user.copyWith(
        email: 'new@example.com',
        homeLocation: const LatLng(31.9, 74.9),
      );
      expect(updated.email, 'new@example.com');
      expect(updated.homeLocation.lat, 31.9);
      expect(updated.homeLocation.lng, 74.9);
      // Untouched fields survive.
      expect(updated.name, 'Test');
    });
  });

  group('lazy demo seed (Part 3c)', () {
    test('deferred construction builds nothing until local mode entry', () {
      final s = AppState(seedDemoData: false);
      expect(s.users, isEmpty);
      expect(s.listings, isEmpty);
      expect(s.items, isEmpty);
      expect(s.requests, isEmpty);

      s.loadLocalDemoData();
      expect(s.users, isNotEmpty);
      expect(s.listings, isNotEmpty);
      expect(s.items, isNotEmpty);
      expect(s.currentUser.id, 'u-maya');

      // A second call is a no-op (seed already built).
      final count = s.listings.length;
      s.loadLocalDemoData();
      expect(s.listings.length, count);
    });

    test('enableLiveMode cancels a deferred seed for good', () {
      final s = AppState(seedDemoData: false);
      s.enableLiveMode();
      expect(s.liveMode, isTrue);
      s.loadLocalDemoData();
      expect(s.listings, isEmpty);
      expect(s.users, isEmpty);
    });

    test(
      'a session restore stashed while deferred applies on local entry',
      () async {
        SharedPreferences.setMockInitialValues({});
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('sessionUserId', 'u-joan');

        final s = AppState(seedDemoData: false);
        await s.restoreFromPrefs(prefs);
        // Not applied yet — there are no seed users to restore against.
        expect(s.isLoggedIn, isTrue); // untouched default, no crash

        s.loadLocalDemoData();
        expect(s.currentUser.id, 'u-joan');
        expect(s.isLoggedIn, isTrue);
      },
    );

    test('default construction still seeds eagerly (existing behavior)', () {
      final s = AppState();
      expect(s.users, isNotEmpty);
      expect(s.listings, isNotEmpty);
    });
  });

  group('owner-scoped listings (Part 3a)', () {
    test('ensureOwnListingsLoaded is a no-op in local mode', () async {
      final s = AppState();
      final before = s.listings.map((l) => l.id).toList();
      await s.ensureOwnListingsLoaded();
      expect(s.listings.map((l) => l.id), before);
      // Local catalog already contains Maya's non-active listings
      // (the rented drill) — local mode needs no owner fetch.
      expect(s.myListings.any((l) => l.status == ListingStatus.rented), isTrue);
    });
  });
}
