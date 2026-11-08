import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('reviews', () {
    // Seed state for req-done-washer: Maya borrowed Tom's washer, it is
    // 'returned', and Tom (lender) has ALREADY reviewed Maya — Maya's
    // review is the outstanding one.
    test('seed: lender already reviewed, borrower has not', () {
      final s = AppState();
      expect(s.hasReviewed('req-done-washer', 'u-tom'), isTrue);
      expect(s.hasReviewed('req-done-washer', 'u-maya'), isFalse);
    });

    test('addReview stores the review against the other party', () {
      final s = AppState();
      final before = s.reviewsFor('u-tom').length;
      final err = s.addReview(
        'req-done-washer',
        5,
        'Great washer, easy pickup.',
      );
      expect(err, isNull);
      expect(s.reviewsFor('u-tom').length, before + 1);
      final review = s
          .reviewsFor('u-tom')
          .firstWhere(
            (r) => r.requestId == 'req-done-washer' && r.reviewerId == 'u-maya',
          );
      expect(review.revieweeId, 'u-tom');
      expect(review.rating, 5);
    });

    test('both parties reviewed flips the request to reviewed', () {
      final s = AppState();
      expect(
        s.requests.firstWhere((r) => r.id == 'req-done-washer').status,
        'returned',
      );
      // Maya's review completes the pair (Tom's is seeded).
      expect(s.addReview('req-done-washer', 5, 'Thanks!'), isNull);
      expect(
        s.requests.firstWhere((r) => r.id == 'req-done-washer').status,
        'reviewed',
      );
    });

    test('double review by the same person is rejected', () {
      final s = AppState();
      expect(s.addReview('req-done-washer', 4, 'Good.'), isNull);
      final err = s.addReview('req-done-washer', 1, 'Changed my mind.');
      expect(err, isNotNull);
      expect(
        s.reviews
            .where(
              (r) =>
                  r.requestId == 'req-done-washer' && r.reviewerId == 'u-maya',
            )
            .length,
        1,
      );
      // Tom is also blocked — his review is already in the seed.
      expect(s.login('tom.alvarez@example.com', 'borrow123'), isNull);
      expect(s.addReview('req-done-washer', 5, 'Again?'), isNotNull);
    });

    test('the new review feeds the reviewee\u2019s trust inputs', () {
      final s = AppState();
      final before = s.reviewsFor('u-tom').length;
      s.addReview('req-done-washer', 2, 'Ran late returning it.');
      final after = s.reviewsFor('u-tom');
      expect(after.length, before + 1);
      expect(
        after.any((r) => r.rating == 2 && r.requestId == 'req-done-washer'),
        isTrue,
      );
    });

    test('reviews are rejected before the item is returned', () {
      final s = AppState();
      expect(s.addReview('req-out-kayak', 5, 'Too soon.'), isNotNull);
    });
  });
}
