import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../cloudinary_config.dart';
import '../theme/app_theme.dart';
import '../utils/trust_score.dart';
import '../../data/models/item.dart';
import '../../data/models/user.dart';

/// Bottom inset for tab lists, so the last row always scrolls clear of
/// the floating "List item" button and the navigation bar.
const double kBottomListPadding = 96.0;

IconData categoryIcon(String category) {
  switch (category) {
    case 'Tools':
      return Icons.build;
    case 'Outdoor & Camping':
      return Icons.terrain;
    case 'Party & Events':
      return Icons.celebration;
    case 'Kitchen':
      return Icons.kitchen;
    case 'Electronics':
      return Icons.devices;
    case 'Sports':
      return Icons.sports;
    case 'Kids & Baby':
      return Icons.child_friendly;
    case 'Cars & Vehicles':
      return Icons.directions_car;
    case 'Houses & Places':
      return Icons.house;
    case 'Indoor Sports':
      return Icons.sports_tennis;
    default:
      return Icons.inventory_2;
  }
}

/// True for photo strings that should load over the network. Anything
/// else is treated as a local file path (e.g. from the image picker).
bool isNetworkPhotoSource(String source) =>
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('blob:');

/// Category tile used as the photo placeholder and error fallback.
/// Expands to [width]/[height] when given; the icon stays modest.
Widget _photoFallback(
  BuildContext context,
  String category, {
  required double iconSize,
  double? width,
  double? height,
}) => Container(
  width: width,
  height: height,
  color: Theme.of(context).colorScheme.surfaceContainerHighest,
  child: Center(
    child: Icon(
      categoryIcon(category),
      color: Theme.of(context).colorScheme.primary,
      size: iconSize,
    ),
  ),
);

/// Renders one photo [source] of an item, whatever kind of source it is:
/// network URL (seeded picsum photos) or a local file path (photos picked
/// on the phone, which live in the same photos list). Local files are
/// web-guarded — on web a file path falls back to a network load attempt,
/// which ends at the category fallback if it cannot load.
Widget itemPhotoImage(
  String source, {
  required String category,
  BoxFit fit = BoxFit.cover,
  double fallbackSize = 72,
  double? width,
  double? height,
}) {
  if (isNetworkPhotoSource(source) || kIsWeb) {
    return Image.network(
      // Phase 4: Cloudinary photos are served with the card transform
      // (smaller, auto-format); foreign URLs pass through unchanged.
      cardImageUrl(source),
      fit: fit,
      width: width,
      height: height,
      loadingBuilder: (context, child, progress) => progress == null
          ? child
          : _photoFallback(
              context,
              category,
              iconSize: fallbackSize * 0.5,
              width: width,
              height: height,
            ),
      errorBuilder: (context, _, _) => _photoFallback(
        context,
        category,
        iconSize: fallbackSize * 0.5,
        width: width,
        height: height,
      ),
    );
  }
  return Image.file(
    File(source),
    fit: fit,
    width: width,
    height: height,
    errorBuilder: (context, _, _) => _photoFallback(
      context,
      category,
      iconSize: fallbackSize * 0.5,
      width: width,
      height: height,
    ),
  );
}

/// Square photo thumbnail for an item: its first photo when it has one,
/// the category tile when it truly has none.
class ItemPhoto extends StatelessWidget {
  final String? photo;
  final String category;
  final double width;
  final double height;
  final double radius;

  const ItemPhoto({
    super.key,
    required this.photo,
    required this.category,
    this.width = 72,
    this.height = 72,
    this.radius = 14,
  });

  factory ItemPhoto.forItem(
    Item item, {
    Key? key,
    double width = 72,
    double height = 72,
    double radius = 14,
  }) {
    return ItemPhoto(
      key: key,
      photo: item.photos.isEmpty ? null : item.photos.first,
      category: item.category,
      width: width,
      height: height,
      radius: radius,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (photo == null) {
      return CategoryTile(category: category, size: width);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        width: width,
        height: height,
        child: itemPhotoImage(
          photo!,
          category: category,
          fit: BoxFit.cover,
          fallbackSize: width,
          width: width,
          height: height,
        ),
      ),
    );
  }
}

/// Foreground color for a trust tier, used as text/icon color on a
/// tinted chip. Dark variants are lightened to keep AA contrast on
/// the dark surfaces.
Color tierColor(String tierName, [Brightness brightness = Brightness.light]) {
  final dark = brightness == Brightness.dark;
  switch (tierName) {
    case 'Community Pillar':
      return dark ? AppColors.darkMoss : AppColors.mossDark;
    case 'Trusted':
      return dark ? AppColors.darkMoss : AppColors.moss;
    case 'Reliable':
      return amberAccentColor(brightness);
    default:
      return dark ? AppColors.darkInkSoft : AppColors.barkLight;
  }
}

class TrustBadge extends StatelessWidget {
  final TrustScoreResult result;
  final bool compact;
  const TrustBadge({super.key, required this.result, this.compact = false});
  @override
  Widget build(BuildContext context) {
    final color = tierColor(result.tierName, Theme.of(context).brightness);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.verified, size: compact ? 13 : 15, color: color),
          const SizedBox(width: 4),
          Text(
            '${result.total} · ${result.tierName}',
            style: TextStyle(
              fontSize: compact ? 11 : 12,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class UserAvatar extends StatelessWidget {
  final AppUser user;
  final double radius;
  const UserAvatar({super.key, required this.user, this.radius = 20});
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: radius,
      backgroundColor: scheme.secondary.withValues(alpha: 0.18),
      child: Text(
        user.initials,
        style: TextStyle(
          fontSize: radius * 0.8,
          fontWeight: FontWeight.w700,
          color: scheme.secondary,
        ),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  final String status;
  final bool isOverdue;
  const StatusChip({super.key, required this.status, this.isOverdue = false});
  @override
  Widget build(BuildContext context) {
    final label = isOverdue ? 'Overdue' : _label(status);
    final color = isOverdue
        ? Theme.of(context).colorScheme.error
        : _color(status, Theme.of(context).brightness);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }

  String _label(String s) {
    switch (s) {
      case 'pending':
        return 'Pending';
      case 'approved':
        return 'Approved';
      case 'active':
        return 'Active';
      case 'returned':
        return 'Returned';
      case 'completed':
        return 'Completed';
      case 'reviewed':
        return 'Reviewed';
      case 'declined':
        return 'Declined';
      case 'cancelled':
        return 'Cancelled';
      default:
        return s;
    }
  }

  Color _color(String s, Brightness brightness) {
    final dark = brightness == Brightness.dark;
    switch (s) {
      case 'pending':
        return amberAccentColor(brightness);
      case 'approved':
        return dark ? AppColors.darkMoss : AppColors.moss;
      case 'active':
        return dark ? AppColors.darkPrimary : AppColors.terracotta;
      case 'returned':
        return dark ? AppColors.darkMoss : AppColors.mossDark;
      case 'completed':
        return dark ? AppColors.darkMoss : AppColors.moss;
      case 'reviewed':
        return dark ? AppColors.darkInkSoft : AppColors.barkLight;
      case 'declined':
        return dark ? AppColors.darkError : AppColors.errorRed;
      default:
        return dark ? AppColors.darkInkSoft : AppColors.barkLight;
    }
  }
}

class CategoryTile extends StatelessWidget {
  final String category;
  final double size;
  const CategoryTile({super.key, required this.category, this.size = 56});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(
        categoryIcon(category),
        color: Theme.of(context).colorScheme.primary,
        size: size * 0.5,
      ),
    );
  }
}

/// Celebration feedback for a completed action: a moss-green check that
/// pops in with a short easeOutBack scale animation, plus a short
/// explanation. Used after publishing a listing and sending a request.
Future<void> showSuccessDialog(
  BuildContext context, {
  required String title,
  required String message,
}) {
  return showDialog<void>(
    context: context,
    builder: (_) => _SuccessDialog(title: title, message: message),
  );
}

class _SuccessDialog extends StatefulWidget {
  final String title;
  final String message;
  const _SuccessDialog({required this.title, required this.message});
  @override
  State<_SuccessDialog> createState() => _SuccessDialogState();
}

class _SuccessDialogState extends State<_SuccessDialog>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 250),
  )..forward();
  late final Animation<double> _scale = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutBack,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          ScaleTransition(
            scale: _scale,
            child: Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.secondary,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.check,
                color: Theme.of(context).colorScheme.onSecondary,
                size: 40,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            widget.title,
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(widget.message, textAlign: TextAlign.center),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ),
        ],
      ),
    );
  }
}

/// The multicolour Google 'G', painted (no asset) so it stays
/// crisp at any size. Moved here from the old animated login
/// backdrop so any auth surface can use it.
class GoogleGLogo extends StatelessWidget {
  final double size;

  const GoogleGLogo({super.key, this.size = 22});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(size: Size.square(size), painter: _GoogleGPainter());
  }
}

class _GoogleGPainter extends CustomPainter {
  static const _blue = Color(0xFF4285F4);
  static const _red = Color(0xFFEA4335);
  static const _yellow = Color(0xFFFBBC05);
  static const _green = Color(0xFF34A853);

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.235;
    final radius = (size.width - stroke) / 2;
    final center = Offset(size.width / 2, size.height / 2);
    final ring = Rect.fromCircle(center: center, radius: radius);

    Paint arc(Color color) => Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.butt;

    // Angles are radians, clockwise-positive, 0 at 3 o'clock. Each
    // segment starts a hair before the previous one ends so no
    // hairline gap shows between colours.
    // Red over the top.
    canvas.drawArc(ring, -0.13 * math.pi, -0.76 * math.pi, false, arc(_red));
    // Yellow down the left to the lower-left.
    canvas.drawArc(ring, -0.88 * math.pi, -0.42 * math.pi, false, arc(_yellow));
    // Green along the bottom.
    canvas.drawArc(ring, 0.71 * math.pi, -0.40 * math.pi, false, arc(_green));
    // Blue up the right side, meeting the red.
    canvas.drawArc(ring, 0.32 * math.pi, -0.47 * math.pi, false, arc(_blue));
    // The blue bar, exactly the ring's thickness so it merges with
    // the blue arc at 3 o'clock.
    canvas.drawRect(
      Rect.fromLTRB(
        center.dx - stroke * 0.12,
        center.dy - stroke / 2,
        size.width - stroke * 0.05,
        center.dy + stroke / 2,
      ),
      Paint()..color = _blue,
    );
  }

  @override
  bool shouldRepaint(_GoogleGPainter oldDelegate) => false;
}
