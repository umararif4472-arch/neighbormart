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

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;

  @override
  void dispose() {
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
