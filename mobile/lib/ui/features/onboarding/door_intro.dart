import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/config.dart';
import '../../../core/theme/app_theme.dart';

/// The "Open Door" intro: the signature cold-start sequence.
///
/// The native splash (closed door on terracotta, generated from
/// the brand kit) hands off to this widget, which composites the
/// REAL destination behind a wall with a real doorway cutout.
/// The destination is mounted from frame 0, miniaturised so its
/// full frame fits the doorway's width (scaled about the doorway
/// centre); the wall layer on top of it has a hole cut exactly
/// where the kit leaf sits, framed by the kit arch art. While
/// [bootstrap] runs the knob pulses and the tagline sits on the
/// wall below the door; once the app is ready the leaf swings
/// open on its left hinge, and then the whole doorway zooms:
/// the destination grows geometrically from its miniature scale
/// to 1.0 while the wall scales up around the same centre and
/// fades away, finishing with a small 10dp settle of the
/// destination. The final frame is the plain destination —
/// this state flips to returning [child] directly, so no
/// residual transform can tint the handoff.
///
/// Signed-in users get the short version (~1.2 s). A tap skips
/// the choreography with a short fade. If loading passes 8 s a
/// friendly note shows; if the bootstrap future fails, a retry
/// button re-runs it. Reduced motion: a static closed door, the
/// destination at scale 1.0 behind the opaque wall, and a plain
/// 220 ms cross-fade — no swing, zoom, settle or pulse. Cold
/// start only: this lives at the root gate and is removed the
/// moment it completes.
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

  /// The destination, rendered beneath the wall layer from the
  /// first frame, visible through the doorway cutout as the
  /// leaf opens and the doorway zooms.
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

/// One frame's worth of compositing values, derived from the
/// controllers in [_DoorIntroState._valuesFor].
class _IntroValues {
  /// Scale applied to the destination about the doorway centre.
  final double destScale;

  /// Centre (screen coordinates) the destination/wall scales
  /// pivot around: the doorway centre for the current phase.
  final Offset destCentre;

  /// Extra scale applied to the wall layer about the (final)
  /// doorway centre: `destScale / s0` once the zoom runs.
  final double wallScale;

  final double wallOpacity;

  /// Eased swing progress, 0 (closed) → 1 (fully open).
  final double swingT;

  /// Raw (uneased) swing progress, for the tagline fade-out.
  final double swingRaw;

  /// Screen-space downward offset of the destination: grows
  /// with the zoom to 10dp, then settles back to 0.
  final double settleTy;

  const _IntroValues({
    required this.destScale,
    required this.destCentre,
    required this.wallScale,
    required this.wallOpacity,
    required this.swingT,
    required this.swingRaw,
    required this.settleTy,
  });
}

class _DoorIntroState extends State<DoorIntro>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  // Choreography timings (ms). The enter and the minimum wait
  // run concurrently (both start at mount, as in the original
  // implementation), so the readiness gate lands at
  // max(enter, minWait): 600 ms signed out, 320 ms signed in.
  // After the gate, one choreography controller runs
  // swing → zoom → settle: 700 + 900 + 300 signed out,
  // 350 + 450 + 150 signed in.
  int get _enterMs => widget.signedIn ? 320 : 500;
  int get _minWaitMs => widget.signedIn ? 100 : 600;
  int get _swingMs => widget.signedIn ? 350 : 700;
  int get _zoomMs => widget.signedIn ? 450 : 900;
  int get _settleMs => widget.signedIn ? 150 : 300;
  int get _choreoMs => _swingMs + _zoomMs + _settleMs;

  late final AnimationController _enter = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 500),
  );
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  late final AnimationController _choreo = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1900),
  );
  late final AnimationController _fade = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );

  bool _ready = false;
  bool _failed = false;
  bool _slow = false;
  bool _opening = false;
  bool _fading = false;
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
    _choreo.addStatusListener((status) {
      if (status == AnimationStatus.completed) _finish();
    });
    _fade.addStatusListener((status) {
      if (status == AnimationStatus.completed) _finish();
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
      if (_opening && !_fading && !_completed) {
        // Flipped mid-choreography: abandon the swing/zoom and
        // take the plain fade from here.
        _choreo.stop();
        _fading = true;
        _fade.forward(from: 0);
      }
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
    _choreo.dispose();
    _fade.dispose();
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
  /// finishes last. No artificial delay beyond the minimum: a
  /// slow bootstrap starts the swing the moment it lands.
  /// Reduced-motion and skipped intros bypass the entrance /
  /// minimum-wait gates and take the short fade instead.
  void _maybeOpen() {
    if (!mounted || _completed || _opening || _failed) return;
    if (!_ready) return;
    if (!_reduceMotion && !_skipped) {
      if (_minTimer?.isActive ?? false) return;
      if (_enter.isAnimating) return;
    }
    _opening = true;
    _pulse.stop();
    if (_reduceMotion || _skipped) {
      // No swing: a short plain fade of the wall layer.
      _fading = true;
      _fade.forward(from: 0);
    } else {
      HapticFeedback.lightImpact();
      _choreo.duration = Duration(milliseconds: _choreoMs);
      _choreo.forward(from: 0);
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
  /// finish with the short fade the moment it lands.
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
      _slow = false;
    });
    if (!_reduceMotion) _pulse.repeat(reverse: true);
    _runBootstrap();
  }

  /// Scale-about-a-point matrix: `T(centre) · S(s) · T(-centre)`,
  /// preceded (outermost) by a downward translation of [ty].
  Matrix4 _scaleAbout(Offset centre, double scale, double ty) {
    return Matrix4.identity()
      ..translateByDouble(0, ty, 0, 1)
      ..translateByDouble(centre.dx, centre.dy, 0, 1)
      ..scaleByDouble(scale, scale, 1, 1)
      ..translateByDouble(-centre.dx, -centre.dy, 0, 1);
  }

  /// Derives the compositing values for the current controller
  /// state. [s0] is the miniature scale for the settled doorway
  /// and [sCurrent] the same for the (possibly still entering,
  /// enter-scaled) doorway; [currentCentre]/[finalCentre] are
  /// the matching doorway centres.
  _IntroValues _valuesFor({
    required double s0,
    required double sCurrent,
    required Offset currentCentre,
    required Offset finalCentre,
  }) {
    if (_fading) {
      final f = _fade.value.clamp(0.0, 1.0);
      if (_reduceMotion) {
        // Destination already at 1.0; the wall simply fades.
        return _IntroValues(
          destScale: 1,
          destCentre: finalCentre,
          wallScale: 1,
          wallOpacity: 1 - f,
          swingT: 0,
          swingRaw: 0,
          settleTy: 0,
        );
      }
      // Skip: a ≤220 ms fast-zoom + fade straight to the end.
      final destScale = math.pow(s0, 1 - f).toDouble();
      return _IntroValues(
        destScale: destScale,
        destCentre: finalCentre,
        wallScale: destScale / s0,
        wallOpacity: 1 - f,
        swingT: 0,
        swingRaw: 0,
        settleTy: 0,
      );
    }
    if (_opening) {
      final total = _choreoMs.toDouble();
      final swingEnd = _swingMs / total;
      final zoomEnd = (_swingMs + _zoomMs) / total;
      final v = _choreo.value.clamp(0.0, 1.0);
      if (v < swingEnd) {
        final raw = v / swingEnd;
        return _IntroValues(
          destScale: s0,
          destCentre: finalCentre,
          wallScale: 1,
          wallOpacity: 1,
          swingT: Curves.easeOut.transform(raw),
          swingRaw: raw,
          settleTy: 10 * s0,
        );
      }
      if (v < zoomEnd) {
        final raw = (v - swingEnd) / (zoomEnd - swingEnd);
        final t = Curves.easeInOutCubic.transform(raw);
        final destScale = math.pow(s0, 1 - t).toDouble();
        return _IntroValues(
          destScale: destScale,
          destCentre: finalCentre,
          wallScale: destScale / s0,
          wallOpacity: 1 - ((t - 0.6) / 0.4).clamp(0.0, 1.0),
          swingT: 1,
          swingRaw: 1,
          settleTy: 10 * destScale,
        );
      }
      final raw = (v - zoomEnd) / (1 - zoomEnd);
      final t = Curves.easeOut.transform(raw.clamp(0.0, 1.0));
      return _IntroValues(
        destScale: 1,
        destCentre: finalCentre,
        wallScale: 1 / s0,
        wallOpacity: 0,
        swingT: 1,
        swingRaw: 1,
        settleTy: 10 * (1 - t),
      );
    }
    // Enter / idle: the destination sits miniaturised in the
    // (enter-scaled) doorway; reduced motion keeps it at 1.0
    // behind the opaque wall instead.
    final destScale = _reduceMotion ? 1.0 : sCurrent;
    return _IntroValues(
      destScale: destScale,
      destCentre: _reduceMotion ? finalCentre : currentCentre,
      wallScale: 1,
      wallOpacity: 1,
      swingT: 0,
      swingRaw: 0,
      settleTy: _reduceMotion ? 0 : 10 * destScale,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_completed) return widget.child;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final wallColor = dark ? AppColors.darkCanvas : AppColors.terracottaDark;
    return AnimatedBuilder(
      animation: Listenable.merge([_enter, _pulse, _choreo, _fade]),
      builder: (context, _) {
        return LayoutBuilder(
          builder: (context, constraints) {
            final mq = MediaQuery.of(context);
            final size = Size(
              constraints.maxWidth.isFinite
                  ? constraints.maxWidth
                  : mq.size.width,
              constraints.maxHeight.isFinite
                  ? constraints.maxHeight
                  : mq.size.height,
            );
            return _stack(context, size, mq, dark, wallColor);
          },
        );
      },
    );
  }

  Widget _stack(
    BuildContext context,
    Size size,
    MediaQueryData mq,
    bool dark,
    Color wallColor,
  ) {
    // -- Door geometry -------------------------------------------------
    final doorSize = math.min(248.0, size.width * 0.68);
    final taglineStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
      fontSize: 17,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.2,
      color: AppColors.cream,
    );
    // Reserve the tagline's real height (it wraps at large text
    // scales) plus the slow/failure slot, so the door column is
    // centred in the available area and the door never shifts
    // when a note appears.
    final taglinePainter = TextPainter(
      text: TextSpan(text: kAppTagline, style: taglineStyle),
      textDirection: Directionality.of(context),
      textScaler: mq.textScaler,
      maxLines: 10,
    )..layout(maxWidth: size.width);
    final taglineHeight = taglinePainter.height;
    taglinePainter.dispose();
    final columnHeight = doorSize + 26 + taglineHeight + 14 + 56;
    final availTop = mq.padding.top;
    final availHeight = math.max(0.0, size.height - mq.padding.vertical);
    final doorTop = availTop + math.max(0.0, (availHeight - columnHeight) / 2);
    final doorBox = Rect.fromLTWH(
      (size.width - doorSize) / 2,
      doorTop,
      doorSize,
      doorSize,
    );
    // The doorway is the kit leaf's bounding box (176,150,160,222)
    // in the 512 space, scaled into the door box.
    final doorwayRect = Rect.fromLTWH(
      doorBox.left + 176 / 512 * doorSize,
      doorBox.top + 150 / 512 * doorSize,
      160 / 512 * doorSize,
      222 / 512 * doorSize,
    );
    final s0 = doorwayRect.width / size.width;

    // -- Enter (appear) -------------------------------------------------
    final enterRaw = _enter.value.clamp(0.0, 1.0);
    final enterScale = _reduceMotion
        ? 1.0
        : 0.85 + 0.15 * Curves.easeOutBack.transform(enterRaw);
    final enterOpacity = _reduceMotion
        ? 1.0
        : Curves.easeOut.transform((enterRaw / 0.45).clamp(0.0, 1.0));
    // The doorway while the door artwork is still appearing:
    // the final doorway scaled about the door box centre.
    final boxCentre = doorBox.center;
    final currentCentre = Offset(
      boxCentre.dx + (doorwayRect.center.dx - boxCentre.dx) * enterScale,
      boxCentre.dy + (doorwayRect.center.dy - boxCentre.dy) * enterScale,
    );
    final currentRect = Rect.fromCenter(
      center: currentCentre,
      width: doorwayRect.width * enterScale,
      height: doorwayRect.height * enterScale,
    );
    final sCurrent = currentRect.width / size.width;

    final values = _valuesFor(
      s0: s0,
      sCurrent: sCurrent,
      currentCentre: currentCentre,
      finalCentre: doorwayRect.center,
    );
    // After the enter completes the artwork is at its final size;
    // the painter/leaf use the enter geometry only until then.
    final artScale = _opening ? 1.0 : enterScale;
    final artRect = _opening ? doorwayRect : currentRect;
    final artOpacity = _opening ? 1.0 : enterOpacity;

    final taglineOpacity = _taglineOpacity(values);

    return Stack(
      fit: StackFit.expand,
      children: [
        // [0] The live destination, miniaturised into the doorway
        // (or at 1.0 under reduced motion), input-blocked until
        // the intro fully completes.
        Transform(
          transform: _scaleAbout(
            values.destCentre,
            values.destScale,
            values.settleTy,
          ),
          child: RepaintBoundary(
            child: AbsorbPointer(absorbing: true, child: widget.child),
          ),
        ),
        // [1] The wall: full-screen paint with a real doorway
        // hole, the kit frame around it, glow + spill, and the
        // swinging leaf exactly over the hole. During the zoom
        // this whole layer scales about the doorway centre.
        Transform(
          transform: _scaleAbout(doorwayRect.center, values.wallScale, 0),
          child: Opacity(
            opacity: values.wallOpacity.clamp(0.0, 1.0),
            child: RepaintBoundary(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _WallPainter(
                        screenSize: size,
                        doorBox: doorBox,
                        enterScale: artScale,
                        enterOpacity: artOpacity,
                        swingT: values.swingT,
                        dark: dark,
                        wallColor: wallColor,
                      ),
                    ),
                  ),
                  // The leaf, hinged on its left edge.
                  Positioned.fromRect(
                    rect: artRect,
                    child: Opacity(
                      opacity: artOpacity,
                      child: Transform(
                        alignment: Alignment.centerLeft,
                        transform: Matrix4.identity()
                          ..setEntry(3, 2, 0.0012)
                          ..rotateY(-1.85 * values.swingT),
                        child: CustomPaint(
                          painter: _DoorLeafPainter(
                            knobScale: 1 + 0.22 * _pulse.value,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        // Tap-to-skip, over the wall but under the notes layer
        // (so Retry keeps its own taps).
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _skip,
          ),
        ),
        // Tagline + slow/failure notes, ON the wall below the
        // door (never clipped by the doorway, never scaled with
        // the wall). Scroll-safe on short screens / large text.
        Positioned(
          left: 0,
          right: 0,
          top: doorBox.bottom + 26,
          bottom: 0,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTap: _skip,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Opacity(
                    opacity: taglineOpacity,
                    child: Text(
                      kAppTagline,
                      textAlign: TextAlign.center,
                      style: taglineStyle,
                    ),
                  ),
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
      ],
    );
  }

  double _taglineOpacity(_IntroValues values) {
    // Fades in over the second half of the entrance; fades back
    // out as the door starts to swing; fades with the wall on
    // the skip / reduced-motion fade path.
    if (_fading) return (1 - _fade.value).clamp(0.0, 1.0);
    final inT = ((_enter.value - 0.4) / 0.6).clamp(0.0, 1.0);
    final outT = 1 - (values.swingRaw / 0.25).clamp(0.0, 1.0);
    final opacity = _reduceMotion ? 1.0 : inT * outT;
    return opacity.clamp(0.0, 1.0);
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

/// The leaf path mapped into screen coordinates for a door box
/// at [doorBox], with the door artwork scaled by [enterScale]
/// about the door box centre (the appear animation).
Path _doorwayPath(Rect doorBox, double enterScale) {
  final c = doorBox.center;
  final m = Matrix4.identity()
    ..translateByDouble(c.dx, c.dy, 0, 1)
    ..scaleByDouble(enterScale, enterScale, 1, 1)
    ..translateByDouble(-c.dx, -c.dy, 0, 1)
    ..translateByDouble(doorBox.left, doorBox.top, 0, 1)
    ..scaleByDouble(doorBox.width / 512, doorBox.width / 512, 1, 1);
  return _leafPath().transform(m.storage);
}

/// Paints the wall layer: the full-screen wall with a real
/// doorway hole cut out of it (so the destination below shows
/// through), the warm glow inside the hole, light spilling on
/// the floor as the leaf opens, and the kit frame as a ring
/// around the hole plus the amber welcome mat. Kit colours
/// verbatim. The swinging leaf itself is a separate widget.
class _WallPainter extends CustomPainter {
  final Size screenSize;
  final Rect doorBox;

  /// Appear-animation scale of the door artwork (1 once settled).
  final double enterScale;
  final double enterOpacity;

  /// Eased swing progress: drives glow + spill.
  final double swingT;
  final bool dark;
  final Color wallColor;

  const _WallPainter({
    required this.screenSize,
    required this.doorBox,
    required this.enterScale,
    required this.enterOpacity,
    required this.swingT,
    required this.dark,
    required this.wallColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final screenRect = Offset.zero & screenSize;
    final hole = _doorwayPath(doorBox, enterScale);
    final holeRect = hole.getBounds();

    // The wall itself, with the doorway really cut out.
    final wall = Path.combine(
      PathOperation.difference,
      Path()..addRect(screenRect),
      hole,
    );
    canvas.drawPath(wall, Paint()..color = wallColor);

    // Ambient halo on the wall around the door — stronger in
    // dark mode, growing as the door opens and light gets out.
    final haloAlpha = (dark ? 0.14 : 0.05) + 0.35 * swingT;
    if (haloAlpha > 0.01) {
      final haloRect = Rect.fromCircle(
        center: doorBox.center,
        radius: doorBox.width * (0.95 + 0.12 * swingT),
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

    // Warm glow inside the doorway, clipped to the hole: it
    // composites over the miniaturised destination below and
    // ramps up with the swing (stronger in dark mode).
    if (swingT > 0.01) {
      final glowAlpha = (dark ? 0.42 : 0.28) * swingT;
      final glowRect = Rect.fromCircle(
        center: holeRect.center,
        radius: holeRect.width * 0.95,
      );
      canvas.save();
      canvas.clipPath(hole);
      canvas.drawRect(
        holeRect.inflate(holeRect.width * 0.2),
        Paint()
          ..shader = RadialGradient(
            colors: [
              const Color(0xFFFFE3B0).withValues(alpha: glowAlpha),
              AppColors.brandAmber.withValues(alpha: glowAlpha * 0.5),
              AppColors.brandAmber.withValues(alpha: 0),
            ],
            stops: const [0, 0.55, 1],
          ).createShader(glowRect),
      );
      canvas.restore();
    }

    // Light spilling onto the floor below the doorway.
    if (swingT > 0.01) {
      final s = doorBox.width / 512 * enterScale;
      final cx = doorBox.center.dx;
      final cy = doorBox.center.dy + (398 - 256) * s;
      final spillRect = Rect.fromCenter(
        center: Offset(cx, cy),
        width: (90 + 300 * swingT) * s,
        height: (26 + 44 * swingT) * s,
      );
      canvas.drawOval(
        spillRect,
        Paint()
          ..shader = RadialGradient(
            colors: [
              AppColors.brandAmber.withValues(alpha: 0.38 * swingT),
              AppColors.brandAmber.withValues(alpha: 0),
            ],
          ).createShader(spillRect),
      );
    }

    // The kit frame as a ring around the hole (outer arch minus
    // the leaf opening), its soft ground shadow, and the
    // welcome mat — in the kit's 512 space, mapped into the
    // door box with the appear scale applied about its centre.
    canvas.save();
    final c = doorBox.center;
    canvas.translate(c.dx, c.dy);
    canvas.scale(enterScale);
    canvas.translate(-c.dx, -c.dy);
    canvas.translate(doorBox.left, doorBox.top);
    canvas.scale(doorBox.width / 512);
    final ring = Path.combine(
      PathOperation.difference,
      _framePath(),
      _leafPath(),
    );
    canvas.save();
    canvas.translate(0, 7);
    canvas.drawPath(
      ring,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.16 * enterOpacity)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 7),
    );
    canvas.restore();
    canvas.drawPath(
      ring,
      Paint()..color = AppColors.cream.withValues(alpha: enterOpacity),
    );
    final mat = RRect.fromRectAndRadius(
      const Rect.fromLTWH(126, 372, 260, 22),
      const Radius.circular(11),
    );
    canvas.drawRRect(
      mat,
      Paint()..color = AppColors.brandAmber.withValues(alpha: enterOpacity),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_WallPainter oldDelegate) =>
      screenSize != oldDelegate.screenSize ||
      doorBox != oldDelegate.doorBox ||
      enterScale != oldDelegate.enterScale ||
      enterOpacity != oldDelegate.enterOpacity ||
      swingT != oldDelegate.swingT ||
      dark != oldDelegate.dark ||
      wallColor != oldDelegate.wallColor;
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
