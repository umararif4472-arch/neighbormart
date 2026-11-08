// Phase 6 profile-setup rules — one source of truth shared by the
// setup screen, AppState.completeOnboarding, and the tests, so the
// UI can never accept something the state layer would reject.

/// Interest options offered in Step 3: the four marketplace sections
/// first, then the most common listing categories.
const List<String> kInterestOptions = [
  'Items & Tools',
  'Vehicles',
  'Properties',
  'Sports Arenas',
  'Tools',
  'Electronics',
  'Sports',
  'Party & Events',
];

/// Areas offered as one-tap suggestions in Step 2 (typing is free-form).
const List<String> kLahoreAreaSuggestions = [
  'DHA Phase 5',
  'DHA Phase 1',
  'Gulberg',
  'Johar Town',
  'Model Town',
  'Bahria Town',
  'Wapda Town',
  'Cantt',
  'Gulshan-e-Ravi',
];

String? validateSetupName(String value) =>
    value.trim().length < 2 ? 'Enter your name (at least 2 characters).' : null;

/// Phone is optional, but when given it must look dialable: at least
/// 7 digits (spaces, +, and dashes don't count).
String? validateSetupPhone(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return null;
  final digits = trimmed.replaceAll(RegExp(r'\D'), '');
  return digits.length < 7 ? 'That phone number looks too short.' : null;
}

String? validateSetupCity(String value) =>
    value.trim().isEmpty ? 'Enter your city.' : null;

String? validateSetupArea(String value) =>
    value.trim().isEmpty ? 'Enter your area (e.g. Gulberg).' : null;

String? validateSetupInterests(List<String> selected) =>
    selected.isEmpty ? 'Pick at least one interest.' : null;
