import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/trust_score.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/borrow_request.dart';
import '../../../data/models/listing.dart';
import '../../../state/app_state.dart';
import '../explore/listing_section_view.dart';
import '../messages/chat_screen.dart';
import '../profile/user_profile_screen.dart';
import 'report_issue_sheet.dart';
import 'review_sheet.dart';

class ActivityScreen extends StatelessWidget {
  const ActivityScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'Activity',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'My requests'),
              Tab(text: 'Requests for me'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _RequestList(isLending: false),
            _RequestList(isLending: true),
          ],
        ),
      ),
    );
  }
}

class _RequestList extends StatelessWidget {
  final bool isLending;
  const _RequestList({required this.isLending});
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final list = isLending ? state.incomingRequests : state.outgoingRequests;
    if (list.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            isLending
                ? 'Nothing here yet. When neighbors request your listings, they will show up here.'
                : 'No requests yet. Find something in Explore and send a request to get started.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, kBottomListPadding),
      itemCount: list.length,
      itemBuilder: (context, i) =>
          _RequestCard(request: list[i], isLending: isLending),
    );
  }
}

/// Shows the tier-up celebration when [action] raised the signed-in
/// user's trust tier (feature 20). Captures the tier before and after.
void _runWithTierWatch(
  BuildContext context,
  AppState state,
  VoidCallback action,
) {
  final before = state.trustFor(state.currentUser);
  action();
  final after = state.trustFor(state.currentUser);
  if (tierMinScore(after.tierName) > tierMinScore(before.tierName)) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: Theme.of(dialogContext).colorScheme.secondary
                    .withValues(alpha: 0.14),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.emoji_events,
                size: 44,
                color: Theme.of(dialogContext).colorScheme.secondary,
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'You leveled up!',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              'That on-time return moved you to ${after.tierName} with a trust score of ${after.total}.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            TrustBadge(result: after),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Nice!'),
          ),
        ],
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  final BorrowRequest request;
  final bool isLending;
  const _RequestCard({required this.request, required this.isLending});
  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final watched = context.watch<AppState>();
    // Phase 5: requests can target any section's listing, not just
    // legacy items — resolve title/owner across both catalogs.
    final item = watched.itemByIdOrNull(request.itemId);
    final listing = watched.listingByIdOrNull(request.itemId);
    final title = item?.title ?? listing?.title ?? 'Listing';
    final ownerId = item?.ownerId ?? listing?.ownerId ?? '';
    final other = isLending
        ? watched.userById(request.borrowerId)
        : watched.userById(ownerId);
    final overdue = request.isOverdue;
    final overlaps = isLending && request.status == 'pending'
        ? watched.pendingOverlaps(request)
        : const <BorrowRequest>[];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (item != null)
                    ItemPhoto.forItem(item, width: 48, height: 48, radius: 12)
                  else
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        listing != null
                            ? (kSectionEmoji[listing.section] ?? '📦')
                            : '📦',
                        style: const TextStyle(fontSize: 24),
                      ),
                    ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: Theme.of(context).textTheme.titleMedium,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        InkWell(
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) =>
                                  UserProfileScreen(userId: other.id),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              UserAvatar(user: other, radius: 10),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  '${isLending ? 'Requester' : 'Owner'}: ${other.name}',
                                  style: Theme.of(context).textTheme.bodySmall
                                      ?.copyWith(
                                        decoration: TextDecoration.underline,
                                      ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusChip(status: request.status, isOverdue: overdue),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${dateRangeLabel(request.period.start, request.period.end)} · ${dueLabel(request.period.end)}',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: overdue
                      ? Theme.of(context).colorScheme.error
                      : Theme.of(context).colorScheme.onSurface,
                ),
              ),
              if (request.slot != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    '🏟️ Slot: ${request.slot!.date} · ${request.slot!.startTime}–${request.slot!.endTime}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              if (request.offerAmount != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'Offer: ${formatRs(request.offerAmount!)}'
                    '${listing != null ? ' (asking ${formatRs(listing.price)})' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              if (request.note.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    '“${request.note}”',
                    style: const TextStyle(fontStyle: FontStyle.italic),
                  ),
                ),
              if (overlaps.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 10),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: amberAccentOf(context).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: amberAccentOf(context).withValues(alpha: 0.5),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.warning_amber,
                        size: 18,
                        color: amberAccentOf(context),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          overlaps
                              .map(
                                (o) =>
                                    '${watched.userById(o.borrowerId).name.split(' ').first} also requested this item for overlapping dates (${dateRangeLabel(o.period.start, o.period.end)})',
                              )
                              .join('\n'),
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (request.issue != null)
                Container(
                  margin: const EdgeInsets.only(top: 10),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.error
                        .withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.report_outlined,
                        size: 18,
                        color: Theme.of(context).colorScheme.error,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Issue reported: ${request.issue!.reason}'
                          '${request.issue!.note.isNotEmpty ? ' — ${request.issue!.note}' : ''}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (request.status == 'returned' ||
                  request.status == 'reviewed' ||
                  request.status == 'completed')
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    children: [
                      Icon(
                        Icons.check_circle,
                        size: 16,
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        request.status == 'reviewed'
                            ? 'Completed — both sides reviewed'
                            : request.status == 'completed'
                            ? 'Deal completed'
                            : 'Completed — item returned',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).colorScheme.secondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ..._actions(context, state),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _actions(BuildContext context, AppState state) {
    final widgets = <Widget>[];
    void gap() => widgets.add(const SizedBox(height: 12));
    if (isLending && request.status == 'pending') {
      gap();
      widgets.add(
        Row(
          children: [
            Expanded(
              child: ElevatedButton(
                onPressed: () {
                  state.approveRequest(request.id);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Approved — they can pick up now.'),
                    ),
                  );
                },
                child: const Text('Approve'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                onPressed: () {
                  state.declineRequest(request.id);
                  ScaffoldMessenger.of(context)
                      .showSnackBar(const SnackBar(content: Text('Declined.')));
                },
                child: const Text('Decline'),
              ),
            ),
          ],
        ),
      );
    }
    if (request.status == 'approved') {
      // Phase 5: sell + arena deals close with "mark completed" on the
      // owner's side — there is no pickup/return leg.
      final listing = state.listingByIdOrNull(request.itemId);
      final closesDeal =
          isLending &&
          listing != null &&
          (listing.listingType == ListingType.sell ||
              listing.section == ListingSection.arenas);
      gap();
      widgets.add(
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: closesDeal
                ? () {
                    state.markCompleted(request.id);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          listing.listingType == ListingType.sell
                              ? 'Marked sold — deal completed.'
                              : 'Marked completed — deal done.',
                        ),
                      ),
                    );
                  }
                : () {
                    state.markPickedUp(request.id);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Marked as picked up — deal is now active.',
                        ),
                      ),
                    );
                  },
            child: Text(
              closesDeal
                  ? (listing.listingType == ListingType.sell
                        ? 'Mark sold'
                        : 'Mark completed')
                  : 'Mark picked up',
            ),
          ),
        ),
      );
    }
    if (request.status == 'active') {
      gap();
      widgets.add(
        Row(
          children: [
            Expanded(
              child: ElevatedButton(
                onPressed: () {
                  _runWithTierWatch(context, state, () {
                    state.markReturned(request.id, onTime: true);
                  });
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Returned on time — trust updated.'),
                    ),
                  );
                },
                child: const Text('Returned on-time'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                onPressed: () {
                  _runWithTierWatch(context, state, () {
                    state.markReturned(request.id, onTime: false);
                  });
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'Marked late — their trust score reflects it.',
                      ),
                    ),
                  );
                },
                child: const Text('Returned late'),
              ),
            ),
          ],
        ),
      );
    }
    // Leave a review — deal finished and I have not reviewed yet.
    final canReview =
        (request.status == 'returned' || request.status == 'completed') &&
        !context.read<AppState>().hasReviewed(
          request.id,
          context.read<AppState>().currentUser.id,
        );
    if (canReview) {
      gap();
      widgets.add(
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () => ReviewSheet.show(context, request.id),
            icon: const Icon(Icons.star_outline, size: 18),
            label: const Text('Leave a review'),
          ),
        ),
      );
    }
    // Message + Report row for any live/finished conversation.
    if (request.status != 'declined' && request.status != 'cancelled') {
      gap();
      widgets.add(
        Row(
          children: [
            Expanded(
              child: TextButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ChatScreen(requestId: request.id),
                  ),
                ),
                icon: const Icon(Icons.chat_bubble_outline, size: 18),
                label: const Text('Message'),
              ),
            ),
            if (request.issue == null &&
                (request.status == 'active' ||
                    request.status == 'returned' ||
                    request.status == 'reviewed' ||
                    request.isOverdue))
              Expanded(
                child: TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.error,
                  ),
                  onPressed: () => ReportIssueSheet.show(context, request.id),
                  icon: const Icon(Icons.report_outlined, size: 18),
                  label: const Text('Report issue'),
                ),
              ),
          ],
        ),
      );
    }
    return widgets;
  }
}
