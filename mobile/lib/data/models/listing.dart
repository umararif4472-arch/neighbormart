import 'user.dart';
import 'item.dart';

/// The unified Listing model (Phase 2) — one type for everything posted
/// on NeighborMart, replacing the borrow-only [Item] as the data model
/// (existing screens still render [Item]; they migrate in Phase 5).
///
/// Mirrors web src/types/listing.ts: common fields live on [Listing],
/// and each section carries its own details class, so a vehicle can
/// never grow bedrooms and a property can never grow a fuel type.
/// Dart subclasses play the role of the TS discriminated union —
/// switch on `listing.section` or use `is ItemListing` to narrow.
///
/// Deal kinds ([ListingType]) are orthogonal to sections:
///   borrow — free, the original NeighborMart flow
///   rent   — paid per priceUnit (hour/day/week/month)
///   sell   — one fixed price
/// Arenas are always rent (booked by slot); the section experiences
/// and booking rules arrive in Phase 5 — this phase defines the data.

enum ListingSection { items, vehicles, properties, arenas }

enum ListingType { borrow, rent, sell }

enum ListingStatus { active, reserved, rented, sold, paused, removed }

/// The listing status machine (mirrors web listingStatus.ts). One
/// transition table so services, rules, and the owner dashboard all
/// enforce exactly the same moves.
const Map<ListingStatus, List<ListingStatus>> kListingStatusTransitions = {
  ListingStatus.active: [
    ListingStatus.reserved,
    ListingStatus.rented,
    ListingStatus.sold,
    ListingStatus.paused,
    ListingStatus.removed,
  ],
  ListingStatus.reserved: [
    ListingStatus.active,
    ListingStatus.rented,
    ListingStatus.sold,
    ListingStatus.removed,
  ],
  ListingStatus.rented: [ListingStatus.active, ListingStatus.removed],
  ListingStatus.sold: [ListingStatus.removed],
  ListingStatus.paused: [ListingStatus.active, ListingStatus.removed],
  ListingStatus.removed: [],
};

bool canTransitionListingStatus(ListingStatus from, ListingStatus to) {
  if (from == to) return false;
  return kListingStatusTransitions[from]?.contains(to) ?? false;
}

/// What [Listing.price] is charged per. fixed = one-off (sell, free borrow).
enum PriceUnit { hour, day, week, month, fixed }

/// Canonical item categories — mirrors web ITEM_CATEGORIES. (The legacy
/// Flutter-only categories 'Cars & Vehicles', 'Houses & Places' and
/// 'Indoor Sports' became sections in Phase 2, not categories.)
const List<String> kListingItemCategories = [
  'Tools',
  'Outdoor & Camping',
  'Party & Events',
  'Kitchen',
  'Electronics',
  'Sports',
  'Kids & Baby',
  'Other',
];

/// Where a listing is: map coordinate plus human labels for cards/filters.
class ListingLocation {
  final double lat;
  final double lng;
  final String city;
  final String area;
  const ListingLocation({
    required this.lat,
    required this.lng,
    required this.city,
    required this.area,
  });

  LatLng get latLng => LatLng(lat, lng);
}

abstract class Listing {
  final String id;
  final String ownerId;
  final ListingType listingType;
  final String title;
  final String description;

  /// Amount in [currency] major units (e.g. rupees). 0 for free borrows.
  final int price;

  /// ISO-style currency code; configurable per deployment, default PKR.
  final String currency;
  final PriceUnit priceUnit;
  final bool negotiable;

  /// Photo URLs. May be empty — UI renders a section/category tile instead.
  final List<String> photos;
  final ListingLocation location;
  final ListingStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// Lifetime view counter (owner dashboard stats).
  final int views;

  const Listing({
    required this.id,
    required this.ownerId,
    required this.listingType,
    required this.title,
    required this.description,
    required this.price,
    this.currency = 'PKR',
    required this.priceUnit,
    this.negotiable = false,
    this.photos = const [],
    required this.location,
    this.status = ListingStatus.active,
    required this.createdAt,
    required this.updatedAt,
    this.views = 0,
  });

  ListingSection get section;

  /// True when the listing shows in browse results (mirrors web
  /// isListingVisible: everything except paused and removed — rented
  /// and sold listings stay visible with a status badge).
  bool get isVisible =>
      status != ListingStatus.removed && status != ListingStatus.paused;
}

// --- Items & Tools -----------------------------------------------------------

class ItemListingDetails {
  /// One of [kListingItemCategories].
  final String category;

  /// Free-text condition notes ("Well loved but runs great").
  final String condition;

  /// Optional refundable deposit in the listing currency. null = none.
  final int? depositAmount;

  /// Borrow/rent terms — only meaningful for borrow & rent item listings.
  final int maxDurationDays;

  /// pickup | drop-off | either
  final String pickupPreference;
  final String pickupInstructions;
  const ItemListingDetails({
    required this.category,
    required this.condition,
    required this.depositAmount,
    required this.maxDurationDays,
    required this.pickupPreference,
    required this.pickupInstructions,
  });
}

class ItemListing extends Listing {
  final ItemListingDetails details;
  const ItemListing({
    required super.id,
    required super.ownerId,
    required super.listingType,
    required super.title,
    required super.description,
    required super.price,
    super.currency,
    required super.priceUnit,
    super.negotiable,
    super.photos,
    required super.location,
    super.status,
    required super.createdAt,
    required super.updatedAt,
    super.views,
    required this.details,
  });

  @override
  ListingSection get section => ListingSection.items;
}

// --- Vehicles ----------------------------------------------------------------

enum VehicleFuelType { petrol, diesel, cng, hybrid, electric }

enum VehicleTransmission { manual, automatic }

class VehicleDetails {
  final String make;
  final String model;
  final int year;
  final int mileageKm;
  final VehicleFuelType fuelType;
  final VehicleTransmission transmission;

  /// Free-text condition notes.
  final String condition;

  /// Rent listings: the owner (or their driver) drives.
  final bool withDriver;
  final String registrationCity;
  const VehicleDetails({
    required this.make,
    required this.model,
    required this.year,
    required this.mileageKm,
    required this.fuelType,
    required this.transmission,
    required this.condition,
    required this.withDriver,
    required this.registrationCity,
  });
}

class VehicleListing extends Listing {
  final VehicleDetails details;
  const VehicleListing({
    required super.id,
    required super.ownerId,
    required super.listingType,
    required super.title,
    required super.description,
    required super.price,
    super.currency,
    required super.priceUnit,
    super.negotiable,
    super.photos,
    required super.location,
    super.status,
    required super.createdAt,
    required super.updatedAt,
    super.views,
    required this.details,
  });

  @override
  ListingSection get section => ListingSection.vehicles;
}

// --- Properties ---------------------------------------------------------------

enum PropertyType { house, apartment, room, plot, shop, office }

enum PropertyAreaUnit { marla, kanal, sqft, sqyd }

class PropertyDetails {
  final PropertyType propertyType;

  /// null for plots/shops where bedrooms don't apply.
  final int? bedrooms;
  final int? bathrooms;
  final num areaSize;
  final PropertyAreaUnit areaUnit;
  final bool furnished;

  /// null for houses/plots (ground) — 0 means ground floor.
  final int? floor;
  final List<String> amenities;
  final DateTime availableFrom;
  const PropertyDetails({
    required this.propertyType,
    required this.bedrooms,
    required this.bathrooms,
    required this.areaSize,
    required this.areaUnit,
    required this.furnished,
    required this.floor,
    this.amenities = const [],
    required this.availableFrom,
  });
}

class PropertyListing extends Listing {
  final PropertyDetails details;
  const PropertyListing({
    required super.id,
    required super.ownerId,
    required super.listingType,
    required super.title,
    required super.description,
    required super.price,
    super.currency,
    required super.priceUnit,
    super.negotiable,
    super.photos,
    required super.location,
    super.status,
    required super.createdAt,
    required super.updatedAt,
    super.views,
    required this.details,
  });

  @override
  ListingSection get section => ListingSection.properties;
}

// --- Sports Arenas & Venues -----------------------------------------------------

class ArenaFacilities {
  final bool floodlights;
  final bool parking;
  final bool washrooms;
  final bool changingRooms;
  const ArenaFacilities({
    required this.floodlights,
    required this.parking,
    required this.washrooms,
    required this.changingRooms,
  });
}

class ArenaAdvanceBooking {
  /// How far ahead a slot may be booked, in days.
  final int maxAdvanceDays;

  /// Minimum notice before a slot starts, in hours.
  final int minAdvanceHours;
  const ArenaAdvanceBooking({
    required this.maxAdvanceDays,
    required this.minAdvanceHours,
  });
}

class ArenaDetails {
  final List<String> sportTypes;

  /// e.g. 'Natural grass', 'Astro turf', 'Hard court', 'Indoor wooden'.
  final String surface;

  /// Players/spectators the venue holds.
  final int capacity;

  /// Local 'HH:mm' strings.
  final String opensAt;
  final String closesAt;

  /// Bookable slot length in minutes (e.g. 60).
  final int slotMinutes;
  final ArenaFacilities facilities;
  final ArenaAdvanceBooking advanceBooking;
  const ArenaDetails({
    required this.sportTypes,
    required this.surface,
    required this.capacity,
    required this.opensAt,
    required this.closesAt,
    required this.slotMinutes,
    required this.facilities,
    required this.advanceBooking,
  });
}

class ArenaListing extends Listing {
  final ArenaDetails details;
  const ArenaListing({
    required super.id,
    required super.ownerId,
    super.listingType = ListingType.rent,
    required super.title,
    required super.description,
    required super.price,
    super.currency,
    required super.priceUnit,
    super.negotiable,
    super.photos,
    required super.location,
    super.status,
    required super.createdAt,
    required super.updatedAt,
    super.views,
    required this.details,
  });

  @override
  ListingSection get section => ListingSection.arenas;
}

// ---------------------------------------------------------------------------
// Status copy + legacy Item adapter (Phase 5)
// ---------------------------------------------------------------------------

/// A copy of [listing] with a new status. Listings are immutable and
/// each subclass carries its own details, so the copy is rebuilt per
/// subclass — one place, used by owner management actions.
Listing listingWithStatus(Listing listing, ListingStatus status) {
  switch (listing) {
    case ItemListing l:
      return ItemListing(
        id: l.id,
        ownerId: l.ownerId,
        listingType: l.listingType,
        title: l.title,
        description: l.description,
        price: l.price,
        currency: l.currency,
        priceUnit: l.priceUnit,
        negotiable: l.negotiable,
        photos: l.photos,
        location: l.location,
        status: status,
        createdAt: l.createdAt,
        updatedAt: DateTime.now(),
        views: l.views,
        details: l.details,
      );
    case VehicleListing l:
      return VehicleListing(
        id: l.id,
        ownerId: l.ownerId,
        listingType: l.listingType,
        title: l.title,
        description: l.description,
        price: l.price,
        currency: l.currency,
        priceUnit: l.priceUnit,
        negotiable: l.negotiable,
        photos: l.photos,
        location: l.location,
        status: status,
        createdAt: l.createdAt,
        updatedAt: DateTime.now(),
        views: l.views,
        details: l.details,
      );
    case PropertyListing l:
      return PropertyListing(
        id: l.id,
        ownerId: l.ownerId,
        listingType: l.listingType,
        title: l.title,
        description: l.description,
        price: l.price,
        currency: l.currency,
        priceUnit: l.priceUnit,
        negotiable: l.negotiable,
        photos: l.photos,
        location: l.location,
        status: status,
        createdAt: l.createdAt,
        updatedAt: DateTime.now(),
        views: l.views,
        details: l.details,
      );
    case ArenaListing l:
      return ArenaListing(
        id: l.id,
        ownerId: l.ownerId,
        listingType: l.listingType,
        title: l.title,
        description: l.description,
        price: l.price,
        currency: l.currency,
        priceUnit: l.priceUnit,
        negotiable: l.negotiable,
        photos: l.photos,
        location: l.location,
        status: status,
        createdAt: l.createdAt,
        updatedAt: DateTime.now(),
        views: l.views,
        details: l.details,
      );
  }
  // Unreachable: the switch is exhaustive over the sealed-by-convention
  // subclass set. Kept for the compiler.
  throw StateError('Unknown listing subtype: ${listing.runtimeType}');
}

/// Project an items-section [Listing] onto the legacy [Item] model so
/// the pre-Phase-5 screens (item detail, activity, chat) keep working
/// unchanged for items — ids coincide, so requests resolve across both.
Item itemFromListing(ItemListing listing) {
  final d = listing.details;
  return Item(
    id: listing.id,
    ownerId: listing.ownerId,
    title: listing.title,
    description: listing.description,
    category: d.category,
    condition: d.condition,
    photos: listing.photos,
    location: listing.location.latLng,
    availability: switch (listing.status) {
      ListingStatus.active => 'available',
      ListingStatus.rented => 'borrowed',
      _ => 'unavailable',
    },
    borrowTerms: BorrowTerms(
      maxDurationDays: d.maxDurationDays,
      depositAmount: d.depositAmount,
      dailyFee: listing.listingType == ListingType.rent ? listing.price : null,
      pickupPreference: d.pickupPreference,
      pickupInstructions: d.pickupInstructions,
    ),
    createdAt: listing.createdAt,
  );
}

// ---------------------------------------------------------------------------
// Firestore mapping (Phase 3)
// ---------------------------------------------------------------------------

/// Parse a listing from its Firestore document shape — the exact JSON
/// the web client writes (ISO date strings, enum names as strings,
/// arena opening hours nested under `openingHours`). Used by the
/// Flutter Firestore service; the seed builders construct listings
/// directly and don't need this.
extension ListingFirestoreMap on Listing {
  static Listing fromMap(String id, Map<String, dynamic> map) {
    final locationData = map['location'] as Map<String, dynamic>? ?? const {};
    final location = ListingLocation(
      lat: (locationData['lat'] as num?)?.toDouble() ?? 0,
      lng: (locationData['lng'] as num?)?.toDouble() ?? 0,
      city: locationData['city'] as String? ?? '',
      area: locationData['area'] as String? ?? '',
    );
    final details = map['details'] as Map<String, dynamic>? ?? const {};

    ListingType type() =>
        ListingType.values.byName(map['listingType'] as String? ?? 'borrow');
    PriceUnit unit() =>
        PriceUnit.values.byName(map['priceUnit'] as String? ?? 'fixed');
    ListingStatus status() =>
        ListingStatus.values.byName(map['status'] as String? ?? 'active');
    List<String> photos() =>
        (map['photos'] as List<dynamic>? ?? const []).cast<String>();
    DateTime created() =>
        DateTime.tryParse(map['createdAt'] as String? ?? '') ?? DateTime.now();
    DateTime updated() =>
        DateTime.tryParse(map['updatedAt'] as String? ?? '') ?? created();

    switch (map['section'] as String? ?? 'items') {
      case 'vehicles':
        return VehicleListing(
          id: id,
          ownerId: map['ownerId'] as String? ?? '',
          listingType: type(),
          title: map['title'] as String? ?? '',
          description: map['description'] as String? ?? '',
          price: (map['price'] as num?)?.toInt() ?? 0,
          currency: map['currency'] as String? ?? 'PKR',
          priceUnit: unit(),
          negotiable: map['negotiable'] as bool? ?? false,
          photos: photos(),
          location: location,
          status: status(),
          createdAt: created(),
          updatedAt: updated(),
          views: (map['views'] as num?)?.toInt() ?? 0,
          details: VehicleDetails(
            make: details['make'] as String? ?? '',
            model: details['model'] as String? ?? '',
            year: (details['year'] as num?)?.toInt() ?? 0,
            mileageKm: (details['mileageKm'] as num?)?.toInt() ?? 0,
            fuelType: VehicleFuelType.values.byName(
              details['fuelType'] as String? ?? 'petrol',
            ),
            transmission: VehicleTransmission.values.byName(
              details['transmission'] as String? ?? 'manual',
            ),
            condition: details['condition'] as String? ?? '',
            withDriver: details['withDriver'] as bool? ?? false,
            registrationCity: details['registrationCity'] as String? ?? '',
          ),
        );
      case 'properties':
        return PropertyListing(
          id: id,
          ownerId: map['ownerId'] as String? ?? '',
          listingType: type(),
          title: map['title'] as String? ?? '',
          description: map['description'] as String? ?? '',
          price: (map['price'] as num?)?.toInt() ?? 0,
          currency: map['currency'] as String? ?? 'PKR',
          priceUnit: unit(),
          negotiable: map['negotiable'] as bool? ?? false,
          photos: photos(),
          location: location,
          status: status(),
          createdAt: created(),
          updatedAt: updated(),
          views: (map['views'] as num?)?.toInt() ?? 0,
          details: PropertyDetails(
            propertyType: PropertyType.values.byName(
              details['propertyType'] as String? ?? 'house',
            ),
            bedrooms: (details['bedrooms'] as num?)?.toInt(),
            bathrooms: (details['bathrooms'] as num?)?.toInt(),
            areaSize: (details['areaSize'] as num?) ?? 0,
            areaUnit: PropertyAreaUnit.values.byName(
              details['areaUnit'] as String? ?? 'marla',
            ),
            furnished: details['furnished'] as bool? ?? false,
            floor: (details['floor'] as num?)?.toInt(),
            amenities: (details['amenities'] as List<dynamic>? ?? const [])
                .cast<String>(),
            availableFrom:
                DateTime.tryParse(details['availableFrom'] as String? ?? '') ??
                DateTime.now(),
          ),
        );
      case 'arenas':
        final hours =
            details['openingHours'] as Map<String, dynamic>? ?? const {};
        final facilities =
            details['facilities'] as Map<String, dynamic>? ?? const {};
        final advance =
            details['advanceBooking'] as Map<String, dynamic>? ?? const {};
        return ArenaListing(
          id: id,
          ownerId: map['ownerId'] as String? ?? '',
          listingType: type(),
          title: map['title'] as String? ?? '',
          description: map['description'] as String? ?? '',
          price: (map['price'] as num?)?.toInt() ?? 0,
          currency: map['currency'] as String? ?? 'PKR',
          priceUnit: unit(),
          negotiable: map['negotiable'] as bool? ?? false,
          photos: photos(),
          location: location,
          status: status(),
          createdAt: created(),
          updatedAt: updated(),
          views: (map['views'] as num?)?.toInt() ?? 0,
          details: ArenaDetails(
            sportTypes: (details['sportTypes'] as List<dynamic>? ?? const [])
                .cast<String>(),
            surface: details['surface'] as String? ?? '',
            capacity: (details['capacity'] as num?)?.toInt() ?? 0,
            opensAt: hours['opens'] as String? ?? '09:00',
            closesAt: hours['closes'] as String? ?? '22:00',
            slotMinutes: (details['slotMinutes'] as num?)?.toInt() ?? 60,
            facilities: ArenaFacilities(
              floodlights: facilities['floodlights'] as bool? ?? false,
              parking: facilities['parking'] as bool? ?? false,
              washrooms: facilities['washrooms'] as bool? ?? false,
              changingRooms: facilities['changingRooms'] as bool? ?? false,
            ),
            advanceBooking: ArenaAdvanceBooking(
              maxAdvanceDays:
                  (advance['maxAdvanceDays'] as num?)?.toInt() ?? 30,
              minAdvanceHours:
                  (advance['minAdvanceHours'] as num?)?.toInt() ?? 2,
            ),
          ),
        );
      case 'items':
      default:
        return ItemListing(
          id: id,
          ownerId: map['ownerId'] as String? ?? '',
          listingType: type(),
          title: map['title'] as String? ?? '',
          description: map['description'] as String? ?? '',
          price: (map['price'] as num?)?.toInt() ?? 0,
          currency: map['currency'] as String? ?? 'PKR',
          priceUnit: unit(),
          negotiable: map['negotiable'] as bool? ?? false,
          photos: photos(),
          location: location,
          status: status(),
          createdAt: created(),
          updatedAt: updated(),
          views: (map['views'] as num?)?.toInt() ?? 0,
          details: ItemListingDetails(
            category: details['category'] as String? ?? 'Other',
            condition: details['condition'] as String? ?? '',
            depositAmount: (details['depositAmount'] as num?)?.toInt(),
            maxDurationDays: (details['maxDurationDays'] as num?)?.toInt() ?? 7,
            pickupPreference: details['pickupPreference'] as String? ?? 'meet',
            pickupInstructions: details['pickupInstructions'] as String? ?? '',
          ),
        );
    }
  }
}
