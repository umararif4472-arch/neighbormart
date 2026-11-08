import 'package:flutter/material.dart';

import '../../data/models/listing.dart';

/// Per-section accent colors (Phase 7), one per marketplace section,
/// each with a light- and dark-mode variant chosen for WCAG AA text
/// contrast on that mode's surfaces. Mirrors the web app's section
/// accents so the two clients read as one product.
Color sectionAccentColor(ListingSection section, Brightness brightness) {
  final dark = brightness == Brightness.dark;
  return switch (section) {
    ListingSection.items =>
      dark ? const Color(0xFFFBBF24) : const Color(0xFFB45309),
    ListingSection.vehicles =>
      dark ? const Color(0xFF60A5FA) : const Color(0xFF1D4ED8),
    ListingSection.properties =>
      dark ? const Color(0xFFC084FC) : const Color(0xFF7E22CE),
    ListingSection.arenas =>
      dark ? const Color(0xFF4ADE80) : const Color(0xFF15803D),
  };
}

/// A soft tint of the accent, for badge/chip backgrounds behind
/// accent-colored text.
Color sectionAccentContainerColor(
  ListingSection section,
  Brightness brightness,
) => sectionAccentColor(
  section,
  brightness,
).withValues(alpha: brightness == Brightness.dark ? 0.20 : 0.12);

/// The accent for [section] in the ambient theme.
Color sectionAccentOf(BuildContext context, ListingSection section) =>
    sectionAccentColor(section, Theme.of(context).brightness);

/// The soft accent tint for [section] in the ambient theme.
Color sectionAccentContainerOf(BuildContext context, ListingSection section) =>
    sectionAccentContainerColor(section, Theme.of(context).brightness);
