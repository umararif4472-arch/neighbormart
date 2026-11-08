import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:firebase_auth/firebase_auth.dart';

import 'core/config.dart';
import 'core/firebase/firebase_init.dart';
import 'core/theme/app_theme.dart';
import 'data/services/auth_service.dart';
import 'state/app_state.dart';
import 'ui/app_root.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();

  // The bootstrap runs UNDER the door intro (the native splash
  // covers the first frames): the intro's readiness signal is
  // this future — prefs/session restore, Firebase bring-up and
  // the returning-user profile adopt. It stays re-runnable so
  // the intro's Retry button can call it again after a failure.
  Future<void> bootstrap() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await state.restoreFromPrefs(prefs);
    } catch (_) {
      // Prefs unavailable (should not happen on-device): fall back to
      // the in-memory defaults so the app still opens.
    }
    // Phase 3: bring up Firebase when this build carries its config
    // (google-services.json). Without it the app runs on local data.
    // Firebase Auth persists its own session, so a returning user is
    // re-adopted here with a fresh copy of their profile doc.
    if (await initFirebase()) {
      // Phase 10: a build carrying google-services.json runs on the
      // live backend — swap the seed catalog for Firestore data (an
      // empty database just means empty screens).
      state.enableLiveMode();
      final fbUser = FirebaseAuth.instance.currentUser;
      if (fbUser != null) {
        try {
          final profile = await FirebaseAuthService.instance.ensureProfile(
            fbUser,
          );
          state.adoptExternalUser(profile);
        } catch (_) {
          // Profile fetch failed (e.g. offline) — the local session
          // state from prefs still applies; Firebase re-syncs on
          // next sign-in.
        }
      }
    }
  }

  runApp(NeighborMartApp(state: state, bootstrap: bootstrap));
}

class NeighborMartApp extends StatelessWidget {
  final AppState state;

  /// The app bootstrap, run by the door intro at the root gate.
  final Future<void> Function()? bootstrap;

  const NeighborMartApp({super.key, required this.state, this.bootstrap});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AppState>.value(
      value: state,
      // Consumer so a theme-preference change in Settings re-themes
      // the whole app immediately, without a restart.
      child: Consumer<AppState>(
        builder: (context, appState, _) => MaterialApp(
          title: kAppName,
          debugShowCheckedModeBanner: false,
          theme: buildAppTheme(),
          darkTheme: buildDarkAppTheme(),
          themeMode: themeModeForPreference(appState.themePreference),
          home: AppRoot(bootstrap: bootstrap),
        ),
      ),
    );
  }
}
