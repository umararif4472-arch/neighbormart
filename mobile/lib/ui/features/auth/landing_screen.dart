import 'package:flutter/material.dart';

import '../../../core/config.dart';
import '../../../core/widgets/brand_mark.dart';
import 'login_screen.dart';
import 'signup_screen.dart';

/// Welcome screen shown instead of the app shell when signed out.
class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 36, 16, 32),
          children: [
            const BrandMark(size: 76),
            const SizedBox(height: 14),
            Text(
              kAppTagline,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 22),
            Text(
              'Why buy it when your neighbor already owns one?',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 10),
            Text(
              'Borrow, rent, or buy tools, gear, vehicles and more from people on your block.',
              style: TextStyle(
                fontSize: 15,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _HowItWorksPoint(icon: Icons.search, label: 'Find it nearby'),
                _HowItWorksPoint(
                  icon: Icons.calendar_month_outlined,
                  label: 'Request your dates',
                ),
                _HowItWorksPoint(
                  icon: Icons.verified_outlined,
                  label: 'Complete the deal',
                ),
              ],
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
                child: const Text('Log in'),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => const SignUpScreen())),
                child: const Text('Create account'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One compact how-it-works point: icon over a 3–4 word label.
class _HowItWorksPoint extends StatelessWidget {
  final IconData icon;
  final String label;
  const _HowItWorksPoint({required this.icon, required this.label});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              icon,
              color: Theme.of(context).colorScheme.secondary,
              size: 22,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
