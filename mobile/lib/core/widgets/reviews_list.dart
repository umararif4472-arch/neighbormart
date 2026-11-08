import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../theme/app_theme.dart';
import '../../data/models/user.dart';
import '../../state/app_state.dart';
import '../../ui/features/profile/user_profile_screen.dart';
import 'shared_widgets.dart';

String _dateLabel(DateTime d) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${months[d.month - 1]} ${d.day}, ${d.year}';
}

/// Read-only star row (1–5).
class StarRow extends StatelessWidget {
  final int rating;
  final double size;
  const StarRow({super.key, required this.rating, this.size = 15});
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(
        5,
        (i) => Icon(
          i < rating ? Icons.star : Icons.star_border,
          size: size,
          color: amberAccentOf(context),
        ),
      ),
    );
  }
}

/// Reusable reviews list — used on item detail (reviews for the item) and
/// on user profiles (reviews that user received).
class ReviewsList extends StatelessWidget {
  final List<Review> reviews;
  final bool showItemTitle;
  const ReviewsList({
    super.key,
    required this.reviews,
    this.showItemTitle = false,
  });

  @override
  Widget build(BuildContext context) {
    if (reviews.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Icon(
              Icons.rate_review_outlined,
              size: 18,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 8),
            const Text('No reviews yet'),
          ],
        ),
      );
    }
    final state = context.read<AppState>();
    return Column(
      children: reviews.map((r) {
        final reviewer = state.userById(r.reviewerId);
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) =>
                                UserProfileScreen(userId: reviewer.id),
                          ),
                        ),
                        child: UserAvatar(user: reviewer, radius: 16),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            GestureDetector(
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) =>
                                      UserProfileScreen(userId: reviewer.id),
                                ),
                              ),
                              child: Text(
                                reviewer.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            Text(
                              _dateLabel(r.createdAt),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      StarRow(rating: r.rating),
                    ],
                  ),
                  if (r.comment.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(r.comment),
                  ],
                  if (showItemTitle)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'For: ${state.itemByIdOrNull(r.itemId)?.title ?? 'an item'}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
