import 'dart:async';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

import 'firebase/firebase_init.dart';

/// Observability (Wave 2, Workstream F): Crashlytics crash reporting +
/// Analytics funnel events, both on Firebase free tiers.
///
/// Everything here is a safe no-op unless Firebase was successfully
/// initialized ([firebaseReady], set by `initFirebase()` in the app
/// bootstrap) — mock/demo builds and widget tests never touch the
/// Firebase singletons, which would throw without an initialized app.
/// Individual calls also swallow their own errors: observability must
/// never break the user flow it is measuring.

/// Installs the global error handlers. Call AFTER `initFirebase()`
/// has succeeded (the bootstrap in main.dart does this); calling it
/// when Firebase is absent leaves the default handlers untouched.
void installCrashReporting() {
  if (!firebaseReady) return;
  // Uncaught Flutter framework errors → fatal Crashlytics reports.
  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
  // Errors outside the Flutter framework (async gaps, platform side).
  PlatformDispatcher.instance.onError = (error, stack) {
    unawaited(
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true),
    );
    return true;
  };
  // Collection stays at its default (enabled); be explicit in release
  // builds so a debug opt-out can never leak into a shipped APK.
  if (kReleaseMode) {
    unawaited(
      FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(true),
    );
  }
}

/// Logs one Analytics event, swallowing every failure. Parameter
/// values are limited to the scalar types Analytics accepts.
Future<void> _logEvent(String name, [Map<String, Object>? parameters]) async {
  if (!firebaseReady) return;
  try {
    await FirebaseAnalytics.instance.logEvent(
      name: name,
      parameters: parameters,
    );
  } catch (_) {
    // Analytics is best-effort only.
  }
}

/// Funnel event: a sign-in completed successfully (any method).
void logSignIn({String? method}) {
  unawaited(_logEvent('sign_in', method == null ? null : {'method': method}));
}

/// Funnel event: a listing was published.
/// [section] is the marketplace section name (items/vehicles/…).
void logListingCreated({required String section}) {
  unawaited(_logEvent('listing_created', {'section': section}));
}

/// Funnel event: a borrow/rent/booking request was sent.
/// [section] is the marketplace section name (items/vehicles/…).
void logRequestCreated({required String section}) {
  unawaited(_logEvent('request_created', {'section': section}));
}
