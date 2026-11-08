import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/firebase/firebase_init.dart';
import '../models/user.dart';

/// Firebase Auth + profile service (Phase 3) — the Flutter mirror of the
/// web's services/live/auth.ts.
///
/// A session is a Firebase Auth user; the app-facing [AppUser] is the
/// profile document at `users/{uid}`, created on first login with the
/// same fields the web writes, so both clients read one shared dataset.
/// Throws [AuthException] with a friendly message on any failure.
class AuthException implements Exception {
  final String message;

  /// The Firebase Auth error code when there is one (e.g.
  /// 'requires-recent-login' during account deletion), else null.
  final String? code;
  const AuthException(this.message, {this.code});
  @override
  String toString() => message;
}

class FirebaseAuthService {
  FirebaseAuthService._();
  static final FirebaseAuthService instance = FirebaseAuthService._();

  fb.FirebaseAuth get _auth => fb.FirebaseAuth.instance;
  FirebaseFirestore get _db => FirebaseFirestore.instance;

  void _requireReady() {
    if (!firebaseReady) {
      throw const AuthException(
        'Firebase is not configured for this build yet — add '
        'google-services.json (see the Phase 3 setup steps).',
      );
    }
  }

  Future<AppUser> signInWithGoogle() async {
    _requireReady();
    try {
      final googleSignIn = GoogleSignIn.instance;
      // Explicit web client ID: google_sign_in otherwise reads it from
      // the generated Android resources, which silently breaks sign-in
      // if the google-services Gradle plugin is ever dropped.
      await googleSignIn.initialize(
        serverClientId:
            '1063143466647-qr27rd21pcppuqmg5kms86m2isav15it.apps.googleusercontent.com',
      );
      final account = await googleSignIn.authenticate();
      final credential = fb.GoogleAuthProvider.credential(
        idToken: account.authentication.idToken,
      );
      final result = await _auth.signInWithCredential(credential);
      return await ensureProfile(result.user!);
    } on AuthException {
      rethrow;
    } catch (e) {
      throw AuthException(_friendlyError(e));
    }
  }

  Future<AppUser> signInWithEmail(String email, String password) async {
    _requireReady();
    try {
      final result = await _auth.signInWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      return await ensureProfile(result.user!);
    } catch (e) {
      throw AuthException(_friendlyError(e));
    }
  }

  Future<AppUser> signUpWithEmail(
    String name,
    String email,
    String password,
  ) async {
    _requireReady();
    try {
      final result = await _auth.createUserWithEmailAndPassword(
        email: email.trim(),
        password: password,
      );
      await result.user!.updateDisplayName(name.trim());
      return await ensureProfile(result.user!, nameOverride: name);
    } catch (e) {
      throw AuthException(_friendlyError(e));
    }
  }

  Future<void> signOut() async {
    if (!firebaseReady) return;
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Not signed in with Google (email session) — nothing to undo.
    }
    await _auth.signOut();
  }

  /// Read the profile doc, creating it on first login (same shape the
  /// web writes: name, photo, phone, location, verification status).
  Future<AppUser> ensureProfile(fb.User fbUser, {String? nameOverride}) async {
    final ref = _db.collection('users').doc(fbUser.uid);
    final snap = await ref.get();
    if (snap.exists) {
      return _userFromMap(fbUser.uid, snap.data()!);
    }

    final now = DateTime.now();
    final data = <String, dynamic>{
      'name': (nameOverride?.trim().isNotEmpty ?? false)
          ? nameOverride!.trim()
          : (fbUser.displayName ??
                fbUser.email?.split('@').first ??
                'Neighbor'),
      'avatarUrl': fbUser.photoURL ?? '',
      'bio': '',
      'city': '',
      'neighborhood': '',
      // Lahore centre — the user sets their real area in onboarding.
      'homeLocation': {'lat': 31.5204, 'lng': 74.3587},
      'joinedAt': now.toIso8601String(),
      'phoneVerified': false,
      'emailVerified': fbUser.emailVerified,
      'idVerified': false,
      'responseRate': 1.0,
      'avgResponseMinutes': 60,
      'stats': {
        'successfulLends': 0,
        'successfulBorrows': 0,
        'salesCompleted': 0,
        'rentalsHosted': 0,
        'onTimeReturns': 0,
        'lateReturns': 0,
      },
      'badges': <dynamic>[],
      'phone': '',
      'email': fbUser.email ?? '',
      // Phase 6: brand-new profiles go through the 3-step profile
      // setup on first login; the flag flips to true when they finish.
      'onboardingCompleted': false,
      'interests': <dynamic>[],
    };
    await ref.set(data);
    return _userFromMap(fbUser.uid, data);
  }

  /// Permanently remove the signed-in user's Firebase Auth credential
  /// (Phase 8 account deletion). Callers delete the user's DATA first
  /// and this LAST: Firebase refuses with 'requires-recent-login' when
  /// the session is old, and the caller surfaces that honestly rather
  /// than half-deleting in silence.
  Future<void> deleteCurrentAuthUser() async {
    _requireReady();
    final user = _auth.currentUser;
    if (user == null) return;
    try {
      await user.delete();
    } on fb.FirebaseAuthException catch (e) {
      throw AuthException(_friendlyError(e), code: e.code);
    }
  }

  /// Best-effort write-back of the Phase 6 profile setup to the
  /// user's Firestore doc. Local state is the source of truth for the
  /// UI; this keeps the shared dataset in step when Firebase is live.
  Future<void> saveOnboardingProfile(AppUser user) async {
    if (!firebaseReady) return;
    await _db.collection('users').doc(user.id).update({
      'name': user.name,
      'phone': user.phone,
      'city': user.city,
      'neighborhood': user.neighborhood,
      'interests': user.interests,
      'onboardingCompleted': true,
    });
  }

  /// Public entry to the profile parser (the live listeners in
  /// live_sync.dart parse every profile doc the same way auth does).
  AppUser userFromDocData(String uid, Map<String, dynamic> data) =>
      _userFromMap(uid, data);

  AppUser _userFromMap(String uid, Map<String, dynamic> data) {
    final stats = (data['stats'] as Map<String, dynamic>?) ?? const {};
    final home = (data['homeLocation'] as Map<String, dynamic>?) ?? const {};
    int stat(String key) => (stats[key] as num?)?.toInt() ?? 0;
    return AppUser(
      id: uid,
      name: data['name'] as String? ?? 'Neighbor',
      email: data['email'] as String? ?? '',
      bio: data['bio'] as String? ?? '',
      phone: data['phone'] as String? ?? '',
      city: data['city'] as String? ?? '',
      // Docs written before Phase 6 have no flag — treat them as not
      // set up yet so those users get the one-time setup prompt.
      onboardingCompleted: data['onboardingCompleted'] as bool? ?? false,
      interests: ((data['interests'] as List<dynamic>?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      // Phase 8: docs written before blocking existed have no field.
      blockedUserIds: ((data['blockedUserIds'] as List<dynamic>?) ?? const [])
          .map((e) => e.toString())
          .toList(),
      neighborhood: data['neighborhood'] as String? ?? '',
      homeLocation: LatLng(
        (home['lat'] as num?)?.toDouble() ?? 31.5204,
        (home['lng'] as num?)?.toDouble() ?? 74.3587,
      ),
      joinedAt:
          DateTime.tryParse(data['joinedAt'] as String? ?? '') ??
          DateTime.now(),
      phoneVerified: data['phoneVerified'] as bool? ?? false,
      emailVerified: data['emailVerified'] as bool? ?? false,
      idVerified: data['idVerified'] as bool? ?? false,
      responseRate: (data['responseRate'] as num?)?.toDouble() ?? 1,
      avgResponseMinutes: (data['avgResponseMinutes'] as num?)?.toInt() ?? 60,
      stats: UserStats(
        successfulLends: stat('successfulLends'),
        successfulBorrows: stat('successfulBorrows'),
        salesCompleted: stat('salesCompleted'),
        rentalsHosted: stat('rentalsHosted'),
        onTimeReturns: stat('onTimeReturns'),
        lateReturns: stat('lateReturns'),
      ),
      badges: const [],
    );
  }

  String _friendlyError(Object error) {
    if (error is fb.FirebaseAuthException) {
      switch (error.code) {
        case 'invalid-credential':
        case 'wrong-password':
        case 'user-not-found':
          return 'That email or password doesn’t match an account.';
        case 'email-already-in-use':
          return 'That email already has an account — try signing in.';
        case 'weak-password':
          return 'Password needs at least 6 characters.';
        case 'invalid-email':
          return 'That email address doesn’t look right.';
        case 'too-many-requests':
          return 'Too many attempts — wait a moment and try again.';
        case 'requires-recent-login':
          return 'For security, sign in again before deleting your account.';
      }
    }
    if (error is GoogleSignInException) {
      if (error.code == GoogleSignInExceptionCode.canceled) {
        return 'Sign-in was cancelled before it finished.';
      }
      return 'Google sign-in failed — check the Firebase setup (SHA-1) and try again.';
    }
    return 'Sign-in failed. Check your connection and try again.';
  }
}
