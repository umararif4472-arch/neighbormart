import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/theme/app_theme.dart';
import 'state/app_state.dart';
import 'ui/app_root.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();
  try {
    final prefs = await SharedPreferences.getInstance();
    await state.restoreFromPrefs(prefs);
  } catch (_) {
    // Prefs unavailable (should not happen on-device): fall back to the
    // in-memory defaults so the app still opens.
  }
  runApp(NeighborMartApp(state: state));
}

class NeighborMartApp extends StatelessWidget {
  final AppState state;
  const NeighborMartApp({super.key, required this.state});
  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AppState>.value(
      value: state,
      child: MaterialApp(
        title: "NeighborMart",
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const AppRoot(),
      ),
    );
  }
}
