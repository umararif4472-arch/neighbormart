import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/cloudinary_config.dart';
import '../../../core/theme/section_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/borrow_request.dart';
import '../../../data/models/listing.dart';
import '../../../data/models/report.dart';
import '../../../state/app_state.dart';
import '../explore/listing_section_view.dart';
import '../item_detail/item_detail_screen.dart';
import '../profile/user_profile_screen.dart';
import '../safety/report_sheet.dart';

/// Phase 5 generic listing detail for every section. Items forward to
/// the original borrow flow; vehicles/properties get rent-period and
/// offer sheets; arenas get the inline slot picker.
class ListingDetailScreen extends StatelessWidget {
  final String listingId;
  const ListingDetailScreen({super.key, required this.listingId});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final listing = state.listingByIdOrNull(listingId);
    if (listing == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Listing')),
        body: const Center(child: Text('This listing is no longer available.')),
      );
    }
    final owner = state.userByIdOrNull(listing.ownerId);
    final isMine = listing.ownerId == state.currentUser.id;
    final trust = owner != null ? state.trustFor(owner) : null;

    return Scaffold(
      appBar: AppBar(
        title: Text(kSectionLabel[listing.section] ?? 'Listing'),
        actions: [
          if (!isMine)
            PopupMenuButton<String>(
              tooltip: 'More actions',
              onSelected: (value) {
                if (value != 'report') return;
                ReportSheet.show(
                  context,
                  targetType: ReportTargetType.listing,
                  targetId: listing.id,
                  targetOwnerId: listing.ownerId,
                  targetLabel: 'this listing',
                );
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'report',
                  child: Text('Report this listing'),
                ),
              ],
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: listing.photos.isNotEmpty
                ? Image.network(
                    detailImageUrl(listing.photos.first),
                    height: 220,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    loadingBuilder: (context, child, progress) =>
                        progress == null
                        ? child
                        : _emojiBanner(context, listing),
                    errorBuilder: (_, _, _) => _emojiBanner(context, listing),
                  )
                : _emojiBanner(context, listing),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  listing.title,
                  style: Theme.of(context).textTheme.headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              // Capped width: at very large text scales the chip /
              // badge column must not crowd the title off the row —
              // its labels ellipsize inside the cap instead.
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 150),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Chip(
                      label: Text(
                        listingTypeLabel(listing),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Section badge in the section's accent (Phase 7).
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: sectionAccentContainerOf(
                          context,
                          listing.section,
                        ),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        kSectionLabel[listing.section] ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: sectionAccentOf(context, listing.section),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            listingPriceLabel(listing),
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.secondary,
            ),
          ),
          Text(
            '${listing.location.area}, ${listing.location.city} · ${listingStatusLabel(listing.status)}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Text(listing.description),
          const SizedBox(height: 16),
          _FactsCard(listing: listing),
          const SizedBox(height: 16),
          if (owner != null)
            Card(
              child: ListTile(
                leading: UserAvatar(user: owner),
                title: Text(owner.name),
                subtitle: Text(
                  '${owner.neighborhood}, ${owner.city}'
                  '${trust != null ? ' · Trust ${trust.total}/100 (${trust.tierName})' : ''}',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => UserProfileScreen(userId: owner.id),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 20),
          _cta(context, state, listing, isMine),
        ],
      ),
    );
  }

  Widget _emojiBanner(BuildContext context, Listing listing) => Container(
    height: 220,
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    alignment: Alignment.center,
    child: Text(
      kSectionEmoji[listing.section] ?? '📦',
      style: const TextStyle(fontSize: 84),
    ),
  );

  Widget _cta(
    BuildContext context,
    AppState state,
    Listing listing,
    bool isMine,
  ) {
    if (isMine) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'This is your listing — manage it from Profile → Manage my items.',
          ),
        ),
      );
    }
    if (listing.status != ListingStatus.active) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'Not taking requests right now (${listingStatusLabel(listing.status).toLowerCase()}).',
          ),
        ),
      );
    }
    switch (listing.section) {
      case ListingSection.items:
        return FilledButton.icon(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ItemDetailScreen(itemId: listing.id),
            ),
          ),
          icon: const Icon(Icons.handshake_outlined),
          label: Text(
            listing.listingType == ListingType.rent
                ? 'Rent this item'
                : 'Borrow this item',
          ),
        );
      case ListingSection.arenas:
        return _ArenaBooking(listing: listing as ArenaListing);
      case ListingSection.vehicles:
      case ListingSection.properties:
        if (listing.listingType == ListingType.sell) {
          return FilledButton.icon(
            onPressed: () => _showOfferSheet(context, state, listing),
            icon: const Icon(Icons.local_offer_outlined),
            label: const Text('Make an offer'),
          );
        }
        return FilledButton.icon(
          onPressed: () => _showRentSheet(context, state, listing),
          icon: const Icon(Icons.event_available_outlined),
          label: const Text('Request to rent'),
        );
    }
  }

  Future<void> _showRentSheet(
    BuildContext context,
    AppState state,
    Listing listing,
  ) async {
    final now = DateTime.now();
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1, now.month, now.day),
      helpText: 'Pick your rental dates',
    );
    if (range == null || !context.mounted) return;
    final err = state.createListingRequest(
      listing: listing,
      period: BorrowPeriod(start: range.start, end: range.end),
    );
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Request sent — the owner will respond soon.'),
      ),
    );
    if (err == null) Navigator.of(context).pop();
  }

  Future<void> _showOfferSheet(
    BuildContext context,
    AppState state,
    Listing listing,
  ) async {
    final ctrl = TextEditingController(text: '${listing.price}');
    final noteCtrl = TextEditingController();
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.of(sheetCtx).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Make an offer',
              style: Theme.of(sheetCtx).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'Asking ${formatRs(listing.price)}${listing.negotiable ? ' — negotiable' : ' — fixed price'}',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Your offer (Rs)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Note to the owner (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.of(sheetCtx).pop(true),
                child: const Text('Send offer'),
              ),
            ),
          ],
        ),
      ),
    );
    if (sent != true || !context.mounted) return;
    final offer = int.tryParse(ctrl.text.replaceAll(',', '').trim());
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final err = state.createListingRequest(
      listing: listing,
      period: BorrowPeriod(start: today, end: today),
      note: noteCtrl.text,
      offerAmount: offer,
    );
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Offer sent — chat opens once it’s accepted.'),
      ),
    );
    if (err == null) Navigator.of(context).pop();
  }
}

class _FactsCard extends StatelessWidget {
  final Listing listing;
  const _FactsCard({required this.listing});

  @override
  Widget build(BuildContext context) {
    final facts = <(String, String)>[];
    switch (listing) {
      case VehicleListing l:
        final d = l.details;
        facts.addAll([
          ('Vehicle', '${d.make} ${d.model} · ${d.year}'),
          ('Mileage', '${d.mileageKm} km'),
          ('Fuel', d.fuelType.name.toUpperCase()),
          ('Transmission', d.transmission.name),
          ('Registered in', d.registrationCity),
          ('Condition', d.condition),
          ('Driver', d.withDriver ? 'With driver' : 'Self-drive'),
        ]);
      case PropertyListing l:
        final d = l.details;
        facts.addAll([
          ('Type', d.propertyType.name),
          ('Size', '${d.areaSize} ${d.areaUnit.name}'),
          if (d.bedrooms != null) ('Bedrooms', '${d.bedrooms}'),
          if (d.bathrooms != null) ('Bathrooms', '${d.bathrooms}'),
          ('Furnished', d.furnished ? 'Yes' : 'No'),
          ('Available from', shortDate(d.availableFrom)),
          if (d.amenities.isNotEmpty) ('Amenities', d.amenities.join(' · ')),
        ]);
      case ArenaListing l:
        final d = l.details;
        facts.addAll([
          ('Sports', d.sportTypes.join(' · ')),
          ('Surface', d.surface),
          ('Capacity', '${d.capacity} people'),
          ('Hours', '${d.opensAt} – ${d.closesAt}'),
          (
            'Slot length',
            d.slotMinutes >= 60
                ? '${d.slotMinutes ~/ 60} hr'
                : '${d.slotMinutes} min',
          ),
        ]);
      case ItemListing l:
        final d = l.details;
        facts.addAll([
          ('Category', d.category),
          ('Condition', d.condition),
          ('Max duration', '${d.maxDurationDays} days'),
          if (d.depositAmount != null)
            ('Deposit', '${formatRs(d.depositAmount!)} (refunded on return)'),
        ]);
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('The facts', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...facts.map(
              (f) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 110,
                      child: Text(
                        f.$1,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        f.$2,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Inline arena slot picker: day chips inside the booking window, slot
/// grid with booked slots disabled, price summary, one-tap request.
class _ArenaBooking extends StatefulWidget {
  final ArenaListing listing;
  const _ArenaBooking({required this.listing});

  @override
  State<_ArenaBooking> createState() => _ArenaBookingState();
}

class _ArenaBookingState extends State<_ArenaBooking> {
  int _dayOffset = 1; // tomorrow by default (min notice friendly)
  String? _selectedStart;

  int _toMinutes(String hhmm) =>
      int.parse(hhmm.substring(0, 2)) * 60 + int.parse(hhmm.substring(3, 5));

  String _fmt(int mins) =>
      '${(mins ~/ 60).toString().padLeft(2, '0')}:${(mins % 60).toString().padLeft(2, '0')}';

  String _dateStr(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final listing = widget.listing;
    final d = listing.details;
    final day = DateTime.now().add(Duration(days: _dayOffset));
    final dateStr = _dateStr(DateTime(day.year, day.month, day.day));

    final busy = state.requests
        .where(
          (r) =>
              r.itemId == listing.id &&
              r.slot != null &&
              r.slot!.date == dateStr &&
              (r.status == 'pending' ||
                  r.status == 'approved' ||
                  r.status == 'active'),
        )
        .map((r) => r.slot!)
        .toList();

    final opens = _toMinutes(d.opensAt);
    final closes = _toMinutes(d.closesAt);
    final slots = <ArenaSlot>[];
    for (var s = opens; s + d.slotMinutes <= closes; s += d.slotMinutes) {
      slots.add(
        ArenaSlot(
          date: dateStr,
          startTime: _fmt(s),
          endTime: _fmt(s + d.slotMinutes),
        ),
      );
    }

    ArenaSlot? selected;
    for (final s in slots) {
      if (s.startTime == _selectedStart) selected = s;
    }
    final hours = d.slotMinutes / 60;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Book a slot', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              '${formatRs(listing.price)} per hour · book up to ${d.advanceBooking.maxAdvanceDays} days ahead',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 44,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: d.advanceBooking.maxAdvanceDays + 1,
                itemBuilder: (context, i) {
                  final date = DateTime.now().add(Duration(days: i));
                  final label = i == 0 ? 'Today' : '${date.day}/${date.month}';
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(label),
                      selected: _dayOffset == i,
                      onSelected: (_) => setState(() {
                        _dayOffset = i;
                        _selectedStart = null;
                      }),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: slots.map((slot) {
                final isBusy = busy.any((b) => slot.overlaps(b));
                final isSelected = _selectedStart == slot.startTime;
                return ChoiceChip(
                  label: Text(
                    isBusy ? '${slot.startTime} booked' : slot.startTime,
                  ),
                  selected: isSelected,
                  onSelected: isBusy
                      ? null
                      : (_) => setState(
                          () => _selectedStart = isSelected
                              ? null
                              : slot.startTime,
                        ),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            if (selected != null)
              Text(
                '$dateStr · ${selected.startTime}–${selected.endTime} · '
                '${formatRs(listing.price * hours)} total',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: selected == null
                    ? null
                    : () {
                        final slotDay = DateTime(day.year, day.month, day.day);
                        final err = state.createListingRequest(
                          listing: listing,
                          period: BorrowPeriod(start: slotDay, end: slotDay),
                          slot: selected,
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              err ?? 'Booking request sent — the arena will confirm.',
                            ),
                          ),
                        );
                        if (err == null) Navigator.of(context).pop();
                      },
                child: const Text('Request this slot'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
