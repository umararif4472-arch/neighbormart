import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/data/mock/seed_listings.dart';
import 'package:neighbor_mart/data/models/listing.dart';

void main() {
  final now = DateTime(2026, 11, 8);
  final listings = seedListings(now: now);

  group('seedListings', () {
    test('has 35 listings: 19 items, 5 vehicles, 6 properties, 5 arenas', () {
      expect(listings, hasLength(35));
      int count(ListingSection s) =>
          listings.where((l) => l.section == s).length;
      expect(count(ListingSection.items), 19);
      expect(count(ListingSection.vehicles), 5);
      expect(count(ListingSection.properties), 6);
      expect(count(ListingSection.arenas), 5);
    });

    test('ids are unique and every listing is PKR in Lahore', () {
      expect(listings.map((l) => l.id).toSet(), hasLength(35));
      for (final l in listings) {
        expect(l.currency, 'PKR', reason: l.id);
        expect(l.location.city, 'Lahore', reason: l.id);
      }
    });

    test('subclasses narrow to their section details', () {
      final drill = listings.firstWhere((l) => l.id == 'i-drill');
      expect(drill, isA<ItemListing>());
      expect((drill as ItemListing).details.category, 'Tools');
      expect(drill.details.depositAmount, 5000);
      expect(drill.listingType, ListingType.borrow);
      expect(drill.status, ListingStatus.rented);

      final civic = listings.firstWhere((l) => l.id == 'v-civic');
      expect(civic, isA<VehicleListing>());
      expect((civic as VehicleListing).details.make, 'Honda');
      expect(civic.price, 6850000);
      expect(civic.listingType, ListingType.sell);
      expect(civic.priceUnit, PriceUnit.fixed);
      expect(civic.negotiable, isTrue);

      final plot = listings.firstWhere((l) => l.id == 'p-bahria-plot');
      expect(plot, isA<PropertyListing>());
      expect((plot as PropertyListing).details.bedrooms, isNull);
      expect(plot.details.areaUnit, PropertyAreaUnit.marla);

      final turf = listings.firstWhere((l) => l.id == 'a-football-turf');
      expect(turf, isA<ArenaListing>());
      expect((turf as ArenaListing).details.slotMinutes, 90);
      expect(turf.listingType, ListingType.rent);
      expect(turf.priceUnit, PriceUnit.hour);
    });

    test('rent items carry a daily price; borrows are free', () {
      final tent = listings.firstWhere((l) => l.id == 'i-tent');
      expect(tent.listingType, ListingType.rent);
      expect(tent.price, 1500);
      expect(tent.priceUnit, PriceUnit.day);

      final mixer = listings.firstWhere((l) => l.id == 'i-mixer');
      expect(mixer.listingType, ListingType.borrow);
      expect(mixer.price, 0);
    });

    test('visibility follows status', () {
      final hiace = listings.firstWhere((l) => l.id == 'v-hiace');
      expect((hiace as VehicleListing).details.withDriver, isTrue);
      expect(hiace.status, ListingStatus.rented);
      // Rented listings stay visible with a badge; paused ones hide.
      expect(hiace.isVisible, isTrue);

      final studio = listings.firstWhere((l) => l.id == 'p-johar-studio');
      expect(studio.status, ListingStatus.reserved);
      expect(studio.isVisible, isTrue);

      final canner = listings.firstWhere((l) => l.id == 'i-canner');
      expect(canner.status, ListingStatus.paused);
      expect(canner.isVisible, isFalse);
    });
  });
}
