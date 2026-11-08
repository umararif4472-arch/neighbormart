import 'package:flutter/material.dart';

import '../../../core/utils/formatters.dart';
import '../../../data/models/item.dart';
import '../../../data/models/listing.dart';

/// How Explore results are ordered.
enum ExploreSort { recommended, newest, priceLow, priceHigh, nearest }

/// The Explore filter state, edited through the filter sheet and
/// applied by both the Items view and the section listing lists.
/// An empty type set / null facet means "no constraint" for that
/// facet, so [empty] is the no-filter state.
class ExploreFilter {
  final Set<ListingType> types;
  final String? category;
  final double? maxDistanceKm;
  final bool onlyAvailable;
  final double? maxPricePkr;
  final ExploreSort sort;

  const ExploreFilter({
    this.types = const {},
    this.category,
    this.maxDistanceKm,
    this.onlyAvailable = false,
    this.maxPricePkr,
    this.sort = ExploreSort.recommended,
  });

  static const empty = ExploreFilter();

  /// How many facets differ from the default — drives the badge on
  /// the filter button and the "clear filters" empty state.
  int get activeCount =>
      (types.isNotEmpty ? 1 : 0) +
      (category != null ? 1 : 0) +
      (maxDistanceKm != null ? 1 : 0) +
      (onlyAvailable ? 1 : 0) +
      (maxPricePkr != null ? 1 : 0) +
      (sort != ExploreSort.recommended ? 1 : 0);

  ExploreFilter copyWith({
    Set<ListingType>? types,
    String? category,
    bool clearCategory = false,
    double? maxDistanceKm,
    bool clearMaxDistance = false,
    bool? onlyAvailable,
    double? maxPricePkr,
    bool clearMaxPrice = false,
    ExploreSort? sort,
  }) {
    return ExploreFilter(
      types: types ?? this.types,
      category: clearCategory ? null : (category ?? this.category),
      maxDistanceKm: clearMaxDistance
          ? null
          : (maxDistanceKm ?? this.maxDistanceKm),
      onlyAvailable: onlyAvailable ?? this.onlyAvailable,
      maxPricePkr: clearMaxPrice ? null : (maxPricePkr ?? this.maxPricePkr),
      sort: sort ?? this.sort,
    );
  }
}

String _sortLabel(ExploreSort sort) => switch (sort) {
  ExploreSort.recommended => 'Recommended',
  ExploreSort.newest => 'Newest first',
  ExploreSort.priceLow => 'Price: low to high',
  ExploreSort.priceHigh => 'Price: high to low',
  ExploreSort.nearest => 'Nearest first',
};

String _typeLabel(ListingType type) => switch (type) {
  ListingType.borrow => 'Borrow',
  ListingType.rent => 'Rent',
  ListingType.sell => 'Sell',
};

/// Opens the Explore filter sheet. Resolves to the edited filter
/// when the user taps "Show results", or null when the sheet is
/// dismissed without applying (drag down, scrim, back) — the
/// caller keeps its current filter in that case.
Future<ExploreFilter?> showExploreFilterSheet(
  BuildContext context, {
  required ExploreFilter current,
  required bool showCategory,
}) {
  return showModalBottomSheet<ExploreFilter>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) =>
        _FilterSheet(initial: current, showCategory: showCategory),
  );
}

class _FilterSheet extends StatefulWidget {
  final ExploreFilter initial;
  final bool showCategory;
  const _FilterSheet({required this.initial, required this.showCategory});

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late ExploreFilter _draft = widget.initial;
  late double _priceSlider = widget.initial.maxPricePkr ?? 20000;

  void _clearAll() => setState(() {
    _draft = ExploreFilter.empty;
    _priceSlider = 20000;
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.88;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 12, 4),
              // Title + close only: a "Clear all" text button in
              // this row overflowed it at large text scales on
              // narrow phones. It lives at the top of the scroll
              // area below instead, right-aligned on its own row.
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Filters',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _draft.activeCount == 0 ? null : _clearAll,
                        child: const Text('Clear all'),
                      ),
                    ),
                    _sectionTitle(context, 'Listing type'),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final type in ListingType.values)
                          FilterChip(
                            label: Text(_typeLabel(type)),
                            selected: _draft.types.contains(type),
                            onSelected: (selected) => setState(() {
                              final next = {..._draft.types};
                              if (selected) {
                                next.add(type);
                              } else {
                                next.remove(type);
                              }
                              _draft = _draft.copyWith(types: next);
                            }),
                          ),
                      ],
                    ),
                    if (widget.showCategory) ...[
                      const SizedBox(height: 20),
                      _sectionTitle(context, 'Category'),
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          ChoiceChip(
                            label: const Text('All'),
                            selected: _draft.category == null,
                            onSelected: (_) => setState(
                              () =>
                                  _draft = _draft.copyWith(clearCategory: true),
                            ),
                          ),
                          for (final c in kItemCategories)
                            ChoiceChip(
                              label: Text(c),
                              selected: _draft.category == c,
                              onSelected: (_) => setState(
                                () => _draft = _draft.copyWith(
                                  category: _draft.category == c ? null : c,
                                  clearCategory: _draft.category == c,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 20),
                    _sectionTitle(context, 'Distance'),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final d in <double?>[null, 1, 3, 5])
                          ChoiceChip(
                            label: Text(d == null ? 'Any' : '${d.toInt()} km'),
                            selected: _draft.maxDistanceKm == d,
                            onSelected: (_) => setState(
                              () => _draft = d == null
                                  ? _draft.copyWith(clearMaxDistance: true)
                                  : _draft.copyWith(maxDistanceKm: d),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    _sectionTitle(context, 'Max price'),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Any price'),
                      value: _draft.maxPricePkr == null,
                      onChanged: (any) => setState(
                        () => _draft = any
                            ? _draft.copyWith(clearMaxPrice: true)
                            : _draft.copyWith(maxPricePkr: _priceSlider),
                      ),
                    ),
                    if (_draft.maxPricePkr != null) ...[
                      Slider(
                        min: 500,
                        max: 100000,
                        divisions: 199,
                        value: _priceSlider.clamp(500, 100000),
                        label: formatRs(_priceSlider),
                        onChanged: (v) => setState(() {
                          _priceSlider = v;
                          _draft = _draft.copyWith(maxPricePkr: v);
                        }),
                      ),
                      Text(
                        'Up to ${formatRs(_priceSlider)}',
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                    ],
                    const SizedBox(height: 12),
                    _sectionTitle(context, 'Availability'),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Available only'),
                      value: _draft.onlyAvailable,
                      onChanged: (v) => setState(
                        () => _draft = _draft.copyWith(onlyAvailable: v),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _sectionTitle(context, 'Sort by'),
                    RadioGroup<ExploreSort>(
                      groupValue: _draft.sort,
                      onChanged: (v) =>
                          setState(() => _draft = _draft.copyWith(sort: v)),
                      child: Column(
                        children: [
                          for (final sort in ExploreSort.values)
                            RadioListTile<ExploreSort>(
                              contentPadding: EdgeInsets.zero,
                              title: Text(_sortLabel(sort)),
                              value: sort,
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(_draft),
                  child: const Text('Show results'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(BuildContext context, String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text,
      style: Theme.of(context).textTheme.titleMedium
          ?.copyWith(fontWeight: FontWeight.w700),
    ),
  );
}
