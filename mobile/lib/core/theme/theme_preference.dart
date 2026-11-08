/// The user's appearance choice, persisted in SharedPreferences.
///
/// Kept as a pure Dart enum (no Flutter imports) so [AppState] can own
/// it without depending on the widget layer; `app_theme.dart` maps it
/// to Flutter's `ThemeMode` for the `MaterialApp`.
enum ThemePreference { system, light, dark }

/// SharedPreferences key for the persisted choice.
const String kThemePreferencePrefsKey = 'neighbormart:theme-mode';

/// Parses a stored value back into a [ThemePreference]. Anything
/// missing or unrecognized falls back to [ThemePreference.light] —
/// the first-launch default is light; a stored explicit choice
/// (including 'system') always wins once the user has picked one.
ThemePreference themePreferenceFromStorage(String? raw) => switch (raw) {
  'light' => ThemePreference.light,
  'dark' => ThemePreference.dark,
  'system' => ThemePreference.system,
  _ => ThemePreference.light,
};

/// The stored string for a [ThemePreference].
String themePreferenceToStorage(ThemePreference preference) => preference.name;
