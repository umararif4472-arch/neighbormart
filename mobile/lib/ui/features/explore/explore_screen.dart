import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/section_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/listing_card_skeleton.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/item.dart';
import '../../../data/models/listing.dart';
import '../../../state/app_state.dart';
import '../../app_drawer.dart';
import '../item_detail/item_detail_screen.dart';
import '../messages/messages_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/user_profile_screen.dart';
import 'explore_filters.dart';
import 'item_map_view.dart';
import 'listing_section_view.dart';

class ExploreScreen extends StatefulWidget {
  /// Optional external section control (Part 7 drawer): when the
  /// app shell provides this notifier, the drawer's SECTIONS entries
  /// and this screen's section chips read/write the same value, so
  /// either can change the section the other shows. Standalone use
  /// (tests, harnesses) passes nothing and keeps internal state.
  final ValueNotifier<ListingSection?>? sectionController;
  const ExploreScreen({super.key, this.sectionController});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen>
    with SingleTickerProviderStateMixin {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  String _query = '';

  /// All Explore refinements (type, category, distance, price,
  /// availability, sort) live behind the filter sheet — the screen
  /// itself only carries search + the section switch.
  ExploreFilter _filter = ExploreFilter.empty;
  bool _showMap = false;

  /// Initial-load placeholders (Phase 7): the catalog is local and
  /// instant, but the first paint still gets a brief skeleton pass so
  /// the screen never flashes from empty to full. Reduced-motion
  /// users skip straight to content.
  bool _showSkeleton = true;
  AnimationController? _intro;
  bool _introStarted = false;

  /// Phase 5 section switch: null keeps the original Items & Tools
  /// explore (categories, map, grouping); a section swaps in the
  /// unified-listing card list for vehicles / properties / arenas.
  ListingSection? _localSection;

  /// The section currently shown: the shell's shared value when a
  /// [ExploreScreen.sectionController] was provided, else local.
  ListingSection? get _section =>
      widget.sectionController?.value ?? _localSection;

  void _setSection(ListingSection? section) {
    final controller = widget.sectionController;
    if (controller != null) {
      controller.value = section; // the listener setStates
    } else {
      setState(() => _localSection = section);
    }
  }

  void _onControllerSectionChanged() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    widget.sectionController?.addListener(_onControllerSectionChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_introStarted) return;
    _introStarted = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _showSkeleton = false;
      return;
    }
    _intro =
        AnimationController(
            vsync: this,
            duration: const Duration(milliseconds: 600),
          )
          ..addStatusListener((status) {
            if (status == AnimationStatus.completed && mounted) {
              setState(() => _showSkeleton = false);
            }
          })
          ..forward();
  }

  @override
  void dispose() {
    widget.sectionController?.removeListener(_onControllerSectionChanged);
    _intro?.dispose();
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _selectCategory(String category) {
    setState(() => _filter = _filter.copyWith(category: category));
    if (_scrollCtrl.hasClients) {
      _scrollCtrl.animateTo(
        0,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _openFilters() async {
    final edited = await showExploreFilterSheet(
      context,
      current: _filter,
      showCategory: _section == null,
    );
    if (edited != null && mounted) setState(() => _filter = edited);
  }

  /// Applies the filter facets [AppState.filteredItems] doesn't know
  /// about (listing types, max price, sort) to the Items view.
  /// Legacy Items are borrow-only, so a type selection without
  /// Borrow matches nothing here.
  List<Item> _applyItemFacets(List<Item> items, AppState state) {
    final f = _filter;
    if (f.types.isNotEmpty && !f.types.contains(ListingType.borrow)) {
      return const [];
    }
    var result = items;
    if (f.maxPricePkr != null) {
      result = result
          .where((i) => (i.borrowTerms.dailyFee ?? 0) <= f.maxPricePkr!)
          .toList();
    }
    switch (f.sort) {
      case ExploreSort.recommended:
      case ExploreSort.nearest:
        // filteredItems already returns nearest-first.
        break;
      case ExploreSort.newest:
        result = [...result]
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      case ExploreSort.priceLow:
        result = [...result]
          ..sort(
            (a, b) => (a.borrowTerms.dailyFee ?? 0).compareTo(
              b.borrowTerms.dailyFee ?? 0,
            ),
          );
      case ExploreSort.priceHigh:
        result = [...result]
          ..sort(
            (a, b) => (b.borrowTerms.dailyFee ?? 0).compareTo(
              a.borrowTerms.dailyFee ?? 0,
            ),
          );
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final items = _applyItemFacets(
      state.filteredItems(
        query: _query,
        category: _filter.category,
        maxDistanceKm: _filter.maxDistanceKm,
        onlyAvailable: _filter.onlyAvailable,
      ),
      state,
    );
    final me = state.currentUser;
    return Scaffold(
      appBar: AppBar(
        leading: const ShellMenuButton(),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_on_outlined, size: 19),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                me.neighborhood,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 19,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
            icon: Badge(
              isLabelVisible:
                  state.notificationsEnabled &&
                  state.notificationBadgeCount > 0,
              label: Text('${state.notificationBadgeCount}'),
              child: const Icon(Icons.notifications_outlined),
            ),
          ),
          IconButton(
            tooltip: 'Messages',
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute(builder: (_) => const MessagesScreen())),
            icon: const Icon(Icons.chat_bubble_outline),
          ),
          IconButton(
            tooltip: 'Your profile',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => UserProfileScreen(userId: me.id),
              ),
            ),
            icon: UserAvatar(user: me, radius: 18),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchCtrl,
                    decoration: const InputDecoration(
                      hintText: 'Search drills, tents, mixers…',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (v) => setState(() => _query = v),
                  ),
                ),
                const SizedBox(width: 10),
                IconButton.filledTonal(
                  tooltip: 'Filters',
                  onPressed: _openFilters,
                  icon: Badge.count(
                    count: _filter.activeCount,
                    isLabelVisible: _filter.activeCount > 0,
                    child: const Icon(Icons.tune),
                  ),
                ),
              ],
            ),
          ),
          // Phase 5: marketplace sections
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('🧰 Items & Tools'),
                    selected: _section == null,
                    selectedColor: sectionAccentContainerOf(
                      context,
                      ListingSection.items,
                    ),
                    onSelected: (_) => _setSection(null),
                  ),
                ),
                ...[
                  ListingSection.vehicles,
                  ListingSection.properties,
                  ListingSection.arenas,
                ].map(
                  (s) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text('${kSectionEmoji[s]} ${kSectionLabel[s]}'),
                      selected: _section == s,
                      selectedColor: sectionAccentContainerOf(context, s),
                      onSelected: (_) => _setSection(s),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_section == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      items.length == 1
                          ? '1 item nearby'
                          : '${items.length} items nearby',
                      style: Theme.of(context).textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    tooltip: _showMap ? 'List view' : 'Map view',
                    icon: Icon(
                      _showMap ? Icons.list : Icons.map_outlined,
                      size: 20,
                    ),
                    onPressed: () => setState(() => _showMap = !_showMap),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _showSkeleton
                ? const ListingListSkeleton(key: ValueKey('skeleton'))
                : _section != null
                ? SectionListingList(
                    key: ValueKey('section-${_section!.name}'),
                    state: state,
                    section: _section!,
                    query: _query,
                    filter: _filter,
                    onClearFilters: () =>
                        setState(() => _filter = ExploreFilter.empty),
                  )
                : AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    transitionBuilder: (child, animation) =>
                        FadeTransition(opacity: animation, child: child),
                    child: _showMap
                        ? ItemMapView(
                            key: const ValueKey('map'),
                            items: items,
                            maxDistanceKm: _filter.maxDistanceKm,
                          )
                        : items.isEmpty
                        ? Center(
                            key: const ValueKey('empty'),
                            child: Padding(
                              padding: const EdgeInsets.all(32),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.search_off,
                                    size: 56,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant
                                        .withValues(alpha: 0.6),
                                  ),
                                  const SizedBox(height: 12),
                                  if (_filter.activeCount > 0) ...[
                                    const Text(
                                      'No matches for these filters',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    const Text(
                                      'Try different filters, or clear them to see everything nearby.',
                                      textAlign: TextAlign.center,
                                    ),
                                    const SizedBox(height: 14),
                                    OutlinedButton(
                                      onPressed: () => setState(
                                        () => _filter = ExploreFilter.empty,
                                      ),
                                      child: const Text('Clear filters'),
                                    ),
                                  ] else ...[
                                    const Text(
                                      'Nothing matches — try widening your distance',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    const Text(
                                      'Or clear your search.',
                                      textAlign: TextAlign.center,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          )
                        : Builder(
                            key: const ValueKey('list'),
                            builder: (context) {
                              final grouped = groupItemsByCategory(items);
                              return RefreshIndicator(
                                onRefresh: () async {
                                  await Future<void>.delayed(
                                    const Duration(milliseconds: 600),
                                  );
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Listings are up to date.'),
                                    ),
                                  );
                                },
                                child: ListView(
                                  controller: _scrollCtrl,
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    8,
                                    16,
                                    kBottomListPadding,
                                  ),
                                  children: [
                                    for (final entry in grouped.entries) ...[
                                      _CategorySectionHeader(
                                        category: entry.key,
                                        count: entry.value.length,
                                        isFirst:
                                            entry.key == grouped.keys.first,
                                        onTap: () => _selectCategory(entry.key),
                                      ),
                                      for (final item in entry.value)
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            bottom: 12,
                                          ),
                                          child: _ItemCard(item: item),
                                        ),
                                    ],
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Section header for one category group on Explore — the "separate
/// portions" neighbours browse by. Tapping it applies that category as
/// the Explore filter (same as its chip above).
class _CategorySectionHeader extends StatelessWidget {
  final String category;
  final int count;
  final bool isFirst;
  final VoidCallback onTap;
  const _CategorySectionHeader({
    required this.category,
    required this.count,
    required this.isFirst,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(top: isFirst ? 4 : 18, bottom: 2),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Icon(
                categoryIcon(category),
                size: 20,
                color: sectionAccentOf(context, ListingSection.items),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  category,
                  style: Theme.of(context).textTheme.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                count == 1 ? '1 item' : '$count items',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const Icon(Icons.chevron_right, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  final Item item;
  const _ItemCard({required this.item});
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final owner = state.userById(item.ownerId);
    final me = state.currentUser;
    final dist = distanceKm(me.homeLocation, item.location);
    final trust = state.trustFor(owner);
    final isFavorite = state.isFavorite(item.id);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ItemDetailScreen(itemId: item.id)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Stack(
                children: [
                  Hero(
                    tag: 'item-photo-${item.id}',
                    child: ItemPhoto.forItem(item, width: 84, height: 84),
                  ),
                  Positioned(
                    top: 4,
                    right: 4,
                    // 48dp hit area (was a 30dp button); the white
                    // circle visual stays 30dp, drawn inside the
                    // button's icon.
                    child: IconButton(
                      tooltip: isFavorite
                          ? 'Remove from saved'
                          : 'Save this item',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 48,
                        minHeight: 48,
                      ),
                      onPressed: () =>
                          context.read<AppState>().toggleFavorite(item.id),
                      icon: Container(
                        width: 30,
                        height: 30,
                        decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Color(0x29000000),
                              blurRadius: 2,
                              offset: Offset(0, 1),
                            ),
                          ],
                        ),
                        child: Icon(
                          isFavorite ? Icons.favorite : Icons.favorite_border,
                          size: 17,
                          color: isFavorite
                              ? AppColors.errorRed
                              : AppColors.bark,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      item.title,
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.borrowTerms.dailyFee == null
                          ? 'Free to borrow'
                          : '\$${item.borrowTerms.dailyFee}/day',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          Icons.star,
                          size: 14,
                          color: amberAccentOf(context),
                        ),
                        const SizedBox(width: 3),
                        Flexible(
                          child: Text(
                            '${trust.total} · ${distanceLabel(dist)}',
                            style: Theme.of(context).textTheme.bodySmall,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
