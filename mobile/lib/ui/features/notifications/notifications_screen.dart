import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/utils/formatters.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/app_notification.dart';
import '../../../state/app_state.dart';
import '../activity/activity_screen.dart';

IconData _iconFor(String type) {
  switch (type) {
    case 'request-received':
      return Icons.inbox_outlined;
    case 'request-approved':
      return Icons.check_circle_outline;
    case 'request-declined':
      return Icons.cancel_outlined;
    case 'overdue':
      return Icons.alarm_outlined;
    case 'return-reminder':
      return Icons.schedule_outlined;
    case 'review-requested':
      return Icons.rate_review_outlined;
    case 'issue-reported':
      return Icons.report_outlined;
    default:
      return Icons.notifications_outlined;
  }
}

/// Feed derived live from request state, so it can never go stale:
/// approve a request and its notification disappears on its own.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (!state.notificationsEnabled) {
      return Scaffold(
        appBar: AppBar(title: const Text('Notifications')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Text(
              'Notifications are turned off in Settings.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    final feed = state.derivedNotifications;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: feed.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.notifications_off_outlined,
                      size: 52,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'All quiet on the block',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Requests, due reminders, and review prompts will show up here.',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(
                16,
                12,
                16,
                kBottomListPadding,
              ),
              itemCount: feed.length,
              itemBuilder: (context, i) =>
                  _NotificationTile(notification: feed[i]),
            ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final DerivedNotification notification;
  const _NotificationTile({required this.notification});

  @override
  Widget build(BuildContext context) {
    final action = notification.kind == 'action';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        color: action
            ? Theme.of(context).colorScheme.surfaceContainerHighest
            : null,
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: action
                ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.15)
                : Theme.of(context).colorScheme.secondary
                      .withValues(alpha: 0.12),
            child: Icon(
              _iconFor(notification.type),
              color: action
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).colorScheme.secondary,
              size: 20,
            ),
          ),
          title: Text(
            notification.title,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
          ),
          subtitle: Text(notification.body),
          trailing: Text(
            shortDate(notification.createdAt),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          onTap: notification.requestId == null
              ? null
              : () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ActivityScreen()),
                ),
        ),
      ),
    );
  }
}
