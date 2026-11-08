import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/firebase/firebase_init.dart';
import '../models/listing.dart';

/// Firestore read service for listings (Phase 3) — the Flutter mirror of
/// the web's live listings service.
///
/// The app screens still render the local seed catalog until the
/// Phase 5 section migration switches them to the Phase 2 [Listing]
/// model; this service is the live data source that migration will
/// consume, and it reads the exact documents the web client writes.
class FirestoreListingService {
  FirestoreListingService._();
  static final FirestoreListingService instance = FirestoreListingService._();

  Future<List<Listing>> fetchListings() async {
    if (!firebaseReady) return const [];
    final snap = await FirebaseFirestore.instance
        .collection('listings')
        .orderBy('createdAt', descending: true)
        .get();
    return snap.docs
        .map((doc) => ListingFirestoreMap.fromMap(doc.id, doc.data()))
        .toList();
  }

  Future<Listing?> fetchListingById(String id) async {
    if (!firebaseReady) return null;
    final snap = await FirebaseFirestore.instance
        .collection('listings')
        .doc(id)
        .get();
    if (!snap.exists) return null;
    return ListingFirestoreMap.fromMap(snap.id, snap.data()!);
  }
}
