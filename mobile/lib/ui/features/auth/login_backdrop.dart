import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/section_colors.dart';
import '../../../data/models/listing.dart';

/// The login screen's animated backdrop ("Open Door" refresh):
/// a slowly drifting warm gradient mesh in the brand palette —
/// terracotta, moss and a soft cream light (warm neutrals in
/// dark mode) — with the four section icons and a chat bubble
/// floating gently at the edges in their exact kit accent
/// colors, at individual parallax phases.
///
/// The composition keeps the middle of the screen calm: the
/// fields hug the corners, the icons stay near the edges, and a
/// canvas veil sits over the content zone, so the wordmark,
/// tagline and sign-in card keep their AA contrast over the
/// moving background.
///
/// The drift runs on a 14 s loop (CustomPainter fields + a few
/// transformed icon tiles — cheap enough for low-end phones)
/// and pauses while the app is backgrounded. With
/// [reduceMotion] the backdrop renders one static frame and no
/// controller runs.
class LoginBackdrop extends StatefulWidget {
  final bool reduceMotion;

  const LoginBackdrop({super.key, required this.reduceMotion});

  @override
  State<LoginBackdrop> createState() => _LoginBackdropState();
}

class _LoginBackdropState extends State<LoginBackdrop>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _drift = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 14),
  );

  /// The composition the static (reduced-motion) frame freezes at.
  static const _frozenProgress = 0.3;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (!widget.reduceMotion) _drift.repeat();
  }

  @override
  void didUpdateWidget(covariant LoginBackdrop oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.reduceMotion) {
      _drift.stop();
    } else if (!_drift.isAnimating) {
      _drift.repeat();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Nothing should animate (or burn battery) off-screen.
    if (state == AppLifecycleState.resumed) {
      if (!widget.reduceMotion && !_drift.isAnimating) _drift.repeat();
    } else {
      _drift.stop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _drift.dispose();
    super.dispose();
  }

  double get _progress => widget.reduceMotion ? _frozenProgress : _drift.value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final canvas = theme.scaffoldBackgroundColor;
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _drift,
        builder: (context, _) {
          final p = _progress;
          return Stack(
            fit: StackFit.expand,
            children: [
              CustomPaint(
                painter: _MeshPainter(progress: p, dark: dark),
                size: Size.infinite,
              ),
              ..._floatingIcons(context, p, dark),
              // The calm veil: strongest where the brand block and
              // card sit, feathered at the edges, so text contrast
              // never depends on the mesh phase.
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      canvas.withValues(alpha: 0.30),
                      canvas.withValues(alpha: 0.62),
                      canvas.withValues(alpha: 0.30),
                    ],
                    stops: const [0.0, 0.45, 1.0],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  /// The floating icon tiles, one per marketplace section plus a
  /// chat bubble (moss, the trust color). Each hugs an edge and
  /// drifts on its own slow phase; none enters the card zone.
  List<Widget> _floatingIcons(BuildContext context, double p, bool dark) {
    final phase = p * 2 * math.pi;
    _Float spec(
      IconData icon,
      Color color, {
      required double fx,
      required double fy,
      required double drift,
      required double speed,
      required double size,
    }) => _Float(
      icon: icon,
      color: color,
      fx: fx,
      fy: fy,
      drift: drift,
      speed: speed,
      size: size,
    );
    final specs = [
      spec(
        Icons.directions_car_outlined,
        sectionAccentColor(
          ListingSection.vehicles,
          Theme.of(context).brightness,
        ),
        fx: 0.86,
        fy: 0.10,
        drift: 13,
        speed: 1.0,
        size: 50,
      ),
      spec(
        Icons.build_outlined,
        sectionAccentColor(ListingSection.items, Theme.of(context).brightness),
        fx: 0.07,
        fy: 0.16,
        drift: 10,
        speed: 0.8,
        size: 44,
      ),
      spec(
        Icons.home_outlined,
        sectionAccentColor(
          ListingSection.properties,
          Theme.of(context).brightness,
        ),
        fx: 0.90,
        fy: 0.42,
        drift: 11,
        speed: 0.65,
        size: 46,
      ),
      spec(
        Icons.sports_soccer_outlined,
        sectionAccentColor(ListingSection.arenas, Theme.of(context).brightness),
        fx: 0.08,
        fy: 0.78,
        drift: 14,
        speed: 0.9,
        size: 48,
      ),
      spec(
        Icons.chat_bubble_outline,
        dark ? AppColors.darkMoss : AppColors.moss,
        fx: 0.88,
        fy: 0.82,
        drift: 9,
        speed: 0.7,
        size: 42,
      ),
    ];
    return specs.map((s) {
      final dx = s.drift * math.sin(phase * s.speed + s.fx * 9.0);
      final dy = s.drift * math.cos(phase * s.speed * 0.9 + s.fy * 7.0);
      return Positioned.fill(
        child: Align(
          alignment: Alignment(s.fx * 2 - 1, s.fy * 2 - 1),
          child: Transform.translate(
            offset: Offset(dx, dy),
            child: Container(
              width: s.size,
              height: s.size,
              decoration: BoxDecoration(
                color: s.color.withValues(alpha: dark ? 0.20 : 0.13),
                shape: BoxShape.circle,
              ),
              child: Icon(
                s.icon,
                size: s.size * 0.52,
                color: s.color.withValues(alpha: 0.9),
              ),
            ),
          ),
        ),
      );
    }).toList();
  }
}

/// One floating icon's placement + motion parameters. [fx]/[fy]
/// are fractional anchor positions (0..1 across the screen).
class _Float {
  final IconData icon;
  final Color color;
  final double fx;
  final double fy;
  final double drift;
  final double speed;
  final double size;

  const _Float({
    required this.icon,
    required this.color,
    required this.fx,
    required this.fy,
    required this.drift,
    required this.speed,
    required this.size,
  });
}

/// Paints the drifting mesh: three radial-gradient fields whose
/// alpha fades to zero at their edges, centered just off the
/// corners and gliding a few percent of the screen size on slow
/// circular paths, phase-shifted so they never move in lockstep.
/// Colors are the kit tokens (terracotta, moss, cream light);
/// dark mode uses warm neutrals over the charcoal canvas.
class _MeshPainter extends CustomPainter {
  final double progress;
  final bool dark;

  const _MeshPainter({required this.progress, required this.dark});

  void _field(Canvas canvas, Offset center, double radius, Color color) {
    final rect = Rect.fromCircle(center: center, radius: radius);
    final paint = Paint()
      ..shader = RadialGradient(colors: [color, color.withValues(alpha: 0)])
          .createShader(rect);
    canvas.drawCircle(center, radius, paint);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final phase = progress * 2 * math.pi;
    final blobA = dark
        ? AppColors.darkPrimary.withValues(alpha: 0.09)
        : AppColors.terracottaDark.withValues(alpha: 0.13);
    final blobB = dark
        ? const Color(0xFFB08D57).withValues(alpha: 0.07)
        : AppColors.moss.withValues(alpha: 0.11);
    final blobC = dark
        ? AppColors.darkPrimary.withValues(alpha: 0.05)
        : const Color(0xFFFFF3DF).withValues(alpha: 0.55);
    // Terracotta field: top-right, mostly off-screen.
    _field(
      canvas,
      Offset(
        w * (0.86 + 0.06 * math.sin(phase)),
        h * (0.04 + 0.03 * math.cos(phase)),
      ),
      w * 0.85,
      blobA,
    );
    // Moss / warm-neutral field: bottom-left, mostly off-screen.
    _field(
      canvas,
      Offset(
        w * (0.04 + 0.05 * math.cos(phase + 1.2)),
        h * (0.99 + 0.02 * math.sin(phase + 0.6)),
      ),
      w * 0.8,
      blobB,
    );
    // Cream light: top-left, a soft warm wash (dark mode: a
    // second, fainter terracotta glow instead).
    _field(
      canvas,
      Offset(
        w * (0.10 + 0.04 * math.sin(phase + 2.1)),
        h * (0.10 + 0.03 * math.cos(phase + 0.4)),
      ),
      w * 0.62,
      blobC,
    );
  }

  @override
  bool shouldRepaint(_MeshPainter oldDelegate) =>
      progress != oldDelegate.progress || dark != oldDelegate.dark;
}
