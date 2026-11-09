/// App identity — the single rename point.
///
/// The name is a placeholder (see docs/BRAND.md): renaming the app
/// means changing [kAppName] here, the matching constant on the web,
/// the static copies in the platform manifests, and the wordmark
/// artwork — nothing else in the Flutter code should hardcode the
/// name or tagline.
const String kAppName = 'NeighborMart';

/// App version shown in the drawer footer (mirrors pubspec.yaml's
/// 1.0.0+1 — keep the two in step on version bumps).
const String kAppVersion = '1.0.0';

/// The brand tagline, verbatim (sentence case) everywhere it
/// appears: door intro, login, landing hero, About.
const String kAppTagline = 'Everything behind the door';

/// Brand asset paths (kit SVGs, bundled from assets/brand/).
/// Placement rules (docs/BRAND.md): dark backgrounds take the
/// dark symbol; light backgrounds take the standard symbol, or
/// the simple symbol (no welcome mat) at 48px and below.
const String kBrandSymbolAsset = 'assets/brand/logo-symbol.svg';
const String kBrandSymbolDarkAsset = 'assets/brand/logo-symbol-dark.svg';
const String kBrandSymbolSimpleAsset = 'assets/brand/logo-symbol-simple.svg';
const String kBrandOneColorCreamAsset = 'assets/brand/logo-onecolor-cream.svg';
