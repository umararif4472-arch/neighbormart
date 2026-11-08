import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../core/firebase/firebase_init.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/services/auth_service.dart';
import '../../../state/app_state.dart';
import 'animated_login_background.dart';
import 'forgot_password_screen.dart';
import 'signup_screen.dart';

/// Login (Phase 10 polish): a full animated welcome screen — a
/// drifting gradient-mesh backdrop with the section icons floating
/// over it, the logo bouncing in, the tagline revealing span by
/// span, Google sign-in as the primary path, and the email form
/// sliding up in a card below an "or" divider.
///
/// The auth behaviour is unchanged from the previous screen: Google
/// goes through [FirebaseAuthService] and adopts the returned user,
/// email goes through [AppState.login], errors surface inline (now
/// with a shake), and success pops back to the root gate. The demo
/// card and one-tap neighbor shortcuts only exist when Firebase is
/// NOT configured for the build ([firebaseReady] false) — a live
/// build never offers demo accounts.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  bool _googleBusy = false;

  /// Entrance choreography (logo → wordmark → tagline → actions).
  late final AnimationController _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );

  /// The logo's gentle breathing once the entrance has landed.
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  /// Error shake on the form card.
  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
  );

  /// Short fade/slide out on a successful sign-in, before the route
  /// pops back to the root gate.
  late final AnimationController _exit = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
  );

  bool _reduceMotion = false;
  bool? _lastReduceMotion;

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
      // Static version: everything parked at its final state.
      _entrance.value = 1;
      _pulse.stop();
    } else {
      if (_entrance.status != AnimationStatus.completed) {
        _entrance.forward();
      }
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _entrance.dispose();
    _pulse.dispose();
    _shake.dispose();
    _exit.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Sets the inline error and shakes the form card (unless the user
  /// prefers reduced motion, in which case the message just appears).
  void _showError(String message) {
    setState(() => _error = message);
    if (!_reduceMotion) _shake.forward(from: 0);
    HapticFeedback.mediumImpact();
  }

  /// Shared success path: a brief exit fade, then back to the root
  /// gate (which swaps to onboarding or the app shell).
  void _leave() {
    if (_reduceMotion || !mounted) {
      Navigator.of(context).popUntil((r) => r.isFirst);
      return;
    }
    _exit.forward().then((_) {
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    });
  }

  Future<void> _googleSignIn() async {
    if (!firebaseReady) {
      _showError(
        'Google sign-in needs this build to carry its Firebase config '
        '(google-services.json) — see the Phase 3 setup steps.',
      );
      return;
    }
    setState(() {
      _googleBusy = true;
      _error = null;
    });
    try {
      final user = await FirebaseAuthService.instance.signInWithGoogle();
      if (!mounted) return;
      context.read<AppState>().adoptExternalUser(user);
      _leave();
    } on AuthException catch (e) {
      // AuthException messages are already plain-words (the service
      // maps Firebase codes) — never show a raw error code.
      if (mounted) _showError(e.message);
    } catch (_) {
      if (mounted) {
        _showError('Something went wrong — please try again.');
      }
    } finally {
      if (mounted) setState(() => _googleBusy = false);
    }
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final err = context.read<AppState>().login(_email.text, _password.text);
    if (err != null) {
      _showError(err);
      return;
    }
    // Root gate swaps to the app shell on isLoggedIn; close this route.
    _leave();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: AnimatedLoginBackground(reduceMotion: _reduceMotion),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxHeight < 560;
                return AnimatedBuilder(
                  animation: _exit,
                  builder: (context, child) {
                    final e = Curves.easeInCubic.transform(_exit.value);
                    return Opacity(
                      opacity: 1 - e,
                      child: Transform.translate(
                        offset: Offset(0, -14 * e),
                        child: child,
                      ),
                    );
                  },
                  child: SingleChildScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: EdgeInsets.fromLTRB(20, compact ? 4 : 16, 20, 28),
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 460),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SizedBox(height: compact ? 2 : 14),
                            _BrandBlock(
                              entrance: _entrance,
                              pulse: _pulse,
                              compact: compact,
                            ),
                            SizedBox(height: compact ? 16 : 28),
                            _actionsBlock(context, state, scheme),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          if (Navigator.of(context).canPop())
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Material(
                  color: scheme.surface.withValues(alpha: 0.92),
                  shape: const CircleBorder(),
                  elevation: 1,
                  child: IconButton(
                    icon: const Icon(Icons.arrow_back, size: 20),
                    tooltip: 'Back',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Google button, divider, the sliding form card, the demo-only
  /// shortcuts, and the sign-up row — revealed as one rising block.
  Widget _actionsBlock(
    BuildContext context,
    AppState state,
    ColorScheme scheme,
  ) {
    return AnimatedBuilder(
      animation: _entrance,
      builder: (context, child) {
        final t = _seg(
          Curves.easeOutCubic.transform(_entrance.value),
          0.48,
          1.0,
        );
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, (1 - t) * 26),
            child: child,
          ),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _googleButton(context, scheme),
          const SizedBox(height: 18),
          Row(
            children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  'or',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const Expanded(child: Divider()),
            ],
          ),
          const SizedBox(height: 18),
          _formCard(context, scheme),
          if (!firebaseReady) ...[
            const SizedBox(height: 16),
            _demoCard(context, scheme),
            const SizedBox(height: 22),
            Text(
              'Or continue as a neighbor',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              'Prototype shortcut — tap a neighbor to jump into their account.',
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 8),
            ...state.users.map(
              (u) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    leading: UserAvatar(user: u, radius: 20),
                    title: Text(u.name),
                    subtitle: Text('${u.neighborhood} · ${u.email}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      context.read<AppState>().loginAs(u);
                      _leave();
                    },
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          // Wrap, not Row: with very large accessibility text the
          // button drops to its own line instead of overflowing.
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Text('New here?'),
              TextButton(
                onPressed: () => Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const SignUpScreen()),
                ),
                child: const Text('Create an account'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _googleButton(BuildContext context, ColorScheme scheme) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return ElevatedButton(
      onPressed: _googleBusy
          ? null
          : () {
              HapticFeedback.lightImpact();
              _googleSignIn();
            },
      style: ElevatedButton.styleFrom(
        backgroundColor: dark ? scheme.surface : Colors.white,
        foregroundColor: scheme.onSurface,
        disabledBackgroundColor: dark ? scheme.surface : Colors.white,
        disabledForegroundColor: scheme.onSurfaceVariant,
        elevation: 1.5,
        shadowColor: Colors.black.withValues(alpha: 0.25),
        minimumSize: const Size(double.infinity, 56),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: scheme.outline),
        ),
        // Based on the theme's labelLarge (resized) so the label
        // inherits the theme's font family instead of falling back
        // to the platform default.
        textStyle: Theme.of(context).textTheme.labelLarge
            ?.copyWith(fontSize: 15.5, letterSpacing: 0.1),
      ),
      // FittedBox(scaleDown): the label can never overflow the
      // button, even with very wide system fonts or large text
      // scaling — it shrinks a touch instead of breaking layout.
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: _googleBusy
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: scheme.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Text('Signing in with Google...'),
                ],
              )
            : const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GoogleGLogo(size: 22),
                  SizedBox(width: 12),
                  Text('Continue with Google'),
                ],
              ),
      ),
    );
  }

  Widget _formCard(BuildContext context, ColorScheme scheme) {
    return AnimatedBuilder(
      animation: _shake,
      builder: (context, child) {
        final v = _shake.value;
        final dx = v == 0 || v == 1 ? 0.0 : _shakeOffset(v);
        return Transform.translate(offset: Offset(dx, 0), child: child);
      },
      child: Card(
        elevation: 2,
        color: scheme.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Welcome back, neighbor',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  'Log in to borrow, rent, buy and sell on your block.',
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 18),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Email *',
                    hintText: 'you@example.com',
                    prefixIcon: Icon(Icons.mail_outline),
                  ),
                  validator: (v) {
                    final s = (v ?? '').trim();
                    if (s.isEmpty) return 'Enter your email.';
                    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s)) {
                      return 'That does not look like an email address.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Password *',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                  validator: (v) =>
                      (v == null || v.isEmpty) ? 'Enter your password.' : null,
                  onFieldSubmitted: (_) => _submit(),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.error_outline,
                          size: 18,
                          color: scheme.error,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            _error!,
                            style: TextStyle(
                              color: scheme.error,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const ForgotPasswordScreen(),
                      ),
                    ),
                    child: const Text('Forgot password?'),
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      _submit();
                    },
                    child: const Text('Log in'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The demo account card — mock builds only. A live build
  /// ([firebaseReady] true) never renders this.
  Widget _demoCard(BuildContext context, ColorScheme scheme) {
    return Card(
      color: scheme.surfaceContainerHighest,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Demo account',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            const Text('maya.chen@example.com  ·  borrow123'),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () {
                _email.text = 'maya.chen@example.com';
                _password.text = 'borrow123';
                _submit();
              },
              child: const Text('Fill & log in as Maya'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Maps [v] through the [a]–[b] window of the entrance timeline:
/// 0 before [a], 1 after [b], smooth in between (callers pass an
/// already-curved value when they want easing).
double _seg(double v, double a, double b) =>
    ((v - a) / (b - a)).clamp(0.0, 1.0);

/// A decaying side-to-side shake: a few quick swings that settle
/// at rest as [v] runs 0 → 1.
double _shakeOffset(double v) {
  final decay = 1 - v;
  return math.sin(v * math.pi * 5) * 10 * decay * decay;
}

/// The brand block: logo tile bouncing in (then breathing gently),
/// the wordmark, and the tagline revealing span by span. A single
/// [Text.rich] carries the tagline so its full text stays one
/// accessible string while each span fades in on its own beat.
class _BrandBlock extends StatelessWidget {
  final Animation<double> entrance;
  final Animation<double> pulse;
  final bool compact;

  const _BrandBlock({
    required this.entrance,
    required this.pulse,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AnimatedBuilder(
      animation: Listenable.merge([entrance, pulse]),
      builder: (context, _) {
        final v = entrance.value;
        final logoT = _seg(v, 0.0, 0.5);
        final logoScale =
            Curves.easeOutBack.transform(logoT) *
            (v >= 1 ? 1 + (pulse.value - 0.5) * 0.03 : 1.0);
        final wordT = _seg(Curves.easeOutCubic.transform(v), 0.15, 0.55);
        return Column(
          children: [
            Opacity(
              opacity: logoT.clamp(0.0, 1.0),
              child: Transform.scale(
                scale: logoScale.clamp(0.0, 1.2),
                child: Container(
                  width: compact ? 54 : 68,
                  height: compact ? 54 : 68,
                  decoration: BoxDecoration(
                    color: scheme.primary,
                    borderRadius: BorderRadius.circular(compact ? 16 : 20),
                    boxShadow: [
                      BoxShadow(
                        color: scheme.primary.withValues(alpha: 0.35),
                        blurRadius: 18,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Icon(
                    Icons.handshake_outlined,
                    size: compact ? 30 : 38,
                    color: scheme.onPrimary,
                  ),
                ),
              ),
            ),
            SizedBox(height: compact ? 8 : 12),
            Opacity(
              opacity: wordT,
              child: Transform.translate(
                offset: Offset(0, (1 - wordT) * 8),
                child: Text(
                  'NeighborMart',
                  style: TextStyle(
                    fontSize: compact ? 23 : 27,
                    fontWeight: FontWeight.w800,
                    color: scheme.onSurface,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 5),
            _tagline(context, v),
          ],
        );
      },
    );
  }

  Widget _tagline(BuildContext context, double v) {
    final scheme = Theme.of(context).colorScheme;
    final base = scheme.onSurfaceVariant;
    TextStyle span(double a) => TextStyle(color: base.withValues(alpha: a));
    final slideT = _seg(Curves.easeOutCubic.transform(v), 0.30, 0.78);
    return Opacity(
      opacity: slideT.clamp(0.0, 1.0),
      child: Transform.translate(
        offset: Offset(0, (1 - slideT) * 10),
        child: Text.rich(
          TextSpan(
            style: TextStyle(
              fontSize: compact ? 13.5 : 14.5,
              height: 1.35,
              color: base,
            ),
            children: [
              TextSpan(
                text: 'Borrow, rent, ',
                style: span(_seg(v, 0.32, 0.58)),
              ),
              TextSpan(
                text: 'buy and sell, ',
                style: span(_seg(v, 0.46, 0.72)),
              ),
              TextSpan(
                text: 'right on your block',
                style: span(_seg(v, 0.60, 0.86)),
              ),
            ],
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
