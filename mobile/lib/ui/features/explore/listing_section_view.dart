import 'package:flutter/material.dart';

import '../../../core/cloudinary_config.dart';
import '../../../core/theme/section_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../data/models/listing.dart';
import '../../../state/app_state.dart';
import '../listing_detail/listing_detail_screen.dart';
import 'explore_filters.dart';

/// Section emoji + labels (mirrors web SECTION_META).
const Map<ListingSection, String> kSectionEmoji = {
  ListingSection.items: '🧰',
  ListingSection.vehicles: '🚗',
  ListingSection.properties: '🏠',
  ListingSection.arenas: '🏟️',
};

const Map<ListingSection, String> kSectionLabel = {
  ListingSection.items: 'Items & Tools',
  ListingSection.vehicles: 'Vehicles',
  ListingSection.properties: 'Properties',
  ListingSection.arenas: 'Arenas & Venues',
};

String listingPriceLabel(Listing listing) {
  if (listing.listingType == ListingType.borrow) return 'Free to borrow';
  if (listing.listingType == ListingType.sell) {
    return formatRs(listing.price) +
        (listing.negotiable ? ' · negotiable' : '');
  }
  final unit = switch (listing.priceUnit) {
    PriceUnit.hour => '/hr',
    PriceUnit.day => '/day',
    PriceUnit.week => '/wk',
    PriceUnit.month => '/mo',
    PriceUnit.fixed => '',
  };
  return '${formatRs(listing.price)}$unit';
}

String listingTypeLabel(Listing listing) => switch (listing.listingType) {
  ListingType.borrow => 'Borrow',
  ListingType.rent => 'Rent',
  ListingType.sell => 'For sale',
};

String listingStatusLabel(ListingStatus status) => switch (status) {
  ListingStatus.active => 'Available',
  ListingStatus.reserved => 'Reserved',
  ListingStatus.rented => 'Out now',
  ListingStatus.sold => 'Sold',
  ListingStatus.paused => 'Paused',
  ListingStatus.removed => 'Removed',
};

/// One card for any section's listing (Phase 5 Explore sections).
class ListingCard extends StatelessWidget {
  final Listing listing;
  final AppState state;
  const ListingCard({super.key, required this.listing, required this.state});

  @override
  Widget build(BuildContext context) {
    final owner = state.userByIdOrNull(listing.ownerId);
    final km = distanceKm(
      state.currentUser.homeLocation,
      listing.location.latLng,
    );
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ListingDetailScreen(listingId: listing.id),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: listing.photos.isNotEmpty
                    ? Image.network(
                        cardImageUrl(listing.photos.first),
                        width: 72,
                        height: 72,
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, progress) =>
                            progress == null ? child : _emojiTile(context),
                        errorBuilder: (_, _, _) => _emojiTile(context),
                      )
                    : _emojiTile(context),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      listing.title,
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      listingPriceLabel(listing),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${listing.location.area} · ${distanceLabel(km)}'
                      '${owner != null ? ' · ${owner.name.split(' ').first}' : ''}',
                      style: Theme.of(context).textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Chip(
                    label: Text(
                      listingTypeLabel(listing),
                      style: const TextStyle(fontSize: 11),
                    ),
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                  ),
                  const SizedBox(height: 4),
                  // Section badge in the section's accent (Phase 7).
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: sectionAccentContainerOf(context, listing.section),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      kSectionLabel[listing.section] ?? '',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: sectionAccentOf(context, listing.section),
                      ),
                    ),
                  ),
                  if (listing.status != ListingStatus.active)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        listingStatusLabel(listing.status),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emojiTile(BuildContext context) => Container(
    width: 72,
    height: 72,
    // Theme surface variant, so the tile stays tonal in dark mode too.
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    alignment: Alignment.center,
    child: Text(
      kSectionEmoji[listing.section] ?? '📦',
      style: const TextStyle(fontSize: 32),
    ),
  );
}

/// The Explore body for a non-items section: visible listings filtered
/// by the search query and the Explore [filter] (types, distance,
/// max price, availability), ordered per the filter's sort.
class SectionListingList extends StatelessWidget {
  final AppState state;
  final ListingSection section;
  final String query;
  final ExploreFilter filter;
  final VoidCallback? onClearFilters;
  const SectionListingList({
    super.key,
    required this.state,
    required this.section,
    required this.query,
    required this.filter,
    this.onClearFilters,
  });

  @override
  Widget build(BuildContext context) {
    final me = state.currentUser.homeLocation;
    final q = query.trim().toLowerCase();
    // Phase 8: listings from blocked neighbors never appear here.
    final visible = listingsExcludingBlocked(
      state.listings,
      state.blockedUserIdSet,
    );
    final results = visible.where((l) {
      if (l.section != section || !l.isVisible) return false;
      if (q.isNotEmpty &&
          !'${l.title} ${l.description}'.toLowerCase().contains(q)) {
        return false;
      }
      if (filter.types.isNotEmpty && !filter.types.contains(l.listingType)) {
        return false;
      }
      if (filter.onlyAvailable && l.status != ListingStatus.active) {
        return false;
      }
      if (filter.maxPricePkr != null && l.price > filter.maxPricePkr!) {
        return false;
      }
      if (filter.maxDistanceKm != null &&
          distanceKm(me, l.location.latLng) > filter.maxDistanceKm!) {
        return false;
      }
      return true;
    }).toList();
    switch (filter.sort) {
      case ExploreSort.recommended:
      case ExploreSort.nearest:
        results.sort(
          (a, b) => distanceKm(
            me,
            a.location.latLng,
          ).compareTo(distanceKm(me, b.location.latLng)),
        );
      case ExploreSort.newest:
        results.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      case ExploreSort.priceLow:
        results.sort((a, b) => a.price.compareTo(b.price));
      case ExploreSort.priceHigh:
        results.sort((a, b) => b.price.compareTo(a.price));
    }
    if (results.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                filter.activeCount > 0
                    ? 'No matches for these filters'
                    : 'Nothing here matches yet — try a different search.',
                textAlign: TextAlign.center,
              ),
              if (filter.activeCount > 0 && onClearFilters != null) ...[
                const SizedBox(height: 14),
                OutlinedButton(
                  onPressed: onClearFilters,
                  child: const Text('Clear filters'),
                ),
              ],
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      itemCount: results.length,
      itemBuilder: (context, i) =>
          ListingCard(listing: results[i], state: state),
    );
  }
}
