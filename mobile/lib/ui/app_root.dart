import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'app_shell.dart';
import 'features/auth/landing_screen.dart';
import 'features/onboarding/door_intro.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/onboarding/profile_setup_screen.dart';

/// Root gate: DoorIntro (cold start, while the bootstrap runs) ->
/// Onboarding (first launch) -> Landing (signed out) ->
/// ProfileSetup (new account, Phase 6) -> AppShell (signed in).
/// Session + onboarding flags live on AppState; the bootstrap
/// (prefs restore + Firebase + session adopt) is kicked off in
/// main() and handed down as a factory so the intro can retry it.
class AppRoot extends StatefulWidget {
  /// Runs the app bootstrap; called by the door intro on mount.
  /// Null in tests, where the intro completes against an
  /// already-ready app.
  final Future<void> Function()? bootstrap;

  const AppRoot({super.key, this.bootstrap});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  bool _introDone = false;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final Widget destination;
    if (!state.onboardingSeen) {
      destination = const OnboardingScreen();
    } else if (!state.isLoggedIn) {
      destination = const LandingScreen();
    } else if (state.currentUserNeedsOnboarding) {
      destination = const ProfileSetupScreen();
    } else {
      destination = const AppShell();
    }
    if (_introDone) return destination;
    return DoorIntro(
      bootstrap: widget.bootstrap ?? () async {},
      signedIn: state.isLoggedIn,
      onComplete: () {
        if (mounted) setState(() => _introDone = true);
      },
      child: destination,
    );
  }
}
