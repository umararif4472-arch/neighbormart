import 'package:flutter/material.dart';

import '../../data/models/listing.dart';

/// Per-section accents ("Open Door" kit — docs/BRAND.md).
///
/// [sectionAccentColor] is the EXACT kit hex, used for graphics:
/// icon tiles, floating icons, chip washes, large glyphs. Most kit
/// hexes cannot reach 4.5:1 as small text, so anywhere the accent
/// carries text use [sectionAccentTextColor] instead — a shade of
/// the same hue that passes WCAG AA on the app's surfaces (the
/// same shades the web app ships; measured ratios are tabulated
/// in docs/BRAND.md).
Color sectionAccentColor(ListingSection section, Brightness brightness) {
  return switch (section) {
    ListingSection.items => const Color(0xFFD99A2B),
    ListingSection.vehicles => const Color(0xFF3B7DD8),
    ListingSection.properties => const Color(0xFF8E4A8B),
    ListingSection.arenas => const Color(0xFF4F8A4B),
  };
}

/// The AA-passing text shade of [section]'s accent for
/// [brightness] (≥4.5:1 on the theme surfaces and on the accent's
/// own container tint). Properties uses the exact kit hex on
/// light and Items uses it on dark — those two already pass.
Color sectionAccentTextColor(ListingSection section, Brightness brightness) {
  final dark = brightness == Brightness.dark;
  return switch (section) {
    ListingSection.items =>
      dark ? const Color(0xFFD99A2B) : const Color(0xFFA84E09),
    ListingSection.vehicles =>
      dark ? const Color(0xFF60A5FA) : const Color(0xFF1D4ED8),
    ListingSection.properties =>
      dark ? const Color(0xFFC084FC) : const Color(0xFF8E4A8B),
    ListingSection.arenas =>
      dark ? const Color(0xFF4ADE80) : const Color(0xFF146C36),
  };
}

/// A soft tint of the accent, for badge/chip backgrounds behind
/// accent-colored text. The dark wash is 16% (not 20%): at 20% the
/// Items badge — exact kit amber text on its own tint — dipped to
/// 4.34:1; at 16% every section's text shade clears 4.5:1 again
/// (guarded in dark_mode_contrast_test).
Color sectionAccentContainerColor(
  ListingSection section,
  Brightness brightness,
) => sectionAccentColor(
  section,
  brightness,
).withValues(alpha: brightness == Brightness.dark ? 0.16 : 0.12);

/// The exact kit accent for [section] in the ambient theme
/// (graphics only — for text use [sectionAccentTextOf]).
Color sectionAccentOf(BuildContext context, ListingSection section) =>
    sectionAccentColor(section, Theme.of(context).brightness);

/// The AA text shade of [section]'s accent in the ambient theme.
Color sectionAccentTextOf(BuildContext context, ListingSection section) =>
    sectionAccentTextColor(section, Theme.of(context).brightness);

/// The soft accent tint for [section] in the ambient theme.
Color sectionAccentContainerOf(BuildContext context, ListingSection section) =>
    sectionAccentContainerColor(section, Theme.of(context).brightness);
