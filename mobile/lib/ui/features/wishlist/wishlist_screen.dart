import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/item.dart';
import '../../../data/models/wishlist_item.dart';
import '../../../state/app_state.dart';
import '../../app_drawer.dart';
import '../item_detail/item_detail_screen.dart';

class WishlistScreen extends StatelessWidget {
  const WishlistScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        leading: const ShellMenuButton(),
        title: const Text(
          'Neighborhood wishlist',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, kBottomListPadding),
        children: [
          Text('Saved items', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (state.favoriteItems.isEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 4),
              child: Text('Tap the heart on any item to save it here.'),
            )
          else
            ...state.favoriteItems.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _SavedItemRow(item: item),
              ),
            ),
          const SizedBox(height: 16),
          Text(
            'Community wishlist',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (state.liveMode && state.wishlist.isEmpty)
            const Padding(
              padding: EdgeInsets.only(bottom: 4),
              child: Text(
                'The community wishlist was part of the old prototype '
                'and is not part of the live marketplace yet. Your saved '
                'items above sync with your account.',
              ),
            ),
          ...state.wishlist.map(
            (w) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _WishlistCard(item: w),
            ),
          ),
        ],
      ),
    );
  }
}

/// A favorited catalog item, saved from Explore / Item Detail hearts.
class _SavedItemRow extends StatelessWidget {
  final Item item;
  const _SavedItemRow({required this.item});
  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: ItemPhoto.forItem(item, width: 48, height: 48, radius: 12),
        title: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          item.borrowTerms.dailyFee == null
              ? 'Free to borrow'
              : '\$${item.borrowTerms.dailyFee}/day',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ItemDetailScreen(itemId: item.id)),
        ),
      ),
    );
  }
}

class _WishlistCard extends StatelessWidget {
  final WishlistItem item;
  const _WishlistCard({required this.item});
  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CategoryTile(category: item.category, size: 48),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        'Wished by ${item.requestedByName} · ${item.requestCount} neighbors need this',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Text(item.description),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: item.progress,
                minHeight: 10,
                backgroundColor: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest,
                color: Theme.of(context).colorScheme.secondary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '${item.pointsPledged} of ${item.targetPoints} points pledged (${(item.progress * 100).round()}%)',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _showPledge(context, state),
                    child: const Text('Pledge points'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      state.needThisToo(item.id);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Noted — demand count updated.'),
                        ),
                      );
                    },
                    child: const Text('I need this too'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showPledge(BuildContext context, AppState state) {
    final ctrl = TextEditingController();
    String? error;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          // Scrollable: at very large text scales the title +
          // content must scroll instead of overflowing the dialog.
          scrollable: true,
          title: const Text('Pledge points'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.title, style: Theme.of(ctx).textTheme.bodySmall),
              const SizedBox(height: 12),
              TextField(
                controller: ctrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Points to pledge',
                  errorText: error,
                  hintText: 'e.g. 25',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                final v = int.tryParse(ctrl.text.trim());
                if (v == null || v <= 0) {
                  setState(() => error = 'Enter a positive whole number.');
                  return;
                }
                if (v > 500) {
                  setState(
                    () => error = 'Keep a single pledge at 500 points or less.',
                  );
                  return;
                }
                state.pledgePoints(item.id, v);
                Navigator.of(ctx).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Pledged $v points — thank you.')),
                );
              },
              child: const Text('Pledge'),
            ),
          ],
        ),
      ),
    );
  }
}
