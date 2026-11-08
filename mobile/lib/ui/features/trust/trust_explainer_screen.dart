import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/trust_score.dart';
import '../../../core/widgets/shared_widgets.dart';

/// "How trust works" — the numbers here come from trust_score.dart so the
/// explainer can never drift from the real formula.
class TrustExplainerScreen extends StatelessWidget {
  const TrustExplainerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final components = <(String, int, String)>[
      (
        'On-time returns',
        kOnTimeMax,
        'The backbone of trust. Every return counts: on-time returns build the score, late ones drag the rate down while the count keeps growing.',
      ),
      (
        'Reviews',
        kReviewsMax,
        'Stars your neighbors leave after a borrow. The 10 most recent reviews count, weighted by their average rating.',
      ),
      (
        'Completed deals',
        kDealsMax,
        'Deals finished in any role — borrows returned, items lent, things sold, rentals hosted. This is how sellers and car or vehicle owners build trust without borrowing. Full marks at $kDealsFullAt deals.',
      ),
      (
        'Responsiveness',
        kResponsivenessMax,
        'Do you answer your neighbors? A share of the requests and messages you respond to.',
      ),
      (
        'Verified profile',
        kVerificationMax,
        'Four points for a verified phone number, three for a verified email, and three for a government ID check.',
      ),
      (
        'Account age',
        kAccountAgeMax,
        'Slowly earned: roughly one point every $kAccountAgeDaysPerPoint days, full marks at about two years.',
      ),
    ];
    const tiers = <(String, int)>[
      ('New Neighbor', 0),
      ('Reliable', 25),
      ('Trusted', 50),
      ('Community Pillar', 75),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('How trust works')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          const Text(
            'Trust is the currency of NeighborMart. There are no deposits held by the app and no payment processing — instead, everyone carries a 0–100 trust score, recomputed from their history wherever their name appears.',
          ),
          const SizedBox(height: 20),
          Text(
            'The six ingredients',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ...components.map(
            (c) => Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            c.$1,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.moss.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            'up to ${c.$2} pts',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.mossDark,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(c.$3),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text('Tiers', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...tiers.map((tier) {
            final result = TrustScoreResult(
              total: tier.$2,
              tierName: tier.$1,
              breakdown: const TrustBreakdown(
                onTimeReturns: 0,
                reviews: 0,
                completedDeals: 0,
                verification: 0,
                accountAge: 0,
                responsiveness: 0,
              ),
            );
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  TrustBadge(result: result),
                  const SizedBox(width: 10),
                  Text('${tier.$2}+ points'),
                ],
              ),
            );
          }),
          const SizedBox(height: 12),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(14),
              child: Text(
                'One honest shortcut does not exist: a late return is the fastest way to lose points, and the only fix is more on-time returns. That is deliberate — the score should describe behavior, not effort.',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
