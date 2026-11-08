import 'package:flutter/material.dart';

import 'theme_preference.dart';

/// Brand palette (Phase 7 refresh, matched to the web app): warm
/// terracotta primary, moss-green trust accent, cream/parchment
/// surfaces, bark ink. Dark mode is a warm charcoal built from the
/// same hues — never blue-grey.
class AppColors {
  // Light
  static const terracotta = Color(0xFFC05F3B);
  static const terracottaDark = Color(0xFFA44B2D);
  static const moss = Color(0xFF4A7040);
  static const mossDark = Color(0xFF47603F);
  static const cream = Color(0xFFFBF7F0);
  static const creamSurface = Color(0xFFFFFDF9);
  static const creamDark = Color(0xFFF4EDE1);
  static const bark = Color(0xFF44392F);
  // Deepened one step from the original 0xFF7A6A5B so muted text also
  // reaches WCAG AA (4.5:1) on the raised creamDark surface, not just
  // on the plain surface.
  static const barkLight = Color(0xFF776655);
  static const sand = Color(0xFFE8DCC8);
  static const amber = Color(0xFFC17A28);
  static const errorRed = Color(0xFFB3261E);

  // Dark (warm charcoal)
  static const darkCanvas = Color(0xFF16120E);
  static const darkSurface = Color(0xFF211B15);
  static const darkSurfaceVariant = Color(0xFF2B241C);
  static const darkInk = Color(0xFFF3EDE4);
  static const darkInkSoft = Color(0xFFC9BBA9);
  static const darkPrimary = Color(0xFFE0A181);
  static const darkOnPrimary = Color(0xFF2A1608);
  static const darkMoss = Color(0xFFA6C89D);
  static const darkBorder = Color(0xFF4A3E31);
  static const darkError = Color(0xFFF2B8B5);
}

/// Warm amber for stars, warnings and "pending" states, as a
/// foreground (text/icon) color. The dark value is lightened and the
/// light value deepened relative to the decorative brand amber, so
/// amber text keeps WCAG AA contrast on both themes' surfaces —
/// including on its own soft tint (same pattern as the section
/// accents in section_colors.dart).
Color amberAccentColor(Brightness brightness) => brightness == Brightness.dark
    ? const Color(0xFFF0B35E)
    : const Color(0xFF8F5E14);

/// The amber accent for the ambient theme.
Color amberAccentOf(BuildContext context) =>
    amberAccentColor(Theme.of(context).brightness);

/// Maps the persisted [ThemePreference] to Flutter's [ThemeMode].
ThemeMode themeModeForPreference(ThemePreference preference) =>
    switch (preference) {
      ThemePreference.system => ThemeMode.system,
      ThemePreference.light => ThemeMode.light,
      ThemePreference.dark => ThemeMode.dark,
    };

/// Subtle fade + slight upward slide for page pushes (Phase 7).
/// Reduced-motion users get the page with no transition at all.
class FadeSlidePageTransitionsBuilder extends PageTransitionsBuilder {
  const FadeSlidePageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.03),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      ),
    );
  }
}

/// All the colors one brightness needs, so light and dark share a
/// single theme builder.
class _Palette {
  final Brightness brightness;
  final Color canvas;
  final Color surface;
  final Color surfaceVariant;
  final Color ink;
  final Color inkSoft;
  final Color primary;
  final Color onPrimary;
  final Color trust;
  final Color onTrust;
  final Color border;
  final Color error;
  final Color onError;

  const _Palette({
    required this.brightness,
    required this.canvas,
    required this.surface,
    required this.surfaceVariant,
    required this.ink,
    required this.inkSoft,
    required this.primary,
    required this.onPrimary,
    required this.trust,
    required this.onTrust,
    required this.border,
    required this.error,
    required this.onError,
  });
}

const _lightPalette = _Palette(
  brightness: Brightness.light,
  canvas: AppColors.cream,
  surface: AppColors.creamSurface,
  surfaceVariant: AppColors.creamDark,
  ink: AppColors.bark,
  inkSoft: AppColors.barkLight,
  // Button/primary contrast: white on AppColors.terracotta (#C05F3B) is
  // only ~4.25:1, below WCAG AA 4.5:1 for button text. terracottaDark
  // (#A44B2D, ~5.8:1) is the palette's next shade down and is exactly
  // the web app's button color (terracotta-600), so both platforms now
  // share one button color. AppColors.terracotta itself is unchanged
  // and still used for brand surfaces (splash, logo tiles).
  primary: AppColors.terracottaDark,
  onPrimary: Colors.white,
  trust: AppColors.moss,
  onTrust: Colors.white,
  border: AppColors.sand,
  error: AppColors.errorRed,
  onError: Colors.white,
);

const _darkPalette = _Palette(
  brightness: Brightness.dark,
  canvas: AppColors.darkCanvas,
  surface: AppColors.darkSurface,
  surfaceVariant: AppColors.darkSurfaceVariant,
  ink: AppColors.darkInk,
  inkSoft: AppColors.darkInkSoft,
  primary: AppColors.darkPrimary,
  onPrimary: AppColors.darkOnPrimary,
  trust: AppColors.darkMoss,
  onTrust: Color(0xFF1C2B18),
  border: AppColors.darkBorder,
  error: AppColors.darkError,
  onError: Color(0xFF601410),
);

ThemeData _buildTheme(_Palette p) {
  final scheme = ColorScheme(
    brightness: p.brightness,
    primary: p.primary,
    onPrimary: p.onPrimary,
    secondary: p.trust,
    onSecondary: p.onTrust,
    surface: p.surface,
    onSurface: p.ink,
    surfaceContainerHighest: p.surfaceVariant,
    onSurfaceVariant: p.inkSoft,
    outline: p.border,
    error: p.error,
    onError: p.onError,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: p.canvas,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {TargetPlatform.android: FadeSlidePageTransitionsBuilder()},
    ),
    textTheme: TextTheme(
      headlineSmall: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: p.ink,
      ),
      titleLarge: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: p.ink,
      ),
      titleMedium: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: p.ink,
      ),
      bodyLarge: TextStyle(fontSize: 16, color: p.ink),
      bodyMedium: TextStyle(fontSize: 14, color: p.ink),
      bodySmall: TextStyle(fontSize: 12, color: p.inkSoft),
      labelLarge: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: p.canvas,
      foregroundColor: p.ink,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 1,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      margin: EdgeInsets.zero,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: p.primary,
        foregroundColor: p.onPrimary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.primary,
        foregroundColor: p.onPrimary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.primary,
        side: BorderSide(color: p.primary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      side: BorderSide(color: p.border),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: p.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: p.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: p.primary, width: 1.6),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.surface,
      indicatorColor: p.surfaceVariant,
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
    ),
    dividerTheme: DividerThemeData(color: p.border),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: p.trust),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: p.ink,
      contentTextStyle: TextStyle(color: p.canvas),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      behavior: SnackBarBehavior.floating,
    ),
  );
}

/// The light theme (cream canvas, terracotta primary).
ThemeData buildAppTheme() => _buildTheme(_lightPalette);

/// The dark theme (warm charcoal canvas, lighter terracotta primary).
ThemeData buildDarkAppTheme() => _buildTheme(_darkPalette);
