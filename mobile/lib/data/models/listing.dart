import 'user.dart';

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
