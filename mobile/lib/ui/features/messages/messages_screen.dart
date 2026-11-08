import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/utils/formatters.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../state/app_state.dart';
import 'chat_screen.dart';

/// Conversation list — borrow-request threads, item inquiries, and
/// general neighbor chats, most recently active first.
class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final convos = state.conversations;
    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: convos.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'No conversations yet. Ask an owner about an item, or request one — your chats show up here.',
                  textAlign: TextAlign.center,
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
              itemCount: convos.length,
              itemBuilder: (context, i) =>
                  _ConversationTile(conversation: convos[i]),
            ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  final Conversation conversation;
  const _ConversationTile({required this.conversation});

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final state = context.read<AppState>();
    final last = c.lastMessage;

    final Widget leading;
    final String title;
    final String subtitle;
    if (c.isItemThread) {
      leading = c.item != null
          ? ItemPhoto.forItem(c.item!, width: 48, height: 48, radius: 12)
          : UserAvatar(user: c.other, radius: 24);
      title = c.item?.title ?? 'Item inquiry';
      subtitle = last != null
          ? '${c.other.name} — ${last.body}'
          : '${c.other.name} — no messages yet';
    } else if (c.isRequestThread) {
      leading = UserAvatar(user: c.other, radius: 24);
      title = c.other.name;
      final itemTitle = c.item?.title ?? c.listingTitle ?? 'Item';
      subtitle = last != null
          ? '$itemTitle — ${last.body}'
          : '$itemTitle — no messages yet';
    } else {
      leading = UserAvatar(user: c.other, radius: 24);
      title = c.other.name;
      subtitle = last?.body ?? 'Say hi';
    }

    final req = c.isRequestThread
        ? state.requests.where((r) => r.id == c.requestId).firstOrNull
        : null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => c.isRequestThread
                  ? ChatScreen(requestId: c.requestId!)
                  : c.isItemThread
                  ? ChatScreen.forItem(
                      itemId: c.itemId!,
                      otherUserId: c.other.id,
                    )
                  : ChatScreen.forUser(otherUserId: c.other.id),
            ),
          ),
          // A hand-built row instead of ListTile: ListTile's fixed
          // internal text column overflows at large text scales
          // with a two-line subtitle; here every part sizes to its
          // content and the middle column flexes.
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                leading,
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyMedium
                            ?.copyWith(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (req != null)
                      StatusChip(status: req.status, isOverdue: req.isOverdue),
                    if (req != null) const SizedBox(height: 4),
                    Text(
                      shortDate(c.lastActivity),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
