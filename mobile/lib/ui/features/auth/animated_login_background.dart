import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/section_colors.dart';
import '../../../data/models/listing.dart';

/// The animated backdrop for the login screen (Phase 10 polish):
/// a slowly drifting gradient mesh in the brand's warm palette
/// (terracotta / moss / cream — warm charcoal in dark mode), soft
/// floating shapes, and the four section icons (+ a chat bubble)
/// drifting with parallax, each tinted with its section accent.
///
/// Built only from [AnimationController] + [CustomPainter] — no
/// packages, no animation files. When [reduceMotion] is true (the
/// phone's "remove animations" setting) the whole thing renders as
/// one static, composed frame and no controller runs. The drift also
/// pauses while the app is backgrounded.
class AnimatedLoginBackground extends StatefulWidget {
  final bool reduceMotion;

  const AnimatedLoginBackground({super.key, required this.reduceMotion});

  @override
  State<AnimatedLoginBackground> createState() =>
      _AnimatedLoginBackgroundState();
}

class _AnimatedLoginBackgroundState extends State<AnimatedLoginBackground>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  /// One full drift cycle. Slow on purpose — this is ambience, and a
  /// 26 s loop keeps a low-end phone's GPU almost idle between the
  /// (tiny) repaints.
  late final AnimationController _drift = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 26),
  );

  /// The composition the static (reduced-motion) frame freezes at.
  static const _frozenProgress = 0.32;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (!widget.reduceMotion) _drift.repeat();
  }

  @override
  void didUpdateWidget(covariant AnimatedLoginBackground oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.reduceMotion) {
      _drift.stop();
    } else if (!_drift.isAnimating) {
      _drift.repeat();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Nothing should animate (or burn battery) while the app is not
    // on screen.
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
    final brightness = Theme.of(context).brightness;
    return AnimatedBuilder(
      animation: _drift,
      builder: (context, _) {
        final t = _progress;
        return Stack(
          fit: StackFit.expand,
          children: [
            CustomPaint(
              painter: _MeshPainter(progress: t, brightness: brightness),
              size: Size.infinite,
            ),
            ..._floaters(brightness, t),
          ],
        );
      },
    );
  }

  List<Widget> _floaters(Brightness brightness, double t) {
    return [
      for (final f in _kFloaters)
        Positioned.fill(
          child: Align(
            alignment: Alignment(f.x * 2 - 1, f.y * 2 - 1),
            child: Transform.translate(
              offset: Offset(
                math.sin(t * math.pi * 2 * f.speed + f.phase) * f.amp,
                math.cos(t * math.pi * 2 * f.speed * 0.83 + f.phase * 1.3) *
                    f.amp,
              ),
              child: _FloaterChip(floater: f, brightness: brightness),
            ),
          ),
        ),
    ];
  }
}

/// One drifting icon: which section accent it wears, how big it is,
/// where it hovers (as a fraction of the screen), and its private
/// drift rhythm so nothing moves in lockstep.
class _Floater {
  final IconData icon;
  final Color Function(Brightness) colorOf;
  final double size;
  final double x;
  final double y;
  final double phase;
  final double speed;
  final double amp;

  const _Floater({
    required this.icon,
    required this.colorOf,
    required this.size,
    required this.x,
    required this.y,
    required this.phase,
    required this.speed,
    required this.amp,
  });
}

final _kFloaters = <_Floater>[
  _Floater(
    icon: Icons.directions_car_outlined,
    colorOf: (b) => sectionAccentColor(ListingSection.vehicles, b),
    size: 54,
    x: 0.85,
    y: 0.10,
    phase: 0.4,
    speed: 0.9,
    amp: 9,
  ),
  _Floater(
    icon: Icons.handyman_outlined,
    colorOf: (b) => sectionAccentColor(ListingSection.items, b),
    size: 46,
    x: 0.10,
    y: 0.13,
    phase: 1.8,
    speed: 0.7,
    amp: 11,
  ),
  _Floater(
    icon: Icons.house_outlined,
    colorOf: (b) => sectionAccentColor(ListingSection.properties, b),
    size: 50,
    x: 0.90,
    y: 0.34,
    phase: 3.1,
    speed: 1.15,
    amp: 8,
  ),
  _Floater(
    icon: Icons.chat_bubble_outline,
    colorOf: (b) => b == Brightness.dark ? AppColors.darkMoss : AppColors.moss,
    size: 40,
    x: 0.06,
    y: 0.40,
    phase: 4.4,
    speed: 0.8,
    amp: 10,
  ),
  _Floater(
    icon: Icons.sports_soccer,
    colorOf: (b) => sectionAccentColor(ListingSection.arenas, b),
    size: 44,
    x: 0.14,
    y: 0.72,
    phase: 5.5,
    speed: 1.0,
    amp: 9,
  ),
];

class _FloaterChip extends StatelessWidget {
  final _Floater floater;
  final Brightness brightness;

  const _FloaterChip({required this.floater, required this.brightness});

  @override
  Widget build(BuildContext context) {
    final accent = floater.colorOf(brightness);
    final dark = brightness == Brightness.dark;
    return Container(
      width: floater.size,
      height: floater.size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: accent.withValues(alpha: dark ? 0.16 : 0.12),
        border: Border.all(color: accent.withValues(alpha: dark ? 0.4 : 0.3)),
      ),
      child: Icon(
        floater.icon,
        size: floater.size * 0.52,
        color: accent.withValues(alpha: dark ? 0.95 : 0.9),
      ),
    );
  }
}

/// Paints the gradient mesh: a flat canvas base, four large radial
/// "blobs" of brand colour that wander slowly, two small soft
/// circles for depth, and a veil that settles the lower half back to
/// near-solid canvas so the form and its text always sit on a calm,
/// high-contrast ground.
class _MeshPainter extends CustomPainter {
  final double progress;
  final Brightness brightness;

  _MeshPainter({required this.progress, required this.brightness});

  @override
  void paint(Canvas canvas, Size size) {
    final dark = brightness == Brightness.dark;
    final base = dark ? AppColors.darkCanvas : AppColors.cream;
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = base);

    final w = size.width;
    final h = size.height;
    final t = progress * math.pi * 2;

    void blob({
      required Color color,
      required double alpha,
      required double cx,
      required double cy,
      required double radius,
      required double driftX,
      required double driftY,
      required double phase,
    }) {
      final center = Offset(
        (cx + math.sin(t + phase) * driftX) * w,
        (cy + math.cos(t * 0.8 + phase) * driftY) * h,
      );
      final r = radius * w;
      final shader = RadialGradient(
        colors: [
          color.withValues(alpha: alpha),
          color.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromCircle(center: center, radius: r));
      canvas.drawCircle(center, r, Paint()..shader = shader);
    }

    if (dark) {
      blob(
        color: AppColors.terracotta,
        alpha: 0.30,
        cx: 0.08,
        cy: 0.02,
        radius: 0.95,
        driftX: 0.05,
        driftY: 0.03,
        phase: 0.0,
      );
      blob(
        color: AppColors.moss,
        alpha: 0.22,
        cx: 0.95,
        cy: 0.10,
        radius: 0.85,
        driftX: 0.04,
        driftY: 0.04,
        phase: 2.1,
      );
      blob(
        color: AppColors.amber,
        alpha: 0.12,
        cx: 0.85,
        cy: 0.55,
        radius: 0.7,
        driftX: 0.03,
        driftY: 0.05,
        phase: 4.0,
      );
      blob(
        color: AppColors.darkPrimary,
        alpha: 0.12,
        cx: 0.05,
        cy: 0.62,
        radius: 0.75,
        driftX: 0.05,
        driftY: 0.03,
        phase: 5.3,
      );
    } else {
      blob(
        color: AppColors.terracotta,
        alpha: 0.26,
        cx: 0.05,
        cy: 0.0,
        radius: 0.95,
        driftX: 0.05,
        driftY: 0.03,
        phase: 0.0,
      );
      blob(
        color: AppColors.moss,
        alpha: 0.20,
        cx: 0.98,
        cy: 0.08,
        radius: 0.85,
        driftX: 0.04,
        driftY: 0.04,
        phase: 2.1,
      );
      blob(
        color: AppColors.amber,
        alpha: 0.16,
        cx: 0.9,
        cy: 0.52,
        radius: 0.7,
        driftX: 0.03,
        driftY: 0.05,
        phase: 4.0,
      );
      blob(
        color: AppColors.terracotta,
        alpha: 0.12,
        cx: 0.02,
        cy: 0.6,
        radius: 0.75,
        driftX: 0.05,
        driftY: 0.03,
        phase: 5.3,
      );
    }

    // Two small soft circles drifting against the blobs' rhythm —
    // cheap depth without extra widgets.
    void softCircle(double cx, double cy, double r, Color color, double a) {
      final center = Offset(
        (cx + math.sin(t * 0.7 + cx * 9) * 0.03) * w,
        (cy + math.cos(t * 0.6 + cy * 7) * 0.03) * h,
      );
      canvas.drawCircle(
        center,
        r * w,
        Paint()..color = color.withValues(alpha: a),
      );
    }

    softCircle(
      0.28,
      0.30,
      0.055,
      dark ? AppColors.darkPrimary : AppColors.terracotta,
      dark ? 0.10 : 0.08,
    );
    softCircle(
      0.72,
      0.24,
      0.04,
      dark ? AppColors.darkMoss : AppColors.moss,
      dark ? 0.12 : 0.09,
    );

    // Veil: from transparent at 40% height to almost-solid canvas at
    // the bottom, so anything in the lower half (the form card zone)
    // reads against a quiet background in both themes.
    final veilRect = Rect.fromLTWH(0, h * 0.40, w, h * 0.60);
    final veil = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        base.withValues(alpha: 0),
        base.withValues(alpha: 0.88),
        base.withValues(alpha: 0.97),
      ],
      stops: const [0, 0.65, 1],
    ).createShader(veilRect);
    canvas.drawRect(veilRect, Paint()..shader = veil);
  }

  @override
  bool shouldRepaint(_MeshPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.brightness != brightness;
}

/// The official multicolour Google "G", drawn with [CustomPainter]:
/// four brand-colour arcs (red over the top, yellow down the left,
/// green along the bottom, blue up the right) plus the blue bar.
/// No asset files, no packages.
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
