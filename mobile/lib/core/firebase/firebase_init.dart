import 'package:firebase_core/firebase_core.dart';

/// Firebase bootstrap (Phase 3), mirroring the web's
/// `isFirebaseConfigured` switch.
///
/// On Android the config comes from `android/app/google-services.json`
/// (downloaded from the Firebase console — see the Phase 3 setup steps).
/// When that file is absent, [Firebase.initializeApp] throws; we catch
/// it and the app keeps running on its local mock data exactly as
/// before, with [firebaseReady] false so auth UI can explain itself.
bool firebaseReady = false;

Future<bool> initFirebase() async {
  try {
    await Firebase.initializeApp();
    firebaseReady = true;
  } catch (_) {
    firebaseReady = false;
  }
  return firebaseReady;
}
