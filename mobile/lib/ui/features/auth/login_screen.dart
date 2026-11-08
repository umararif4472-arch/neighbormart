import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../core/firebase/firebase_init.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/services/auth_service.dart';
import '../../../state/app_state.dart';
import 'forgot_password_screen.dart';
import 'login_backdrop.dart';
import 'signup_screen.dart';

/// Login: the clean sign-in screen — brand block, then one card
/// holding Google sign-in (the primary path), an "or" divider,
/// and the email form — given tasteful motion only:
/// a very subtle drifting-gradient backdrop (see [LoginBackdrop]),
/// a short staggered entrance (logo → wordmark → card, under a
/// second), and a small shake of the card when an error lands.
///
/// Auth behaviour: Google goes through [FirebaseAuthService] and
/// adopts the returned user, email goes through [AppState.login],
/// errors surface inline in the card, and success pops back to the
/// root gate. The demo card and one-tap neighbor shortcuts only
/// exist when Firebase is NOT configured for the build
/// ([firebaseReady] false) — a live build never offers demo
/// accounts. Reduced-motion users get the static backdrop, the
/// settled layout at the first frame, and no shake.
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

  /// Entrance choreography: logo, wordmark/tagline, then the card
  /// block, staggered ~120ms apart over 900ms total.
  late final AnimationController _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  /// Error shake on the sign-in card.
  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
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
      _shake.stop();
    } else if (_entrance.status == AnimationStatus.dismissed) {
      _entrance.forward();
    }
  }

  @override
  void dispose() {
    _entrance.dispose();
    _shake.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _showError(String message) {
    setState(() => _error = message);
    if (!_reduceMotion) _shake.forward(from: 0);
    HapticFeedback.mediumImpact();
  }

  /// Success path: back to the root gate (which swaps to onboarding
  /// or the app shell).
  void _leave() {
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
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
          Positioned.fill(child: LoginBackdrop(reduceMotion: _reduceMotion)),
          SafeArea(
            child: SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.all(24),
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 16),
                      _animatedBrand(context, scheme),
                      const SizedBox(height: 28),
                      _animatedActions(context, state, scheme),
                    ],
                  ),
                ),
              ),
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

  /// The brand block with the entrance applied: the logo tile
  /// scales 0.85 → 1 with a fade (easeOutBack), then the wordmark
  /// and tagline fade in while rising 8px.
  Widget _animatedBrand(BuildContext context, ColorScheme scheme) {
    return AnimatedBuilder(
      animation: _entrance,
      builder: (context, _) {
        final v = _entrance.value;
        final logoScale =
            0.85 +
            0.15 *
                const Interval(0, 0.55, curve: Curves.easeOutBack).transform(v);
        final logoOpacity = const Interval(
          0,
          0.4,
          curve: Curves.easeOut,
        ).transform(v);
        final wordT = const Interval(
          0.13,
          0.68,
          curve: Curves.easeOutCubic,
        ).transform(v);
        return Column(
          children: [
            Opacity(
              opacity: logoOpacity.clamp(0.0, 1.0),
              child: Transform.scale(
                scale: logoScale.clamp(0.85, 1.05),
                child: _logoTile(scheme),
              ),
            ),
            const SizedBox(height: 14),
            Opacity(
              opacity: wordT,
              child: Transform.translate(
                offset: Offset(0, (1 - wordT) * 8),
                child: _wordmark(context, scheme),
              ),
            ),
          ],
        );
      },
    );
  }

  /// The card block with the entrance applied (fade + 16px rise,
  /// last in the stagger): sign-in card, sign-up row, and — in
  /// mock builds only — the demo extras.
  Widget _animatedActions(
    BuildContext context,
    AppState state,
    ColorScheme scheme,
  ) {
    return AnimatedBuilder(
      animation: _entrance,
      builder: (context, child) {
        final cardT = const Interval(
          0.27,
          1.0,
          curve: Curves.easeOutCubic,
        ).transform(_entrance.value);
        return Opacity(
          opacity: cardT,
          child: Transform.translate(
            offset: Offset(0, (1 - cardT) * 16),
            child: child,
          ),
        );
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _shakenCard(context, scheme),
          const SizedBox(height: 18),
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
          if (!firebaseReady) ...[
            const SizedBox(height: 8),
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
                  color: scheme.surfaceContainerHighest,
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
        ],
      ),
    );
  }

  /// The sign-in card, wrapped in the error shake (±6px, decaying).
  Widget _shakenCard(BuildContext context, ColorScheme scheme) {
    return AnimatedBuilder(
      animation: _shake,
      builder: (context, child) {
        final v = _shake.value;
        final dx = v == 0 || v == 1 ? 0.0 : _shakeOffset(v);
        return Transform.translate(offset: Offset(dx, 0), child: child);
      },
      child: _signInCard(context, scheme),
    );
  }

  Widget _logoTile(ColorScheme scheme) {
    return Container(
      width: 68,
      height: 68,
      decoration: BoxDecoration(
        color: scheme.primary,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: scheme.primary.withValues(alpha: 0.30),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Icon(Icons.handshake_outlined, size: 36, color: scheme.onPrimary),
    );
  }

  /// Wordmark and the tagline as one plain centered string (a
  /// single Text keeps it one accessible string).
  Widget _wordmark(BuildContext context, ColorScheme scheme) {
    return Column(
      children: [
        Text(
          'NeighborMart',
          style: TextStyle(
            fontSize: 27,
            fontWeight: FontWeight.w800,
            color: scheme.onSurface,
            letterSpacing: 0.2,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Borrow, rent, buy and sell, right on your block',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 14.5,
            height: 1.35,
            color: scheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  /// The single sign-in card: heading, Google button, divider,
  /// email form, inline error, forgot-password, log-in button.
  Widget _signInCard(BuildContext context, ColorScheme scheme) {
    return Card(
      elevation: 1,
      color: scheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(
                'Log in to borrow, rent, buy and sell on your block.',
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 20),
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
                      Icon(Icons.error_outline, size: 18, color: scheme.error),
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
        elevation: 1,
        shadowColor: Colors.black.withValues(alpha: 0.18),
        minimumSize: const Size(double.infinity, 56),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
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

/// A decaying side-to-side shake: a few quick ±6px swings that
/// settle at rest as [v] runs 0 → 1.
double _shakeOffset(double v) {
  final decay = 1 - v;
  return math.sin(v * math.pi * 5) * 6 * decay * decay;
}
