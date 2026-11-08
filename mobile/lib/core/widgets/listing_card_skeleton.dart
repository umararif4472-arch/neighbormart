import 'package:flutter/material.dart';

/// Placeholder cards shown while list content is on its way (Phase 7).
/// No shimmer package: a gentle opacity pulse driven by one animation
/// controller per list, and a completely static render when the user
/// prefers reduced motion.

/// One muted placeholder block.
class SkeletonBlock extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;
  const SkeletonBlock({
    super.key,
    this.width,
    required this.height,
    this.radius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// A placeholder with the same footprint as a listing card: square
/// photo block, title/price/meta lines, and a small badge block.
class ListingCardSkeleton extends StatelessWidget {
  const ListingCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Card(
      margin: EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SkeletonBlock(width: 72, height: 72, radius: 12),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBlock(height: 14),
                  SizedBox(height: 8),
                  SkeletonBlock(width: 110, height: 12),
                  SizedBox(height: 8),
                  SkeletonBlock(width: 150, height: 11),
                ],
              ),
            ),
            SizedBox(width: 12),
            SkeletonBlock(width: 52, height: 24, radius: 12),
          ],
        ),
      ),
    );
  }
}

/// A screenful of pulsing [ListingCardSkeleton]s for list screens.
class ListingListSkeleton extends StatefulWidget {
  final int count;
  const ListingListSkeleton({super.key, this.count = 5});

  @override
  State<ListingListSkeleton> createState() => _ListingListSkeletonState();
}

class _ListingListSkeletonState extends State<ListingListSkeleton>
    with SingleTickerProviderStateMixin {
  AnimationController? _pulse;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (reduceMotion) {
      _pulse?.stop();
      return;
    }
    _pulse ??=
        AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 1100),
        )..addListener(() {
          if (mounted) setState(() {});
        });
    if (!_pulse!.isAnimating) _pulse!.repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Pulse between 55% and full opacity; static 80% under reduced
    // motion (no controller runs then).
    final opacity = _pulse == null ? 0.8 : 0.55 + 0.45 * _pulse!.value;
    return Opacity(
      opacity: opacity,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        itemCount: widget.count,
        itemBuilder: (context, _) => const ListingCardSkeleton(),
      ),
    );
  }
}
