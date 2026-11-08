import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config.dart';
import '../../../core/theme/app_theme.dart';

/// The "Open Door" intro: the signature cold-start sequence.
///
/// The native splash (closed door on terracotta, generated from
/// the brand kit) hands off to this widget, which paints the same
/// door from the kit's own path data — cream arch frame, door-dark
/// leaf on its left hinge, amber knob and welcome mat, in the
/// kit's 512-unit space. While [bootstrap] runs (Firebase init,
/// session restore, theme load — kicked off by main and passed
/// down through the root gate) the knob pulses and the tagline
/// fades in; once the app is ready the leaf swings open with a
/// perspective transform, warm light spills out, and the doorway
/// zooms and cross-fades into [child], the real destination.
///
/// Signed-in users get the short version (~1.2 s). A tap skips
/// the choreography. If loading passes 8 s a friendly note shows;
/// if the bootstrap future fails, a retry button re-runs it.
/// Reduced motion: a static closed door + tagline and a plain
/// fade — no swing, zoom or pulse. Cold start only: this lives
/// at the root gate and is removed the moment it completes.
class DoorIntro extends StatefulWidget {
  /// Runs the app's real bootstrap. Called on mount and again if
  /// the user taps Retry after a failure.
  final Future<void> Function() bootstrap;

  /// Whether a session already exists — selects the short
  /// version of the sequence. Read again when readiness lands,
  /// so a session restored mid-intro still counts.
  final bool signedIn;

  /// Called once, when the intro has fully faded out. The parent
  /// (root gate) removes the intro from the tree.
  final VoidCallback onComplete;

  /// The destination, rendered beneath the intro layer so the
  /// exit is a true cross-fade.
  final Widget child;

  const DoorIntro({
    super.key,
    required this.bootstrap,
    required this.signedIn,
    required this.onComplete,
    required this.child,
  });

  @override
  State<DoorIntro> createState() => _DoorIntroState();
}

class _DoorIntroState extends State<DoorIntro>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  // Choreography timings (ms). Signed-in totals ≈ 1.25 s,
  // signed-out ≈ 2.55 s once the bootstrap has landed.
  int get _enterMs => widget.signedIn ? 320 : 520;
  int get _minWaitMs => widget.signedIn ? 500 : 1250;
  int get _swingMs => widget.signedIn ? 460 : 780;
  int get _exitMs => widget.signedIn ? 300 : 520;

  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  );
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  late final AnimationController _swing = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 780),
  );
  late final AnimationController _exit = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  );

  bool _ready = false;
  bool _failed = false;
  bool _slow = false;
  bool _opening = false;
  bool _skipped = false;
  bool _completed = false;
  bool _reduceMotion = false;
  bool? _lastReduceMotion;
  Timer? _minTimer;
  Timer? _slowTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _enter.duration = Duration(milliseconds: _enterMs);
    _enter.addStatusListener((status) {
      if (status == AnimationStatus.completed) _maybeOpen();
    });
    _runBootstrap();
    _minTimer = Timer(Duration(milliseconds: _minWaitMs), _maybeOpen);
    _enter.forward();
    _pulse.repeat(reverse: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // MediaQuery fires this again for unrelated changes (keyboard,
    // insets) — only react when the reduced-motion value flips.
    final reduce = MediaQuery.of(context).disableAnimations;
    if (_lastReduceMotion == reduce) return;
    _lastReduceMotion = reduce;
    _reduceMotion = reduce;
    if (reduce) {
      // Static version: park every controller at its rest state.
      _enter.value = 1;
      _pulse.stop();
      _swing.stop();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The knob pulse is the only idle animation; stop it (and the
    // drift of time-based state) while the app is backgrounded.
    if (state == AppLifecycleState.resumed) {
      if (!_reduceMotion && !_opening && !_completed) {
        _pulse.repeat(reverse: true);
      }
    } else {
      _pulse.stop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _minTimer?.cancel();
    _slowTimer?.cancel();
    _enter.dispose();
    _pulse.dispose();
    _swing.dispose();
    _exit.dispose();
    super.dispose();
  }

  void _runBootstrap() {
    _slowTimer?.cancel();
    _slowTimer = Timer(const Duration(seconds: 8), () {
      if (mounted && !_ready && !_failed) setState(() => _slow = true);
    });
    Future<void>.sync(widget.bootstrap)
        .then((_) {
          if (!mounted) return;
          setState(() {
            _ready = true;
            _slow = false;
          });
          _maybeOpen();
        })
        .catchError((Object _) {
          if (!mounted) return;
          setState(() {
            _failed = true;
            _slow = false;
          });
          _pulse.stop();
        });
  }

  /// The door opens when the bootstrap has landed, the entrance
  /// has played, and the minimum beat has passed — whichever
  /// finishes last. No artificial delay beyond the minimum.
  void _maybeOpen() {
    if (!mounted || _completed || _opening || _failed) return;
    if (!_ready) return;
    if (_minTimer?.isActive ?? false) return;
    if (!_skipped && _enter.isAnimating) return;
    _opening = true;
    _pulse.stop();
    if (_reduceMotion || _skipped) {
      // No swing: a short plain fade of the whole layer.
      _exit.duration = const Duration(milliseconds: 220);
      _exit.forward().whenComplete(_finish);
    } else {
      HapticFeedback.lightImpact();
      _swing.duration = Duration(milliseconds: _swingMs);
      _swing.forward().then((_) {
        if (!mounted) return;
        _exit.duration = Duration(milliseconds: _exitMs);
        _exit.forward().whenComplete(_finish);
      });
    }
  }

  void _finish() {
    if (!mounted || _completed) return;
    _completed = true;
    widget.onComplete();
    setState(() {});
  }

  /// Tap anywhere: drop the choreography. If the bootstrap is
  /// still running, park in the settled closed-door state and
  /// finish with a plain fade the moment it lands.
  void _skip() {
    if (_opening || _completed || _failed) return;
    setState(() => _skipped = true);
    _enter.value = 1;
    _pulse.stop();
    _minTimer?.cancel();
    _minTimer = null;
    _maybeOpen();
  }

  void _retry() {
    setState(() {
      _failed = false;
      _ready = false;
    });
    if (!_reduceMotion) _pulse.repeat(reverse: true);
    _runBootstrap();
  }

  @override
  Widget build(BuildContext context) {
    if (_completed) return widget.child;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = dark ? AppColors.darkCanvas : AppColors.terracottaDark;
    return Stack(
      children: [
        widget.child,
        AnimatedBuilder(
          animation: Listenable.merge([_enter, _pulse, _swing, _exit]),
          builder: (context, _) {
            final exitT = Curves.easeInCubic.transform(_exit.value);
            final layerOpacity = _exit.value == 0
                ? 1.0
                : (1 - ((_exit.value - 0.3) / 0.7).clamp(0.0, 1.0));
            return Opacity(
              opacity: layerOpacity.clamp(0.0, 1.0),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _skip,
                child: ColoredBox(
                  color: bg,
                  child: SafeArea(child: _content(context, dark, exitT)),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _content(BuildContext context, bool dark, double exitT) {
    // Scroll-safe like the splash it replaces: on short screens
    // with very large text the column scrolls instead of
    // overflowing.
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            minHeight: constraints.maxHeight,
            minWidth: constraints.maxWidth,
          ),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _door(context, dark, exitT),
                const SizedBox(height: 26),
                _tagline(),
                const SizedBox(height: 14),
                // A reserved slot so the slow/failure notes don't
                // shift the door — min-height only, since the
                // failure state (message + Retry) is taller.
                ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 56),
                  child: _failed
                      ? _failure(context)
                      : _slow
                      ? const Text(
                          'This is taking longer than usual…',
                          style: TextStyle(
                            fontSize: 14,
                            color: AppColors.cream,
                          ),
                        )
                      : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _door(BuildContext context, bool dark, double exitT) {
    final width = MediaQuery.of(context).size.width;
    final size = math.min(248.0, width * 0.68);
    final enterRaw = _enter.value;
    final enterScale =
        0.85 + 0.15 * Curves.easeOutBack.transform(enterRaw.clamp(0.0, 1.0));
    final enterOpacity = Curves.easeOut.transform(
      (enterRaw / 0.45).clamp(0.0, 1.0),
    );
    final swingT = Curves.easeInOutCubic.transform(_swing.value);
    // The doorway zooms toward the viewer during the exit.
    final zoom = 1 + 1.7 * exitT;
    return Opacity(
      opacity: _reduceMotion ? 1 : enterOpacity,
      child: Transform.scale(
        scale: (_reduceMotion ? 1.0 : enterScale) * zoom,
        alignment: const Alignment(0, 0.18),
        child: SizedBox(
          width: size,
          height: size,
          child: Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _DoorBasePainter(glowT: swingT, dark: dark),
                ),
              ),
              // The leaf, hinged on its left edge (kit x=176): its
              // bounding box in the 512 space is (176,150,160,222).
              Positioned(
                left: 176 / 512 * size,
                top: 150 / 512 * size,
                width: 160 / 512 * size,
                height: 222 / 512 * size,
                child: Transform(
                  alignment: Alignment.centerLeft,
                  transform: Matrix4.identity()
                    ..setEntry(3, 2, 0.0012)
                    ..rotateY(-1.85 * swingT),
                  child: CustomPaint(
                    painter: _DoorLeafPainter(
                      knobScale: 1 + 0.22 * _pulse.value,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tagline() {
    // Fades in over the second half of the entrance; fades back
    // out as the door starts to swing.
    final inT = ((_enter.value - 0.4) / 0.6).clamp(0.0, 1.0);
    final outT = 1 - (_swing.value / 0.25).clamp(0.0, 1.0);
    final opacity = _reduceMotion ? 1.0 : inT * outT;
    return Opacity(
      opacity: opacity.clamp(0.0, 1.0),
      child: Text(
        kAppTagline,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
          color: AppColors.cream,
        ),
      ),
    );
  }

  Widget _failure(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          "Something didn't load. Check your connection and try again.",
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium
              ?.copyWith(color: AppColors.cream),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _retry,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.cream,
            side: const BorderSide(color: AppColors.cream),
          ),
          child: const Text('Retry'),
        ),
      ],
    );
  }
}

/// The kit arch frame as a path in the 512 viewBox:
/// M146 372 V226 A110 110 0 0 1 366 226 V372 Z.
Path _framePath() => Path()
  ..moveTo(146, 372)
  ..lineTo(146, 226)
  ..arcTo(
    Rect.fromCircle(center: const Offset(256, 226), radius: 110),
    math.pi,
    math.pi,
    false,
  )
  ..lineTo(366, 372)
  ..close();

/// The kit door leaf as a path in the 512 viewBox:
/// M176 372 V230 A80 80 0 0 1 336 230 V372 Z.
Path _leafPath() => Path()
  ..moveTo(176, 372)
  ..lineTo(176, 230)
  ..arcTo(
    Rect.fromCircle(center: const Offset(256, 230), radius: 80),
    math.pi,
    math.pi,
    false,
  )
  ..lineTo(336, 372)
  ..close();

/// Paints everything except the swinging leaf: the warm glow
/// behind the doorway, the lit interior revealed as the leaf
/// opens, the cream arch frame, the light spill on the floor,
/// and the amber welcome mat. Kit colours verbatim.
class _DoorBasePainter extends CustomPainter {
  final double glowT;
  final bool dark;

  const _DoorBasePainter({required this.glowT, required this.dark});

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 512;
    canvas.scale(s);

    // Ambient halo — stronger in dark mode, growing as the
    // door opens and light gets out.
    final haloAlpha = (dark ? 0.14 : 0.05) + 0.5 * glowT;
    if (haloAlpha > 0.01) {
      final haloRect = Rect.fromCircle(
        center: const Offset(256, 300),
        radius: 250 + 60 * glowT,
      );
      canvas.drawCircle(
        haloRect.center,
        haloRect.width / 2,
        Paint()
          ..shader = RadialGradient(
            colors: [
              const Color(0xFFFFDFA8).withValues(alpha: haloAlpha),
              const Color(0xFFFFDFA8).withValues(alpha: 0),
            ],
          ).createShader(haloRect),
      );
    }

    // The doorway interior: near-dark while closed (the leaf
    // covers it exactly), warming to lit cream as it opens.
    final interior = Color.lerp(
      const Color(0xFF38190B),
      const Color(0xFFFFE3B0),
      glowT,
    )!;
    canvas.drawPath(_leafPath(), Paint()..color = interior);

    // Light spilling onto the floor in front of the door.
    if (glowT > 0.01) {
      final spillRect = Rect.fromCenter(
        center: const Offset(256, 398),
        width: 90 + 300 * glowT,
        height: 26 + 44 * glowT,
      );
      canvas.drawOval(
        spillRect,
        Paint()
          ..shader = RadialGradient(
            colors: [
              AppColors.brandAmber.withValues(alpha: 0.38 * glowT),
              AppColors.brandAmber.withValues(alpha: 0),
            ],
          ).createShader(spillRect),
      );
    }

    // Soft ground shadow, then the cream frame itself.
    canvas.save();
    canvas.translate(0, 7);
    canvas.drawPath(
      _framePath(),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.16)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
    );
    canvas.restore();
    canvas.drawPath(_framePath(), Paint()..color = AppColors.cream);

    // The welcome mat (kit rect, amber).
    final mat = RRect.fromRectAndRadius(
      const Rect.fromLTWH(126, 372, 260, 22),
      const Radius.circular(11),
    );
    canvas.drawRRect(mat, Paint()..color = AppColors.brandAmber);
  }

  @override
  bool shouldRepaint(_DoorBasePainter oldDelegate) =>
      glowT != oldDelegate.glowT || dark != oldDelegate.dark;
}

/// Paints the swinging leaf + its knob in the leaf's local
/// 160×222 space (the kit leaf translated by −176,−150).
/// [knobScale] drives the gentle loading pulse.
class _DoorLeafPainter extends CustomPainter {
  final double knobScale;

  const _DoorLeafPainter({required this.knobScale});

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 160);
    canvas.translate(-176, -150);
    canvas.drawPath(_leafPath(), Paint()..color = AppColors.doorDark);
    canvas.drawCircle(
      const Offset(312, 316),
      9 * knobScale,
      Paint()..color = AppColors.brandAmber,
    );
  }

  @override
  bool shouldRepaint(_DoorLeafPainter oldDelegate) =>
      knobScale != oldDelegate.knobScale;
}
