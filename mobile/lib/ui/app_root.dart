import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'app_shell.dart';
import 'features/auth/landing_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/onboarding/profile_setup_screen.dart';
import 'features/onboarding/splash_screen.dart';

/// Root gate: Splash -> Onboarding (first launch) -> Landing (signed out)
/// -> ProfileSetup (new account, Phase 6) -> AppShell (signed in).
/// Session + onboarding flags live on AppState and are restored from
/// SharedPreferences in main().
class AppRoot extends StatefulWidget {
  const AppRoot({super.key});
  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  bool _showSplash = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _showSplash = false);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_showSplash) return const SplashScreen();
    final state = context.watch<AppState>();
    if (!state.onboardingSeen) return const OnboardingScreen();
    if (!state.isLoggedIn) return const LandingScreen();
    if (state.currentUserNeedsOnboarding) return const ProfileSetupScreen();
    return const AppShell();
  }
}
