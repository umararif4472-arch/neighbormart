import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../utils/trust_score.dart';
import '../../data/models/user.dart';
import 'shared_widgets.dart';

/// The identity header built for the profile screen (Part 3):
/// avatar (initials — AppUser carries no photo field, so
/// [UserAvatar]'s initials are the photo fallback by design), name,
/// neighborhood + member-since, the trust-score badge, and the
/// Phone/Email verification chips. Shared by UserProfileScreen and
/// the app drawer's header block so identity + trust markup exists
/// exactly once.
class ProfileHeaderCard extends StatelessWidget {
  final AppUser user;
  final TrustScoreResult trust;
  const ProfileHeaderCard({super.key, required this.user, required this.trust});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                UserAvatar(user: user, radius: 34),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.name,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        '${user.neighborhood} · Member since ${user.joinedAt.year}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      // Same guard as the trust detail card: scale
                      // the badge down rather than letting its row
                      // overflow at large text scales.
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: TrustBadge(result: trust),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            VerifiedChips(user: user),
          ],
        ),
      ),
    );
  }
}

/// Phone / Email verification status as small chips (used inside
/// [ProfileHeaderCard]).
class VerifiedChips extends StatelessWidget {
  final AppUser user;
  const VerifiedChips({super.key, required this.user});
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget chip(bool ok, String label) => Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            ok ? Icons.check_circle : Icons.cancel,
            size: 14,
            color: ok ? scheme.secondary : scheme.onSurfaceVariant,
          ),
          const SizedBox(width: 4),
          // Flexible + ellipsis: at large text scales the label
          // shrinks into the chip's share of the Wrap instead of
          // overflowing the row.
          Flexible(
            child: Text(
              '$label ${ok ? 'verified' : 'unverified'}',
              style: const TextStyle(fontSize: 12),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        chip(user.phoneVerified, 'Phone'),
        chip(user.emailVerified, 'Email'),
      ],
    );
  }
}
