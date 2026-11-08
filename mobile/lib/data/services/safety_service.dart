import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/firebase/firebase_init.dart';
import '../models/report.dart';

/// Firestore mirror for the Phase 8 safety features (reports, blocks,
/// account deletion) — the same seam the rest of the app uses: local
/// AppState is the source of truth for the UI, and these writes keep
/// the shared dataset in step when Firebase is live. Every method is a
/// no-op in mock/local mode ([firebaseReady] false).
class SafetyService {
  SafetyService._();
  static final SafetyService instance = SafetyService._();

  FirebaseFirestore get _db => FirebaseFirestore.instance;

  /// File a report as a new doc in the shared `reports` collection.
  Future<void> submitReport(Report report) async {
    if (!firebaseReady) return;
    await _db.collection('reports').add(report.toFirestoreMap());
  }

  /// Mirror the signed-in user's block list onto their profile doc.
  Future<void> saveBlockedUserIds(String userId, List<String> ids) async {
    if (!firebaseReady) return;
    await _db.collection('users').doc(userId).update({'blockedUserIds': ids});
  }

  /// Delete the user's remote data ahead of an account deletion: their
  /// listing docs plus their profile doc, in one batch. The Auth
  /// credential itself is removed separately (and last) by
  /// FirebaseAuthService.deleteCurrentAuthUser.
  Future<void> deleteAccountData(String userId, List<String> listingIds) async {
    if (!firebaseReady) return;
    final batch = _db.batch();
    for (final id in listingIds) {
      batch.delete(_db.collection('listings').doc(id));
    }
    batch.delete(_db.collection('users').doc(userId));
    await batch.commit();
  }
}
