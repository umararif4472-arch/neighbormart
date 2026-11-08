import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/data/models/borrow_request.dart';
import 'package:neighbor_mart/data/models/firestore_maps.dart';
import 'package:neighbor_mart/data/models/listing.dart';
import 'package:neighbor_mart/data/models/message.dart';
import 'package:neighbor_mart/data/models/user.dart';
import 'package:neighbor_mart/data/services/live_sync.dart';
import 'package:neighbor_mart/state/app_state.dart';

ListingLocation get _loc =>
    const ListingLocation(lat: 31.5, lng: 74.3, city: 'Lahore', area: 'DHA');

void main() {
  group('listing Firestore round-trip (web document shape)', () {
    test('items listing survives toMap -> fromMap', () {
      final listing = ItemListing(
        id: 'l1',
        ownerId: 'u1',
        listingType: ListingType.rent,
        title: 'Drill',
        description: 'Cordless drill',
        price: 500,
        priceUnit: PriceUnit.day,
        photos: const [
          'https://res.cloudinary.com/sgwcguwo/image/upload/v1/x.jpg',
        ],
        location: _loc,
        status: ListingStatus.active,
        createdAt: DateTime(2026, 11, 1, 10),
        updatedAt: DateTime(2026, 11, 2, 10),
        views: 3,
        details: const ItemListingDetails(
          category: 'Tools',
          condition: 'Good',
          depositAmount: 2000,
          maxDurationDays: 5,
          pickupPreference: 'either',
          pickupInstructions: 'Call first',
        ),
      );
      final back = ListingFirestoreMap.fromMap('l1', listing.toFirestoreMap());
      expect(back, isA<ItemListing>());
      final item = back as ItemListing;
      expect(item.title, 'Drill');
      expect(item.price, 500);
      expect(item.details.depositAmount, 2000);
      expect(item.details.maxDurationDays, 5);
      expect(listing.toFirestoreMap()['section'], 'items');
    });

    test('vehicle, property and arena listings round-trip', () {
      final vehicle = VehicleListing(
        id: 'l2',
        ownerId: 'u1',
        listingType: ListingType.rent,
        title: 'Corolla',
        description: 'Sedan',
        price: 8000,
        priceUnit: PriceUnit.day,
        location: _loc,
        createdAt: DateTime(2026, 11, 1),
        updatedAt: DateTime(2026, 11, 1),
        details: const VehicleDetails(
          make: 'Toyota',
          model: 'Corolla',
          year: 2021,
          mileageKm: 45000,
          fuelType: VehicleFuelType.petrol,
          transmission: VehicleTransmission.automatic,
          condition: 'Excellent',
          withDriver: false,
          registrationCity: 'Lahore',
        ),
      );
      final vBack = ListingFirestoreMap.fromMap('l2', vehicle.toFirestoreMap());
      expect(vBack, isA<VehicleListing>());
      expect((vBack as VehicleListing).details.year, 2021);

      final property = PropertyListing(
        id: 'l3',
        ownerId: 'u1',
        listingType: ListingType.rent,
        title: '1 Kanal house',
        description: 'DHA Phase 5',
        price: 150000,
        priceUnit: PriceUnit.month,
        location: _loc,
        createdAt: DateTime(2026, 11, 1),
        updatedAt: DateTime(2026, 11, 1),
        details: PropertyDetails(
          propertyType: PropertyType.house,
          bedrooms: 5,
          bathrooms: 6,
          areaSize: 1,
          areaUnit: PropertyAreaUnit.kanal,
          furnished: true,
          floor: 0,
          amenities: const ['Generator'],
          availableFrom: DateTime(2026, 12, 1),
        ),
      );
      final pBack = ListingFirestoreMap.fromMap(
        'l3',
        property.toFirestoreMap(),
      );
      expect(pBack, isA<PropertyListing>());
      expect((pBack as PropertyListing).details.bedrooms, 5);

      final arena = ArenaListing(
        id: 'l4',
        ownerId: 'u1',
        title: 'Futsal court',
        description: 'Astro turf',
        price: 3000,
        priceUnit: PriceUnit.hour,
        location: _loc,
        createdAt: DateTime(2026, 11, 1),
        updatedAt: DateTime(2026, 11, 1),
        details: const ArenaDetails(
          sportTypes: ['Futsal'],
          surface: 'Astro turf',
          capacity: 40,
          opensAt: '08:00',
          closesAt: '23:00',
          slotMinutes: 60,
          facilities: ArenaFacilities(
            floodlights: true,
            parking: true,
            washrooms: true,
            changingRooms: false,
          ),
          advanceBooking: ArenaAdvanceBooking(
            maxAdvanceDays: 14,
            minAdvanceHours: 2,
          ),
        ),
      );
      final map = arena.toFirestoreMap();
      expect(map['section'], 'arenas');
      final aBack = ListingFirestoreMap.fromMap('l4', map);
      expect(aBack, isA<ArenaListing>());
      expect((aBack as ArenaListing).details.opensAt, '08:00');
      expect(aBack.details.facilities.floodlights, isTrue);
    });
  });

  group('request / message / review maps', () {
    test('request round-trips with slot, offer and denormalized owner', () {
      final req = BorrowRequest(
        id: 'r1',
        itemId: 'l4',
        borrowerId: 'u-b',
        period: BorrowPeriod(
          start: DateTime(2026, 11, 10),
          end: DateTime(2026, 11, 10),
        ),
        note: 'See you there',
        status: 'pending',
        offerAmount: 2500,
        slot: const ArenaSlot(
          date: '2026-11-10',
          startTime: '18:00',
          endTime: '19:00',
        ),
        createdAt: DateTime(2026, 11, 8, 9, 30),
      );
      final map = req.toFirestoreMap('u-owner');
      expect(map['listingId'], 'l4');
      expect(map['ownerId'], 'u-owner');
      expect(map['period'], {'start': '2026-11-10', 'end': '2026-11-10'});
      final back = BorrowRequestFirestoreMap.fromMap('r1', map);
      expect(back.slot?.startTime, '18:00');
      expect(back.offerAmount, 2500);
      expect(back.borrowerId, 'u-b');
    });

    test('message and review maps match the web shapes', () {
      final msg = Message(
        id: 'm1',
        requestId: 'r1',
        senderId: 'u-b',
        body: 'Hi!',
        createdAt: DateTime(2026, 11, 8, 10),
      );
      final msgMap = msg.toFirestoreMap();
      expect(msgMap.keys, containsAll(['requestId', 'senderId', 'body']));
      expect(MessageFirestoreMap.fromMap('m1', msgMap).body, 'Hi!');

      final review = Review(
        id: 'x',
        requestId: 'r1',
        itemId: 'l4',
        reviewerId: 'u-b',
        revieweeId: 'u-owner',
        reviewerRole: 'borrower',
        rating: 5,
        comment: 'Great',
        createdAt: DateTime(2026, 11, 9),
      );
      expect(ReviewFirestoreMap.docId('r1', 'u-b'), 'r1_u-b');
      final revMap = review.toFirestoreMap();
      expect(revMap['listingId'], 'l4');
      expect(ReviewFirestoreMap.fromMap('x', revMap).rating, 5);
    });
  });

  group('rate window (web checkWindow port)', () {
    final now = DateTime(2026, 11, 8, 12);
    test('fresh window starts at 1', () {
      final d = checkRateWindow(
        count: 0,
        windowStart: null,
        now: now,
        limit: 10,
        window: const Duration(hours: 24),
      );
      expect(d.allowed, isTrue);
      expect(d.count, 1);
      expect(d.windowStart, now);
    });
    test('increments inside the window and blocks at the limit', () {
      final start = now.subtract(const Duration(hours: 2));
      final d = checkRateWindow(
        count: 9,
        windowStart: start,
        now: now,
        limit: 10,
        window: const Duration(hours: 24),
      );
      expect(d.count, 10);
      final blocked = checkRateWindow(
        count: 10,
        windowStart: start,
        now: now,
        limit: 10,
        window: const Duration(hours: 24),
      );
      expect(blocked.allowed, isFalse);
    });
    test('an expired window resets', () {
      final d = checkRateWindow(
        count: 10,
        windowStart: now.subtract(const Duration(hours: 25)),
        now: now,
        limit: 10,
        window: const Duration(hours: 24),
      );
      expect(d.allowed, isTrue);
      expect(d.count, 1);
    });
  });

  group('live mode scaffolding (no Firebase in tests)', () {
    test('enableLiveMode clears every seed collection', () {
      final s = AppState();
      expect(s.listings, isNotEmpty); // seeded local mode
      s.enableLiveMode();
      expect(s.liveMode, isTrue);
      expect(s.listings, isEmpty);
      expect(s.items, isEmpty);
      expect(s.users, isEmpty);
      expect(s.requests, isEmpty);
      expect(s.messages, isEmpty);
      expect(s.isLoggedIn, isFalse);
    });

    test('demo affordances are inert in live mode', () {
      final s = AppState()..enableLiveMode();
      expect(s.login('maya.chen@example.com', 'x'), isNotNull);
      s.loginAs(s.userById('anything'));
      expect(s.isLoggedIn, isFalse);
      s.resetDemoData();
      expect(s.listings, isEmpty); // still empty — no seed came back
      // userById on an empty database must not crash.
      expect(s.userById('missing').name, 'Neighbor');
    });

    test('pre-request chat is not persisted in live mode', () {
      final s = AppState()..enableLiveMode();
      s.sendUserMessage('someone', 'hello');
      s.sendItemMessage('listing', 'someone', 'hello');
      expect(s.messages, isEmpty);
    });
  });
}
