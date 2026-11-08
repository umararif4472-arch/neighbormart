import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/core/utils/trust_score.dart';

TrustHistory _history({
  int onTime = 0,
  int total = 0,
  List<int> ratings = const [],
  bool phone = false,
  bool email = false,
  bool id = false,
  int deals = 0,
  int ageDays = 0,
  double response = 0,
}) {
  return TrustHistory(
    onTimeReturns: onTime,
    totalReturns: total,
    reviewRatings: ratings,
    phoneVerified: phone,
    emailVerified: email,
    idVerified: id,
    completedDeals: deals,
    accountAgeDays: ageDays,
    responseRate: response,
  );
}

void main() {
  group('onTimeRatePoints', () {
    test('zero returns is neutral 0', () => expect(onTimeRatePoints(0, 0), 0));
    test('full 30 at 8/8', () => expect(onTimeRatePoints(8, 8), 30));
    test('volume scaling 2/2 = 8', () => expect(onTimeRatePoints(2, 2), 8));
    test('late return lowers score', () {
      expect(onTimeRatePoints(8, 8) - onTimeRatePoints(6, 8), 7);
      expect(onTimeRatePoints(3, 3) > onTimeRatePoints(2, 3), isTrue);
    });
    test('caps at 30', () => expect(onTimeRatePoints(50, 50), 30));
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
          id: true,
          deals: 20,
          ageDays: 730,
          response: 1,
        ),
      );
      expect(r.total, 100);
      expect(r.tierName, 'Community Pillar');
    });
    test('one late return costs visible points', () {
      final a = calculateTrustScore(_history(onTime: 5, total: 5));
      final b = calculateTrustScore(_history(onTime: 4, total: 5));
      expect(a.breakdown.onTimeReturns - b.breakdown.onTimeReturns, 4);
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
    test('completed deals scale and cap', () {
      expect(
        calculateTrustScore(_history(deals: 0)).breakdown.completedDeals,
        0,
      );
      expect(
        calculateTrustScore(_history(deals: 10)).breakdown.completedDeals,
        8,
      );
      expect(
        calculateTrustScore(_history(deals: 20)).breakdown.completedDeals,
        15,
      );
      expect(
        calculateTrustScore(_history(deals: 40)).breakdown.completedDeals,
        15,
      );
    });
    test('pure seller builds trust without borrowing', () {
      // No returns at all — deals, reviews, verification, age, responsiveness.
      final r = calculateTrustScore(
        _history(
          ratings: List.filled(8, 5),
          phone: true,
          email: true,
          id: true,
          deals: 20,
          ageDays: 730,
          response: 0.8,
        ),
      );
      expect(r.breakdown.onTimeReturns, 0);
      expect(r.total, 62);
      expect(r.tierName, 'Trusted');
    });
    test('verification splits 4 phone + 3 email + 3 ID', () {
      expect(
        calculateTrustScore(_history(phone: true)).breakdown.verification,
        4,
      );
      expect(
        calculateTrustScore(_history(email: true)).breakdown.verification,
        3,
      );
      expect(calculateTrustScore(_history(id: true)).breakdown.verification, 3);
      expect(
        calculateTrustScore(_history(phone: true, email: true, id: true))
            .breakdown
            .verification,
        10,
      );
    });
    test('account age caps at 5, about a point per 146 days', () {
      expect(
        calculateTrustScore(_history(ageDays: 146)).breakdown.accountAge,
        1,
      );
      expect(
        calculateTrustScore(_history(ageDays: 800)).breakdown.accountAge,
        5,
      );
      expect(
        calculateTrustScore(_history(ageDays: 5000)).breakdown.accountAge,
        5,
      );
    });
    test('verification age responsiveness caps', () {
      final r = calculateTrustScore(
        _history(phone: true, email: true, ageDays: 800, response: 1),
      );
      expect(r.breakdown.verification, 7);
      expect(r.breakdown.accountAge, 5);
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
          id: true,
          deals: 60,
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
