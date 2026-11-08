import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/data/models/listing.dart';

/// The maps below are shaped exactly like the documents the WEB client
/// writes to Firestore (see src/services/live/*) — these tests pin the
/// cross-client contract: same docs, both apps.
void main() {
  group('ListingFirestoreMap.fromMap', () {
    test('parses a vehicle document', () {
      final listing = ListingFirestoreMap.fromMap('v-civic', {
        'ownerId': 'u-marcus',
        'section': 'vehicles',
        'listingType': 'sell',
        'title': 'Honda Civic Oriel 2021',
        'description': 'Full option.',
        'price': 6850000,
        'currency': 'PKR',
        'priceUnit': 'fixed',
        'negotiable': true,
        'photos': <String>[],
        'location': {
          'lat': 31.43,
          'lng': 74.27,
          'city': 'Lahore',
          'area': 'Bahria Town',
        },
        'status': 'active',
        'createdAt': '2026-09-18T10:00:00.000Z',
        'updatedAt': '2026-09-18T10:00:00.000Z',
        'views': 890,
        'details': {
          'make': 'Honda',
          'model': 'Civic Oriel',
          'year': 2021,
          'mileageKm': 38000,
          'fuelType': 'petrol',
          'transmission': 'automatic',
          'condition': 'Excellent',
          'withDriver': false,
          'registrationCity': 'Lahore',
        },
      });

      expect(listing, isA<VehicleListing>());
      final vehicle = listing as VehicleListing;
      expect(vehicle.details.make, 'Honda');
      expect(vehicle.details.transmission, VehicleTransmission.automatic);
      expect(vehicle.price, 6850000);
      expect(vehicle.location.city, 'Lahore');
    });

    test('parses an arena document with nested opening hours', () {
      final listing = ListingFirestoreMap.fromMap('a-football-turf', {
        'ownerId': 'u-tom',
        'section': 'arenas',
        'listingType': 'rent',
        'title': 'KickOff Arena — FIFA-size Football Turf',
        'description': 'Floodlit turf.',
        'price': 6500,
        'currency': 'PKR',
        'priceUnit': 'hour',
        'negotiable': false,
        'photos': <String>[],
        'location': {
          'lat': 31.47,
          'lng': 74.27,
          'city': 'Lahore',
          'area': 'Gulberg',
        },
        'status': 'active',
        'createdAt': '2026-09-24T10:00:00.000Z',
        'updatedAt': '2026-09-24T10:00:00.000Z',
        'views': 640,
        'details': {
          'sportTypes': ['Football'],
          'surface': 'Astro turf (FIFA-grade)',
          'capacity': 60,
          'openingHours': {'opens': '06:00', 'closes': '02:00'},
          'slotMinutes': 90,
          'facilities': {
            'floodlights': true,
            'parking': true,
            'washrooms': true,
            'changingRooms': true,
          },
          'advanceBooking': {'maxAdvanceDays': 21, 'minAdvanceHours': 4},
        },
      });

      expect(listing, isA<ArenaListing>());
      final arena = listing as ArenaListing;
      expect(arena.details.opensAt, '06:00');
      expect(arena.details.slotMinutes, 90);
      expect(arena.details.facilities.floodlights, isTrue);
      expect(arena.details.advanceBooking.maxAdvanceDays, 21);
    });

    test('parses a property document with nullable beds/baths', () {
      final listing = ListingFirestoreMap.fromMap('p-bahria-plot', {
        'ownerId': 'u-marcus',
        'section': 'properties',
        'listingType': 'sell',
        'title': '10 Marla Corner Plot — Bahria Town',
        'description': 'Prime block.',
        'price': 9800000,
        'currency': 'PKR',
        'priceUnit': 'fixed',
        'negotiable': true,
        'photos': <String>[],
        'location': {
          'lat': 31.43,
          'lng': 74.27,
          'city': 'Lahore',
          'area': 'Bahria Town',
        },
        'status': 'active',
        'createdAt': '2026-09-29T10:00:00.000Z',
        'updatedAt': '2026-09-29T10:00:00.000Z',
        'views': 430,
        'details': {
          'propertyType': 'plot',
          'bedrooms': null,
          'bathrooms': null,
          'areaSize': 10,
          'areaUnit': 'marla',
          'furnished': false,
          'floor': null,
          'amenities': ['Corner', 'Near park'],
          'availableFrom': '2026-11-08T10:00:00.000Z',
        },
      });

      expect(listing, isA<PropertyListing>());
      final property = listing as PropertyListing;
      expect(property.details.bedrooms, isNull);
      expect(property.details.areaUnit, PropertyAreaUnit.marla);
    });
  });
}
