import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/map_projection.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/item.dart';
import '../../../state/app_state.dart';
import '../item_detail/item_detail_screen.dart';

/// Custom-painted neighborhood map: pins are placed with the same
/// uniform-scale projection as the web app, so spacing and the radius
/// ring match real kilometers.
class ItemMapView extends StatefulWidget {
  final List<Item> items;
  final double? maxDistanceKm;
  const ItemMapView({super.key, required this.items, this.maxDistanceKm});
  @override
  State<ItemMapView> createState() => _ItemMapViewState();
}

class _ItemMapViewState extends State<ItemMapView> {
  Item? _selected;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.currentUser;
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    if (widget.items.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'No items to map — try widening your distance or clearing filters.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    // The info layer (pin preview card / hint pill) floats over
    // the map's bottom edge instead of sitting under it in a
    // Column. As a Column child its height was content-bound: at
    // short landscape heights with large text (568x320 @ 2.0x in
    // the CI overflow harness) the hint text alone was taller
    // than the whole height the screen gave this view, the map's
    // Expanded collapsed to zero and the Column overflowed. As an
    // overlay, the info height no longer competes with the map,
    // so no font metrics can overflow the layout.
    return Stack(
      children: [
        Positioned.fill(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final bounds = MapBounds(
                  width: constraints.maxWidth,
                  height: constraints.maxHeight,
                  padding: 36,
                );
                final projection = createProjection(
                  widget.items.map((i) => i.location).toList(),
                  me.homeLocation,
                  bounds,
                  widget.maxDistanceKm,
                );
                final centerPx = projection.project(me.homeLocation);
                return ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Container(
                    color: dark
                        ? scheme.surfaceContainerHighest
                        : const Color(0xFFEFE7D3),
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: CustomPaint(
                            painter: _MapPainter(
                              projection: projection,
                              center: centerPx,
                              gridColor: dark
                                  ? scheme.onSurface.withValues(alpha: 0.07)
                                  : Colors.white.withValues(alpha: 0.55),
                              ringColor: scheme.secondary,
                            ),
                          ),
                        ),
                        // "You" marker
                        Positioned(
                          left: centerPx.x - 14,
                          top: centerPx.y - 14,
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: AppColors.moss,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 3),
                            ),
                            child: const Icon(
                              Icons.person,
                              size: 14,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        ...widget.items.map((item) {
                          final px = projection.project(item.location);
                          final selected = _selected?.id == item.id;
                          return Positioned(
                            left: px.x - 18,
                            top: px.y - 36,
                            child: GestureDetector(
                              onTap: () => setState(() => _selected = item),
                              child: Icon(
                                Icons.location_on,
                                size: 36,
                                color: selected
                                    ? (dark
                                          ? scheme.primary
                                          : AppColors.terracottaDark)
                                    : (dark
                                          ? scheme.primary.withValues(
                                              alpha: 0.6,
                                            )
                                          : AppColors.terracotta),
                              ),
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 12,
          child: _selected != null
              ? Card(
                  child: ListTile(
                    leading: ItemPhoto.forItem(
                      _selected!,
                      width: 44,
                      height: 44,
                      radius: 12,
                    ),
                    title: Text(
                      _selected!.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(
                      '${distanceLabel(distanceKm(me.homeLocation, _selected!.location))} · ${_selected!.isAvailable ? 'Available' : _selected!.availability}',
                    ),
                    trailing: ElevatedButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) =>
                              ItemDetailScreen(itemId: _selected!.id),
                        ),
                      ),
                      child: const Text('View'),
                    ),
                  ),
                )
              : Center(
                  // Pill background: the hint now sits on top of
                  // the map instead of the page background, so it
                  // needs its own surface to stay readable.
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: scheme.surface,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x29000000),
                          blurRadius: 4,
                          offset: Offset(0, 1),
                        ),
                      ],
                    ),
                    child: Text(
                      'Tap a pin to preview the item.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class _MapPainter extends CustomPainter {
  final MapProjection projection;
  final ProjectedPoint center;
  final Color gridColor;
  final Color ringColor;
  const _MapPainter({
    required this.projection,
    required this.center,
    required this.gridColor,
    required this.ringColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // Simple street-ish grid so the map reads as a map, not a blank panel.
    final grid = Paint()
      ..color = gridColor
      ..strokeWidth = 10;
    for (var x = 24.0; x < size.width; x += 72) {
      canvas.drawLine(Offset(x, 0), Offset(x + 18, size.height), grid);
    }
    for (var y = 20.0; y < size.height; y += 84) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y + 14), grid);
    }
    final radius = projection.radiusPx;
    if (radius != null) {
      final ring = Paint()..color = ringColor.withValues(alpha: 0.10);
      canvas.drawCircle(Offset(center.x, center.y), radius, ring);
      final ringBorder = Paint()
        ..color = ringColor.withValues(alpha: 0.5)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6;
      canvas.drawCircle(Offset(center.x, center.y), radius, ringBorder);
    }
  }

  @override
  bool shouldRepaint(covariant _MapPainter old) =>
      old.projection != projection ||
      old.center != center ||
      old.gridColor != gridColor ||
      old.ringColor != ringColor;
}
