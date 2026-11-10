import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/observability.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/trust_score.dart';
import '../../../core/widgets/reviews_list.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/item.dart';
import '../../../data/models/report.dart';
import '../../../state/app_state.dart';
import '../messages/chat_screen.dart';
import '../not_found/not_found_screen.dart';
import '../profile/user_profile_screen.dart';
import '../safety/report_sheet.dart';
import 'photo_gallery_screen.dart';

class ItemDetailScreen extends StatefulWidget {
  final String itemId;
  const ItemDetailScreen({super.key, required this.itemId});

  @override
  State<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends State<ItemDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  /// Live mode: the item may sit outside the loaded browse window —
  /// fetch that one listing, its owner's profile, and this listing's
  /// reviews on demand. Local/demo mode already holds them all.
  Future<void> _load() async {
    final state = context.read<AppState>();
    await state.ensureListingLoaded(widget.itemId);
    final item = state.itemByIdOrNull(widget.itemId);
    if (item == null) return;
    await state.ensureUserLoaded(item.ownerId);
    await state.ensureReviewsForListing(item.id);
  }

  String get itemId => widget.itemId;

  Future<void> _share(BuildContext context, Item item) async {
    final text =
        'Borrow instead of buying: ${item.title} (${item.category}) — '
        '${item.borrowTerms.dailyFee == null ? 'free to borrow' : '\$${item.borrowTerms.dailyFee}/day'}, '
        'up to ${item.borrowTerms.maxDurationDays} days on NeighborMart.';
    try {
      final result = await SharePlus.instance.share(
        ShareParams(text: text, subject: item.title),
      );
      if (result.status == ShareResultStatus.unavailable) {
        throw StateError('share unavailable');
      }
    } catch (_) {
      await Clipboard.setData(ClipboardData(text: text));
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Link copied')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final item = state.itemByIdOrNull(itemId);
    if (item == null) {
      return const NotFoundScreen(
        message: 'That item is not listed anymore — it may have been removed by its owner.',
      );
    }
    final owner = state.userById(item.ownerId);
    final trust = state.trustFor(owner);
    final isOwn = item.ownerId == state.currentUser.id;
    final dist = distanceKm(state.currentUser.homeLocation, item.location);
    final itemReviews = state.reviewsForItem(item.id);
    final isFavorite = state.isFavorite(item.id);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Item details'),
        actions: [
          IconButton(
            tooltip: isFavorite ? 'Remove from saved' : 'Save this item',
            icon: Icon(
              isFavorite ? Icons.favorite : Icons.favorite_border,
              color: isFavorite ? Theme.of(context).colorScheme.error : null,
            ),
            onPressed: () => context.read<AppState>().toggleFavorite(item.id),
          ),
          IconButton(
            tooltip: 'Share item',
            icon: const Icon(Icons.share_outlined),
            onPressed: () => _share(context, item),
          ),
          if (!isOwn)
            PopupMenuButton<String>(
              tooltip: 'More actions',
              onSelected: (value) {
                if (value != 'report') return;
                ReportSheet.show(
                  context,
                  targetType: ReportTargetType.listing,
                  targetId: item.id,
                  targetOwnerId: item.ownerId,
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
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Share item',
                onPressed: () => _share(context, item),
                icon: const Icon(Icons.share_outlined),
              ),
              if (!isOwn)
                IconButton(
                  tooltip: 'Message the owner',
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ChatScreen.forItem(
                        itemId: item.id,
                        otherUserId: owner.id,
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.chat_bubble_outline),
                ),
              const SizedBox(width: 4),
              Expanded(
                child: isOwn
                    ? const Text(
                        'This is your listing — neighbors can request it from Explore.',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      )
                    : !item.isAvailable
                    ? Text(
                        item.availability == 'borrowed'
                            ? 'Currently borrowed — it cannot be requested right now.'
                            : 'This item is currently unavailable.',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      )
                    : ElevatedButton.icon(
                        onPressed: () => _showRequestSheet(context, item.id),
                        icon: const Icon(Icons.handshake_outlined),
                        label: const Text('Request to borrow'),
                      ),
              ),
            ],
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          _PhotoGallery(item: item),
          const SizedBox(height: 16),
          Text(item.title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(
            '${distanceLabel(dist)} · ${owner.neighborhood}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Text(item.description, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 16),
          _Section(title: 'Condition', body: item.condition),
          _Section(
            title: 'Borrow terms',
            body:
                'Up to ${item.borrowTerms.maxDurationDays} days · ${item.borrowTerms.dailyFee == null ? 'Free to borrow' : '\$${item.borrowTerms.dailyFee} per day'} · ${item.borrowTerms.depositAmount == null ? 'No deposit' : '\$${item.borrowTerms.depositAmount} refundable deposit'}',
          ),
          _Section(
            title: 'Pickup',
            body:
                '${_pickupLabel(item.borrowTerms.pickupPreference)} — ${item.borrowTerms.pickupInstructions}',
          ),
          const SizedBox(height: 8),
          Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => UserProfileScreen(userId: owner.id),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        UserAvatar(user: owner, radius: 22),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                owner.name,
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              Text(
                                owner.bio,
                                style: Theme.of(context).textTheme.bodySmall,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        Flexible(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerRight,
                            child: TrustBadge(result: trust),
                          ),
                        ),
                        const Icon(Icons.chevron_right, size: 20),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _BreakdownRow(
                      label: 'On-time returns',
                      points: trust.breakdown.onTimeReturns,
                      max: kOnTimeMax,
                    ),
                    _BreakdownRow(
                      label: 'Reviews',
                      points: trust.breakdown.reviews,
                      max: kReviewsMax,
                    ),
                    _BreakdownRow(
                      label: 'Completed deals',
                      points: trust.breakdown.completedDeals,
                      max: kDealsMax,
                    ),
                    _BreakdownRow(
                      label: 'Verified profile',
                      points: trust.breakdown.verification,
                      max: 10,
                    ),
                    _BreakdownRow(
                      label: 'Account age',
                      points: trust.breakdown.accountAge,
                      max: kAccountAgeMax,
                    ),
                    _BreakdownRow(
                      label: 'Responsiveness',
                      points: trust.breakdown.responsiveness,
                      max: 15,
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Typically replies in ~${owner.avgResponseMinutes} min',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                        if (!isOwn)
                          OutlinedButton.icon(
                            onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ChatScreen.forItem(
                                  itemId: item.id,
                                  otherUserId: owner.id,
                                ),
                              ),
                            ),
                            icon: const Icon(
                              Icons.chat_bubble_outline,
                              size: 16,
                            ),
                            label: const Text('Message'),
                            style: OutlinedButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 6,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Reviews for this item (${itemReviews.length})',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ReviewsList(reviews: itemReviews),
        ],
      ),
    );
  }

  String _pickupLabel(String p) {
    switch (p) {
      case 'pickup':
        return 'Pickup only';
      case 'drop-off':
        return 'Drop-off';
      default:
        return 'Pickup or drop-off';
    }
  }

  Future<void> _showRequestSheet(BuildContext context, String itemId) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _BorrowSheet(itemId: itemId),
    );
    if (sent == true && context.mounted) {
      logRequestCreated(section: 'items');
      await showSuccessDialog(
        context,
        title: 'Request sent',
        message: 'The owner can approve it from their Activity tab — watch yours for the reply.',
      );
    }
  }
}

/// Photo strip for the item: PageView of network photos with a category
/// tile fallback (also the whole UI for the one photo-less seed item).
class _PhotoGallery extends StatefulWidget {
  final Item item;
  const _PhotoGallery({required this.item});
  @override
  State<_PhotoGallery> createState() => _PhotoGalleryState();
}

class _PhotoGalleryState extends State<_PhotoGallery> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final photos = widget.item.photos;
    if (photos.isEmpty) {
      return Container(
        height: 150,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                categoryIcon(widget.item.category),
                size: 56,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(height: 8),
              Text(
                '${widget.item.category} · no photos yet',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      );
    }
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: SizedBox(
            height: 220,
            child: PageView.builder(
              itemCount: photos.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) {
                final photo = GestureDetector(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PhotoGalleryScreen(
                        item: widget.item,
                        initialIndex: i,
                      ),
                    ),
                  ),
                  child: itemPhotoImage(
                    photos[i],
                    category: widget.item.category,
                    fit: BoxFit.cover,
                    fallbackSize: 112,
                    width: double.infinity,
                    height: 220,
                  ),
                );
                return i == 0
                    ? Hero(tag: 'item-photo-${widget.item.id}', child: photo)
                    : photo;
              },
            ),
          ),
        ),
        if (photos.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(photos.length, (i) {
                final active = i == _index;
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: active ? 18 : 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: active
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.outline,
                    borderRadius: BorderRadius.circular(6),
                  ),
                );
              }),
            ),
          ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String body;
  const _Section({required this.title, required this.body});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(body),
        ],
      ),
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  final String label;
  final int points;
  final int max;
  const _BreakdownRow({
    required this.label,
    required this.points,
    required this.max,
  });
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: const TextStyle(fontSize: 13)),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: max == 0 ? 0 : points / max,
                minHeight: 8,
                backgroundColor: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest,
                color: Theme.of(context).colorScheme.secondary,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$points/$max',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _BorrowSheet extends StatefulWidget {
  final String itemId;
  const _BorrowSheet({required this.itemId});
  @override
  State<_BorrowSheet> createState() => _BorrowSheetState();
}

class _BorrowSheetState extends State<_BorrowSheet> {
  DateTime? _start;
  DateTime? _end;
  final _noteCtrl = TextEditingController();
  String? _error;
  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  /// Quick ranges: each preset spans [spanDays] inclusive days starting
  /// at [start], clamped so it never exceeds the item's max borrow days.
  void _applyPreset(DateTime start, int spanDays, int maxDays) {
    final span = spanDays > maxDays ? maxDays : spanDays;
    final s = DateTime(start.year, start.month, start.day);
    setState(() {
      _start = s;
      _end = s.add(Duration(days: span - 1));
      _error = null;
    });
  }

  Future<void> _pick(bool isStart) async {
    final now = DateTime.now();
    final initial = isStart ? (_start ?? now) : (_end ?? _start ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 90)),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _start = picked;
        if (_end != null && _end!.isBefore(picked)) _end = picked;
      } else {
        _end = picked;
      }
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final item = state.itemById(widget.itemId);
    final pendingOverlaps = (_start != null && _end != null)
        ? state.pendingRequestsOverlapping(widget.itemId, _start!, _end!)
        : const [];
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Request to borrow',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(item.title, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            children: [
              ActionChip(
                avatar: const Icon(Icons.wb_sunny_outlined, size: 16),
                label: const Text('Tomorrow'),
                onPressed: () {
                  final today = DateTime.now();
                  _applyPreset(
                    DateTime(today.year, today.month, today.day + 1),
                    3,
                    item.borrowTerms.maxDurationDays,
                  );
                },
              ),
              ActionChip(
                avatar: const Icon(Icons.weekend_outlined, size: 16),
                label: const Text('This weekend'),
                onPressed: () {
                  final now = DateTime.now();
                  var delta = (DateTime.saturday - now.weekday) % 7;
                  if (delta == 0) delta = 7;
                  _applyPreset(
                    DateTime(now.year, now.month, now.day + delta),
                    2,
                    item.borrowTerms.maxDurationDays,
                  );
                },
              ),
              ActionChip(
                avatar: const Icon(Icons.event_outlined, size: 16),
                label: const Text('Next week'),
                onPressed: () {
                  final now = DateTime.now();
                  _applyPreset(
                    DateTime(now.year, now.month, now.day + 7),
                    3,
                    item.borrowTerms.maxDurationDays,
                  );
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pick(true),
                  icon: const Icon(Icons.calendar_today, size: 18),
                  label: Text(
                    _start == null ? 'Start date' : shortDate(_start!),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pick(false),
                  icon: const Icon(Icons.event, size: 18),
                  label: Text(_end == null ? 'End date' : shortDate(_end!)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Max ${item.borrowTerms.maxDurationDays} days for this item.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (pendingOverlaps.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: amberAccentOf(context).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.warning_amber,
                    size: 18,
                    color: amberAccentOf(context),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Heads up: ${pendingOverlaps.length == 1 ? 'another neighbor has' : '${pendingOverlaps.length} neighbors have'} a pending request for overlapping dates. The owner can only approve one — you can still send yours.',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 12),
          TextField(
            controller: _noteCtrl,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText:
                  'Note to the owner — what is it for, when can you pick up?',
              labelText: 'Note (optional)',
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                _error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                if (_start == null || _end == null) {
                  setState(
                    () => _error = 'Please pick both a start and an end date.',
                  );
                  return;
                }
                final err = state.createBorrowRequest(
                  item,
                  _start!,
                  _end!,
                  _noteCtrl.text,
                );
                if (err != null) {
                  setState(() => _error = err);
                  return;
                }
                // Report success to the detail screen, which celebrates
                // with the success dialog.
                Navigator.of(context).pop(true);
              },
              child: const Text('Send request'),
            ),
          ),
        ],
      ),
    );
  }
}
