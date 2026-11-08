import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/firebase/firebase_init.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/services/auth_service.dart';
import '../../../state/app_state.dart';
import 'forgot_password_screen.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;

  /// Drives the header's gentle emoji float (6 s sine loop). The
  /// entrance itself is a TweenAnimationBuilder — no controller needed.
  late final AnimationController _floatController = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Respect reduced motion: park the loop at rest instead of
    // animating (the header renders the same layout, just static).
    if (MediaQuery.of(context).disableAnimations) {
      _floatController.stop();
      _floatController.value = 0;
    } else if (!_floatController.isAnimating) {
      _floatController.repeat();
    }
  }

  @override
  void dispose() {
    _floatController.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  bool _googleBusy = false;

  Future<void> _googleSignIn() async {
    if (!firebaseReady) {
      setState(
        () => _error =
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
      Navigator.of(context).popUntil((r) => r.isFirst);
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _googleBusy = false);
    }
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final err = context.read<AppState>().login(_email.text, _password.text);
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    // Root gate swaps to the app shell on isLoggedIn; close this route.
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: const Text('Log in')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            _AnimatedLoginHeader(
              floatAnimation: _floatController,
              reduceMotion: MediaQuery.of(context).disableAnimations,
            ),
            const SizedBox(height: 20),
            Text(
              'Welcome back, neighbor',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            const Text('Log in to borrow and lend on your block.'),
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
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: AppColors.errorRed,
                    fontWeight: FontWeight.w600,
                  ),
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
                onPressed: _submit,
                child: const Text('Log in'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _googleBusy ? null : _googleSignIn,
                icon: const Text(
                  'G',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: AppColors.terracotta,
                  ),
                ),
                label: Text(
                  _googleBusy ? 'Signing in…' : 'Continue with Google',
                ),
              ),
            ),
            const SizedBox(height: 14),
            Card(
              color: AppColors.creamDark,
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
            ),
            const SizedBox(height: 22),
            Text(
              'Or continue as a neighbor',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            const Text(
              'Prototype shortcut — tap a neighbor to jump into their account.',
              style: TextStyle(fontSize: 13, color: AppColors.barkLight),
            ),
            const SizedBox(height: 8),
            ...state.users.map(
              (u) => Card(
                child: ListTile(
                  leading: UserAvatar(user: u, radius: 20),
                  title: Text(u.name),
                  subtitle: Text('${u.neighborhood} · ${u.email}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    context.read<AppState>().loginAs(u);
                    Navigator.of(context).popUntil((r) => r.isFirst);
                  },
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
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
      ),
    );
  }
}

/// Phase 6 animated header: the brand mark fades/slides in, the
/// tagline reveals a beat later, and the four section emojis drift on
/// a slow sine loop. With [reduceMotion] everything renders in its
/// resting position — same layout, no movement.
class _AnimatedLoginHeader extends StatelessWidget {
  final Animation<double> floatAnimation;
  final bool reduceMotion;
  const _AnimatedLoginHeader({
    required this.floatAnimation,
    required this.reduceMotion,
  });

  static const _sectionEmojis = ['🧰', '🚗', '🏠', '🏟️'];

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: reduceMotion
          ? Duration.zero
          : const Duration(milliseconds: 650),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) {
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(0, (1 - t) * 14),
            child: child,
          ),
        );
      },
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.terracotta,
              borderRadius: BorderRadius.circular(19),
            ),
            child: const Icon(
              Icons.handshake_outlined,
              size: 36,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'NeighborMart',
            style: TextStyle(
              fontSize: 23,
              fontWeight: FontWeight.w800,
              color: AppColors.bark,
            ),
          ),
          const SizedBox(height: 3),
          const Text(
            'Borrow, rent, buy & sell — right on your block.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13.5, color: AppColors.barkLight),
          ),
          const SizedBox(height: 14),
          AnimatedBuilder(
            animation: floatAnimation,
            builder: (context, _) {
              return Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_sectionEmojis.length, (i) {
                  final phase = floatAnimation.value * math.pi * 2 + i * 1.7;
                  final dy = reduceMotion ? 0.0 : math.sin(phase) * 4.5;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    child: Transform.translate(
                      offset: Offset(0, dy),
                      child: Container(
                        width: 42,
                        height: 42,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.creamDark,
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: Text(
                          _sectionEmojis[i],
                          style: const TextStyle(fontSize: 20),
                        ),
                      ),
                    ),
                  );
                }),
              );
            },
          ),
        ],
      ),
    );
  }
}
