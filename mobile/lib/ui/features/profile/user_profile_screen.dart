import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/trust_score.dart';
import '../../../core/widgets/reviews_list.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/user.dart';
import '../../../state/app_state.dart';
import '../item_detail/item_detail_screen.dart';
import '../messages/chat_screen.dart';
import '../not_found/not_found_screen.dart';
import '../trust/trust_explainer_screen.dart';
import 'edit_profile_screen.dart';
import 'manage_items_screen.dart';
import 'settings_screen.dart';
import 'verification_screen.dart';

/// Profile for any user. The Profile tab renders this for the current
/// user, which adds the account-management entries at the bottom.
class UserProfileScreen extends StatelessWidget {
  final String userId;
  const UserProfileScreen({super.key, required this.userId});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final user = state.userByIdOrNull(userId);
    if (user == null) {
      return const NotFoundScreen(
        message: 'That neighbor is not on the block anymore.',
      );
    }
    final isOwn = user.id == state.currentUser.id;
    final trust = state.trustFor(user);
    final items = state.items.where((i) => i.ownerId == user.id).toList();
    final reviews = state.reviewsFor(user.id);
    return Scaffold(
      appBar: AppBar(title: Text(isOwn ? 'Profile' : 'Neighbor profile')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, kBottomListPadding),
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
                    const SizedBox(height: 6),
                    _VerifiedRow(user: user),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(user.bio),
          if (!isOwn) ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ChatScreen.forUser(otherUserId: user.id),
                  ),
                ),
                icon: const Icon(Icons.chat_bubble_outline),
                label: Text('Message ${user.name.split(' ').first}'),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const TrustExplainerScreen()),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          '${trust.total}',
                          style: const TextStyle(
                            fontSize: 44,
                            fontWeight: FontWeight.w800,
                            color: AppColors.terracotta,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Trust score',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                child: TrustBadge(result: trust),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _Bar(
                      label: 'On-time returns',
                      points: trust.breakdown.onTimeReturns,
                      max: kOnTimeMax,
                    ),
                    _Bar(
                      label: 'Reviews',
                      points: trust.breakdown.reviews,
                      max: kReviewsMax,
                    ),
                    _Bar(
                      label: 'Completed deals',
                      points: trust.breakdown.completedDeals,
                      max: kDealsMax,
                    ),
                    _Bar(
                      label: 'Verified profile',
                      points: trust.breakdown.verification,
                      max: 10,
                    ),
                    _Bar(
                      label: 'Account age',
                      points: trust.breakdown.accountAge,
                      max: kAccountAgeMax,
                    ),
                    _Bar(
                      label: 'Responsiveness',
                      points: trust.breakdown.responsiveness,
                      max: 15,
                    ),
                    Text(
                      'Tap to see how trust works',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: 'Lends',
                  value: '${user.stats.successfulLends}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: 'Borrows',
                  value: '${user.stats.successfulBorrows}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  label: 'On-time',
                  value:
                      '${user.stats.onTimeReturns}/${user.stats.onTimeReturns + user.stats.lateReturns}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('Badges', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (user.badges.isEmpty)
            const Text('No badges yet — the first on-time return earns one.')
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: user.badges
                  .map(
                    (b) => Chip(
                      avatar: const Icon(Icons.emoji_events, size: 16),
                      label: Text(b.label),
                      backgroundColor: AppColors.creamDark,
                    ),
                  )
                  .toList(),
            ),
          const SizedBox(height: 20),
          Text(
            isOwn
                ? 'My items (${items.length})'
                : 'Listed by ${user.name.split(' ').first} (${items.length})',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (items.isEmpty)
            const Text('Nothing listed yet.')
          else
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(
                  child: ListTile(
                    leading: ItemPhoto.forItem(
                      item,
                      width: 44,
                      height: 44,
                      radius: 12,
                    ),
                    title: Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text('${item.category} · ${item.availability}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ItemDetailScreen(itemId: item.id),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 20),
          Text(
            'Reviews (${reviews.length})',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ReviewsList(reviews: reviews, showItemTitle: true),
          if (isOwn) ...[
            const SizedBox(height: 20),
            Text('Account', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            _AccountTile(
              icon: Icons.edit_outlined,
              title: 'Edit profile',
              subtitle: 'Name, bio, and neighborhood',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const EditProfileScreen()),
              ),
            ),
            _AccountTile(
              icon: Icons.verified_outlined,
              title: 'Verification',
              subtitle: 'Verify phone and email to earn trust points',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const VerificationScreen()),
              ),
            ),
            _AccountTile(
              icon: Icons.inventory_2_outlined,
              title: 'Manage my items',
              subtitle: 'Edit, delete, or pause your listings',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ManageItemsScreen()),
              ),
            ),
            _AccountTile(
              icon: Icons.school_outlined,
              title: 'How trust works',
              subtitle: 'The five ingredients of your trust score',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const TrustExplainerScreen()),
              ),
            ),
            _AccountTile(
              icon: Icons.settings_outlined,
              title: 'Settings',
              subtitle: 'Notifications, reset, sign out',
              onTap: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => const SettingsScreen())),
            ),
          ],
        ],
      ),
    );
  }
}

class _VerifiedRow extends StatelessWidget {
  final AppUser user;
  const _VerifiedRow({required this.user});
  @override
  Widget build(BuildContext context) {
    Widget chip(bool ok, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          ok ? Icons.check_circle : Icons.cancel,
          size: 14,
          color: ok ? AppColors.moss : AppColors.barkLight,
        ),
        const SizedBox(width: 4),
        Text(
          '$label ${ok ? 'verified' : 'unverified'}',
          style: const TextStyle(fontSize: 12),
        ),
      ],
    );
    return Wrap(
      spacing: 10,
      children: [
        chip(user.phoneVerified, 'Phone'),
        chip(user.emailVerified, 'Email'),
      ],
    );
  }
}

class _AccountTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _AccountTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: AppColors.terracotta),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  final String label;
  final int points;
  final int max;
  const _Bar({required this.label, required this.points, required this.max});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: const TextStyle(fontSize: 13)),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: max == 0 ? 0 : points / max,
                minHeight: 9,
                backgroundColor: AppColors.sand,
                color: AppColors.moss,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$points/$max',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  const _StatCard({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
