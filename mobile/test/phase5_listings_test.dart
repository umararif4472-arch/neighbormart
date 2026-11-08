import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/data/models/borrow_request.dart';
import 'package:neighbor_mart/data/models/listing.dart';
import 'package:neighbor_mart/state/app_state.dart';

/// Phase 5 Flutter mirror: Lahore seeds, generalized listing requests
/// (arena slots, sell offers), deal completion, and owner management.
void main() {
  group('seeds', () {
    test('all seed users live in Lahore now', () {
      final s = AppState();
      expect(s.users.every((u) => u.city == 'Lahore'), isTrue);
      expect(
        s.users.map((u) => u.neighborhood),
        containsAll(['DHA Phase 5', 'Gulberg', 'Johar Town', 'Bahria Town']),
      );
    });

    test('the unified catalog holds all four sections', () {
      final s = AppState();
      expect(s.listings.length, 35);
      expect(
        s.listings.map((l) => l.section).toSet(),
        containsAll(ListingSection.values),
      );
    });

    test('phase 5 demo requests are seeded (arena slot + civic offer)', () {
      final s = AppState();
      final arena = s.requests.firstWhere(
        (r) => r.id == 'req-arena-padel-next',
      );
      expect(arena.slot?.startTime, '18:00');
      expect(arena.status, 'approved');
      final offer = s.requests.firstWhere((r) => r.id == 'req-offer-civic');
      expect(offer.offerAmount, 6500000);
    });
  });

  group('arena booking', () {
    test('a busy slot collides; the neighbouring slot books fine', () {
      final s = AppState(); // current user: Maya
      final padel = s.listingByIdOrNull('a-padel')!;
      final tomorrow = DateTime.now().add(const Duration(days: 1));
      String pad(int n) => n.toString().padLeft(2, '0');
      final date =
          '${tomorrow.year}-${pad(tomorrow.month)}-${pad(tomorrow.day)}';
      final day = DateTime(tomorrow.year, tomorrow.month, tomorrow.day);

      final clash = s.createListingRequest(
        listing: padel,
        period: BorrowPeriod(start: day, end: day),
        slot: ArenaSlot(date: date, startTime: '18:00', endTime: '19:00'),
      );
      expect(clash, isNotNull); // Maya's approved seed booking holds 18:00

      final ok = s.createListingRequest(
        listing: padel,
        period: BorrowPeriod(start: day, end: day),
        slot: ArenaSlot(date: date, startTime: '20:00', endTime: '21:00'),
      );
      expect(ok, isNull);
      expect(
        s.requests.first.slot?.startTime,
        '20:00',
      ); // newest request is first
    });
  });

  group('sell deals', () {
    test('offer → approve reserves → owner completes → sold + stat', () {
      final s = AppState();
      // Act as Marcus (the Civic's owner) via a second state is overkill;
      // drive the flow as Maya offering, then complete as the owner by
      // switching the session user the way loginAs does in tests.
      final civic = s.listingByIdOrNull('v-civic')!;
      final today = DateTime.now();
      final err = s.createListingRequest(
        listing: civic,
        period: BorrowPeriod(start: today, end: today),
        offerAmount: 6600000,
      );
      expect(err, isNull);
      final req = s.requests.firstWhere(
        (r) => r.itemId == 'v-civic' && r.offerAmount == 6600000,
      );

      s.approveRequest(req.id);
      expect(s.listingByIdOrNull('v-civic')!.status, ListingStatus.reserved);

      final marcusSalesBefore = s.userById('u-marcus').stats.salesCompleted;
      s.markCompleted(req.id);
      expect(s.requests.firstWhere((r) => r.id == req.id).status, 'completed');
      expect(s.listingByIdOrNull('v-civic')!.status, ListingStatus.sold);
      expect(
        s.userById('u-marcus').stats.salesCompleted,
        marcusSalesBefore + 1,
      );
    });

    test('a non-negotiable listing rejects a low offer', () {
      final s = AppState();
      final now = DateTime.now();
      // Every seed sell listing happens to be negotiable, so add a
      // fixed-price one (owned by Diego) to exercise the rule.
      final fixed = VehicleListing(
        id: 'v-fixed-test',
        ownerId: 'u-diego',
        listingType: ListingType.sell,
        title: 'Fixed-price test car',
        description: 'A car listed at a firm price for the rule test.',
        price: 900000,
        priceUnit: PriceUnit.fixed,
        negotiable: false,
        location: const ListingLocation(
          lat: 31.505,
          lng: 74.39,
          city: 'Lahore',
          area: 'Cantt',
        ),
        createdAt: now,
        updatedAt: now,
        details: const VehicleDetails(
          make: 'Suzuki',
          model: 'Cultus',
          year: 2019,
          mileageKm: 60000,
          fuelType: VehicleFuelType.petrol,
          transmission: VehicleTransmission.manual,
          condition: 'Good',
          withDriver: false,
          registrationCity: 'Lahore',
        ),
      );
      s.addListing(fixed);
      final err = s.createListingRequest(
        listing: fixed,
        period: BorrowPeriod(start: now, end: now),
        offerAmount: fixed.price - 1,
      );
      expect(err, isNotNull);
      final ok = s.createListingRequest(
        listing: fixed,
        period: BorrowPeriod(start: now, end: now),
        offerAmount: fixed.price,
      );
      expect(ok, isNull);
    });
  });

  group('owner management', () {
    test('pause/resume follow the status machine; sold is terminal-ish', () {
      final s = AppState();
      // Maya owns p-gulberg-flat in the seeds.
      final flat = s.myListings.firstWhere((l) => l.id == 'p-gulberg-flat');
      expect(flat.status, ListingStatus.active);
      expect(s.setListingStatus(flat.id, ListingStatus.paused), isTrue);
      expect(s.listingByIdOrNull(flat.id)!.status, ListingStatus.paused);
      expect(s.setListingStatus(flat.id, ListingStatus.sold), isFalse);
      expect(s.setListingStatus(flat.id, ListingStatus.active), isTrue);
    });

    test('the item adapter projects borrow terms faithfully', () {
      final s = AppState();
      final drill = s.listingByIdOrNull('i-drill')! as ItemListing;
      final item = itemFromListing(drill);
      expect(item.id, 'i-drill');
      expect(item.borrowTerms.maxDurationDays, drill.details.maxDurationDays);
      expect(item.isAvailable, drill.status == ListingStatus.active);
    });
  });
}
