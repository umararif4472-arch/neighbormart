import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/core/utils/trust_score.dart';

TrustHistory _history({
  int onTime = 0,
  int total = 0,
  List<int> ratings = const [],
  bool phone = false,
  bool email = false,
  int ageDays = 0,
  double response = 0,
}) {
  return TrustHistory(
    onTimeReturns: onTime,
    totalReturns: total,
    reviewRatings: ratings,
    phoneVerified: phone,
    emailVerified: email,
    accountAgeDays: ageDays,
    responseRate: response,
  );
}

void main() {
  group('onTimeRatePoints', () {
    test('zero returns is neutral 0', () => expect(onTimeRatePoints(0, 0), 0));
    test('full 40 at 8/8', () => expect(onTimeRatePoints(8, 8), 40));
    test('volume scaling 2/2 = 10', () => expect(onTimeRatePoints(2, 2), 10));
    test('late return lowers score', () {
      expect(onTimeRatePoints(8, 8) - onTimeRatePoints(6, 8), 10);
      expect(onTimeRatePoints(3, 3) > onTimeRatePoints(2, 3), isTrue);
    });
    test('caps at 40', () => expect(onTimeRatePoints(50, 50), 40));
  });
  group('calculateTrustScore', () {
    test('zero history = 0 New Neighbor', () {
      final r = calculateTrustScore(_history());
      expect(r.total, 0);
      expect(r.tierName, 'New Neighbor');
    });
    test('maxed history = 100 Community Pillar', () {
      final r = calculateTrustScore(
        _history(
          onTime: 8,
          total: 8,
          ratings: List.filled(10, 5),
          phone: true,
          email: true,
          ageDays: 730,
          response: 1,
        ),
      );
      expect(r.total, 100);
      expect(r.tierName, 'Community Pillar');
    });
    test('one late vs all on-time differs by >=5', () {
      final a = calculateTrustScore(_history(onTime: 5, total: 5));
      final b = calculateTrustScore(_history(onTime: 4, total: 5));
      expect(a.total - b.total, greaterThanOrEqualTo(5));
    });
    test('reviews scale by average', () {
      expect(
        calculateTrustScore(_history(ratings: List.filled(10, 5)))
            .breakdown
            .reviews,
        25,
      );
      expect(
        calculateTrustScore(_history(ratings: List.filled(10, 3)))
            .breakdown
            .reviews,
        15,
      );
    });
    test('verification age responsiveness caps', () {
      final r = calculateTrustScore(
        _history(phone: true, email: true, ageDays: 800, response: 1),
      );
      expect(r.breakdown.verification, 10);
      expect(r.breakdown.accountAge, 10);
      expect(r.breakdown.responsiveness, 15);
    });
    test('clamps at 100', () {
      final r = calculateTrustScore(
        _history(
          onTime: 50,
          total: 50,
          ratings: List.filled(20, 5),
          phone: true,
          email: true,
          ageDays: 5000,
          response: 2,
        ),
      );
      expect(r.total, lessThanOrEqualTo(100));
    });
    test('reviews cap count at 10', () {
      final r = calculateTrustScore(_history(ratings: List.filled(20, 5)));
      expect(r.breakdown.reviews, 25);
    });
  });
  group('tierForScore', () {
    test('boundaries', () {
      expect(tierForScore(0), 'New Neighbor');
      expect(tierForScore(24), 'New Neighbor');
      expect(tierForScore(25), 'Reliable');
      expect(tierForScore(49), 'Reliable');
      expect(tierForScore(50), 'Trusted');
      expect(tierForScore(74), 'Trusted');
      expect(tierForScore(75), 'Community Pillar');
      expect(tierForScore(100), 'Community Pillar');
    });
  });
}
