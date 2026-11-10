import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/data/models/listing.dart';
import 'package:neighbor_mart/data/services/live_sync.dart';
import 'package:neighbor_mart/data/services/paged_window.dart';
import 'package:neighbor_mart/state/app_state.dart';

/// Workstream B: bounded reads. The Firestore paths can't run in unit
/// tests (no Firebase app), so paging is verified at the two levels
/// that CAN run: the pure [PagedWindow] bookkeeping the live layer is
/// built on, and AppState's page-ingest API (driven directly after
/// [AppState.enableLiveMode], the same pattern live_data_test uses).

ItemListing _listing(String id, DateTime createdAt, {String owner = 'u-a'}) {
  return ItemListing(
    id: id,
    ownerId: owner,
    listingType: ListingType.borrow,
    title: 'Listing $id',
    description: 'A thing',
    price: 0,
    priceUnit: PriceUnit.fixed,
    location: const ListingLocation(
      lat: 31.5,
      lng: 74.3,
      city: 'Lahore',
      area: 'DHA',
    ),
    status: ListingStatus.active,
    createdAt: createdAt,
    updatedAt: createdAt,
    details: const ItemListingDetails(
      category: 'Tools',
      condition: 'Good',
      depositAmount: null,
      maxDurationDays: 3,
      pickupPreference: 'either',
      pickupInstructions: '',
    ),
  );
}

List<ItemListing> _page(int start, int count, DateTime base) => [
  for (var i = start; i < start + count; i++)
    _listing('l-$i', base.subtract(Duration(minutes: i))),
];

void main() {
  final base = DateTime(2026, 11, 10, 12);

  group('PagedWindow', () {
    test('page size is respected and a full page means maybe-more', () {
      final w = PagedWindow<String>(pageSize: 24, idOf: (s) => s);
      final added = w.appendPage([for (var i = 0; i < 24; i++) 'id-$i']);
      expect(added, 24);
      expect(w.length, 24);
      expect(w.hasMore, isTrue);
    });

    test('a short page marks the end of the source', () {
      final w = PagedWindow<String>(pageSize: 24, idOf: (s) => s);
      w.appendPage([for (var i = 0; i < 24; i++) 'id-$i']);
      final added = w.appendPage([for (var i = 24; i < 27; i++) 'id-$i']);
      expect(added, 3);
      expect(w.length, 27);
      expect(w.hasMore, isFalse);
    });

    test('cursor continuation loads the next DISTINCT page', () {
      // Simulate the canonical flow: 60 source rows, page size 24,
      // each page starts strictly after the previous page's last row.
      final source = [for (var i = 0; i < 60; i++) 'row-$i'];
      final w = PagedWindow<String>(pageSize: 24, idOf: (s) => s);
      var cursor = 0;
      while (w.hasMore) {
        final page = source.skip(cursor).take(24).toList();
        cursor += page.length;
        w.appendPage(page);
      }
      expect(w.length, 60);
      expect(w.items, source); // order preserved, nothing repeated
      expect(w.items.toSet().length, 60);
    });

    test('overlapping pages never duplicate ids', () {
      final w = PagedWindow<String>(pageSize: 3, idOf: (s) => s);
      expect(w.appendPage(['a', 'b', 'c']), 3);
      // The source shifted by one between fetches: 'c' repeats.
      expect(w.appendPage(['c', 'd', 'e']), 2);
      expect(w.items, ['a', 'b', 'c', 'd', 'e']);
    });

    test('appending an empty page at the end is a no-op that ends paging', () {
      final w = PagedWindow<String>(pageSize: 2, idOf: (s) => s);
      w.appendPage(['a', 'b']);
      expect(w.hasMore, isTrue);
      expect(w.appendPage(const []), 0);
      expect(w.items, ['a', 'b']);
      expect(w.hasMore, isFalse);
    });

    test('replace keeps position; remove drops the row', () {
      final w = PagedWindow<String>(pageSize: 10, idOf: (s) => s);
      w.appendPage(['a', 'b', 'c']);
      expect(w.replace('b'), isTrue);
      expect(w.items, ['a', 'b', 'c']);
      expect(w.remove('b'), isTrue);
      expect(w.items, ['a', 'c']);
      expect(w.contains('b'), isFalse);
    });

    test('reset restores the never-loaded state', () {
      final w = PagedWindow<String>(pageSize: 2, idOf: (s) => s);
      w.appendPage(['a']);
      expect(w.hasMore, isFalse);
      w.reset();
      expect(w.length, 0);
      expect(w.hasMore, isTrue);
      expect(w.started, isFalse);
    });
  });

  group('AppState paged browse (live ingest, no backend)', () {
    test('pages merge deduplicated and rebuild legacy items from the '
        'loaded window only', () {
      final s = AppState()..enableLiveMode();
      expect(s.listings, isEmpty);

      s.applyListingPage(ListingSection.items, _page(0, 24, base));
      expect(s.listings.length, 24);
      expect(s.hasMoreListingsFor(ListingSection.items), isTrue);
      // Legacy items are converted from the loaded window only.
      expect(s.items.length, 24);

      // Next page overlaps by 2 ids (source shifted) — no duplicates:
      // 24 loaded + 8 genuinely new rows from the 10-row page.
      s.applyListingPage(ListingSection.items, _page(22, 10, base));
      final ids = s.listings.map((l) => l.id).toList();
      expect(ids.toSet().length, ids.length);
      expect(s.listings.length, 32);
      // Short page (10 < 24) ends the section.
      expect(s.hasMoreListingsFor(ListingSection.items), isFalse);
      expect(s.items.length, 32);
    });

    test('sections page independently', () {
      final s = AppState()..enableLiveMode();
      s.applyListingPage(ListingSection.items, _page(0, 3, base));
      expect(s.hasMoreListingsFor(ListingSection.items), isFalse);
      // Untouched sections still have their first page to load.
      expect(s.hasMoreListingsFor(ListingSection.vehicles), isTrue);
      expect(
        s.listings.where((l) => l.section == ListingSection.items).length,
        3,
      );
    });

    test(
      'loadMoreListings at the end / without a backend is a no-op',
      () async {
        final s = AppState()..enableLiveMode();
        s.applyListingPage(ListingSection.items, _page(0, 2, base));
        expect(s.hasMoreListingsFor(ListingSection.items), isFalse);
        await s.loadMoreListings(section: ListingSection.items);
        expect(s.listings.length, 2);
        // Even with pages remaining, no Firebase in tests => no change.
        await s.loadMoreListings(section: ListingSection.vehicles);
        expect(
          s.listings.where((l) => l.section == ListingSection.vehicles),
          isEmpty,
        );
      },
    );

    test('canonical page size constant matches the browse contract', () {
      expect(kListingPageSize, 24);
      expect(kNotificationLimit, 50);
      expect(kMessageThreadPageSize, 100);
    });
  });

  group('on-demand profiles / reviews in local mode', () {
    test('ensureUserLoaded reads the seed cache without any fetch', () async {
      final s = AppState();
      final maya = await s.ensureUserLoaded('u-maya');
      expect(maya?.id, 'u-maya');
      expect(await s.ensureUserLoaded('u-nobody'), isNull);
      expect(await s.ensureUserLoaded(''), isNull);
    });

    test('local mode paging is inert: seed catalog stays whole', () async {
      final s = AppState();
      final before = s.listings.length;
      expect(s.hasMoreListingsFor(ListingSection.items), isFalse);
      await s.loadMoreListings(section: ListingSection.items);
      expect(s.listings.length, before);
      // applyListingPage only applies in live mode.
      s.applyListingPage(ListingSection.items, _page(0, 5, base));
      expect(s.listings.length, before);
    });

    test('live-mode ensureUserLoaded for an unknown id resolves null '
        '(no backend in tests) instead of crashing', () async {
      final s = AppState()..enableLiveMode();
      expect(await s.ensureUserLoaded('ghost'), isNull);
      expect(s.users, isEmpty);
    });

    test('live-mode review fetches are inert without a backend', () async {
      final s = AppState()..enableLiveMode();
      await s.ensureReviewsForUser('u-maya');
      await s.ensureReviewsForListing('l-1');
      expect(s.reviews, isEmpty);
    });
  });
}
