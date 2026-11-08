import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/item.dart';
import '../../../data/models/listing.dart';
import '../../../state/app_state.dart';
import '../explore/listing_section_view.dart';
import '../list_item/list_item_screen.dart';

/// Edit, delete, and pause your own listings — legacy items keep their
/// editor; Phase 5 section listings (vehicles / properties / arenas)
/// get status management (pause / resume / mark sold / remove).
class ManageItemsScreen extends StatelessWidget {
  const ManageItemsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final mine = state.myItems;
    final others = state.myListings
        .where(
          (l) =>
              l.section != ListingSection.items &&
              l.status != ListingStatus.removed,
        )
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Manage my items')),
      body: mine.isEmpty && others.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'You have not listed anything yet. Tap "List item" in the main app to share your first thing.',
                  textAlign: TextAlign.center,
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                ...mine.map((item) => _itemCard(context, state, item)),
                if (others.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.only(top: 8, bottom: 12),
                    child: Text(
                      'Marketplace listings',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  ...others.map(
                    (listing) => _listingCard(context, state, listing),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _itemCard(BuildContext context, AppState state, Item item) {
    final borrowed = item.availability == 'borrowed';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ItemPhoto.forItem(item, width: 44, height: 44, radius: 12),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.title,
                          style: Theme.of(context).textTheme.titleMedium,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${item.category} · ${item.availability}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text('Available for borrowing'),
                  const Spacer(),
                  Switch(
                    value: item.availability == 'available',
                    activeThumbColor: AppColors.moss,
                    onChanged: borrowed
                        ? null
                        : (v) => state.setItemAvailability(
                            item.id,
                            v ? 'available' : 'unavailable',
                          ),
                  ),
                ],
              ),
              if (borrowed)
                const Text(
                  'Currently borrowed — availability is locked until it comes back.',
                  style: TextStyle(fontSize: 12, color: AppColors.barkLight),
                ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ListItemScreen(existingItem: item),
                        ),
                      ),
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: const Text('Edit'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.errorRed,
                        side: const BorderSide(color: AppColors.errorRed),
                      ),
                      onPressed: () =>
                          _confirmDelete(context, item.id, item.title),
                      icon: const Icon(Icons.delete_outline, size: 18),
                      label: const Text('Delete'),
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

  Widget _listingCard(BuildContext context, AppState state, Listing listing) {
    void act(ListingStatus status, String message) {
      final ok = state.setListingStatus(listing.id, status, notify: true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? message
                : 'That move isn’t allowed from ${listing.status.name}.',
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    kSectionEmoji[listing.section] ?? '📦',
                    style: const TextStyle(fontSize: 26),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          listing.title,
                          style: Theme.of(context).textTheme.titleMedium,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${kSectionLabel[listing.section]} · ${listingPriceLabel(listing)} · ${listing.views} views',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  Chip(
                    label: Text(
                      listingStatusLabel(listing.status),
                      style: const TextStyle(fontSize: 11),
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  if (listing.status == ListingStatus.active)
                    OutlinedButton(
                      onPressed: () =>
                          act(ListingStatus.paused, 'Listing paused.'),
                      child: const Text('Pause'),
                    ),
                  if (listing.status == ListingStatus.paused)
                    OutlinedButton(
                      onPressed: () =>
                          act(ListingStatus.active, 'Listing is live again.'),
                      child: const Text('Resume'),
                    ),
                  if (listing.status == ListingStatus.active &&
                      listing.listingType == ListingType.sell)
                    OutlinedButton(
                      onPressed: () =>
                          act(ListingStatus.sold, 'Marked as sold.'),
                      child: const Text('Mark sold'),
                    ),
                  if (listing.status != ListingStatus.rented)
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.errorRed,
                        side: const BorderSide(color: AppColors.errorRed),
                      ),
                      onPressed: () =>
                          act(ListingStatus.removed, 'Listing removed.'),
                      child: const Text('Remove'),
                    ),
                  const OutlinedButton(
                    onPressed: null,
                    child: Text('Boost 🚀 (soon)'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    String itemId,
    String title,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete this listing?'),
        content: Text(
          '"$title" will be removed from Explore. Pending requests for it are declined.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.errorRed,
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirm != true || !context.mounted) return;
    final err = context.read<AppState>().deleteItem(itemId);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(err ?? 'Listing deleted.')));
  }
}
