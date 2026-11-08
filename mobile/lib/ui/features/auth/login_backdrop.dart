import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// The login screen's backdrop: two large, very soft color fields
/// drifting slowly behind the content — terracotta + moss over
/// the light canvas, warm neutrals over the dark canvas. No
/// shapes, no icons, nothing competing with the sign-in card:
/// both fields hug the corners, so the middle of the screen (where
/// the card sits) stays at plain canvas color and text contrast
/// is untouched.
///
/// The drift runs on a 14 s loop drawn with a [CustomPainter]
/// (two radial gradients — cheap enough for low-end phones) and
/// pauses while the app is backgrounded. With [reduceMotion] the
/// backdrop renders one static frame and no controller runs.
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    final blobA = dark
        ? AppColors.darkPrimary.withValues(alpha: 0.09)
        : AppColors.terracotta.withValues(alpha: 0.13);
    final blobB = dark
        ? const Color(0xFFB08D57).withValues(alpha: 0.07)
        : AppColors.moss.withValues(alpha: 0.11);
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _drift,
        builder: (context, _) => CustomPaint(
          painter: _BackdropPainter(
            progress: _progress,
            blobA: blobA,
            blobB: blobB,
          ),
          size: Size.infinite,
        ),
      ),
    );
  }
}

/// Paints the two drifting color fields. Each is a radial
/// gradient disc whose alpha fades to zero at its edge, centered
/// just off a corner; the centers glide a few percent of the
/// screen size on a slow circular path, phase-shifted so the
/// pair never moves in lockstep.
class _BackdropPainter extends CustomPainter {
  final double progress;
  final Color blobA;
  final Color blobB;

  const _BackdropPainter({
    required this.progress,
    required this.blobA,
    required this.blobB,
  });

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
  }

  @override
  bool shouldRepaint(_BackdropPainter oldDelegate) =>
      progress != oldDelegate.progress ||
      blobA != oldDelegate.blobA ||
      blobB != oldDelegate.blobB;
}
