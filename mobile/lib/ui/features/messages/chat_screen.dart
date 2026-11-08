import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/item.dart';
import '../../../data/models/message.dart';
import '../../../state/app_state.dart';
import '../item_detail/item_detail_screen.dart';
import '../not_found/not_found_screen.dart';
import '../profile/user_profile_screen.dart';

String chatTimeLabel(DateTime t) {
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  final m = t.minute.toString().padLeft(2, '0');
  final suffix = t.hour < 12 ? 'am' : 'pm';
  return '$h:$m$suffix';
}

/// One chat screen for all three thread kinds:
/// - a borrow-request thread (`ChatScreen(requestId: ...)`, the original)
/// - an item inquiry (`ChatScreen.forItem`) — asking the owner about a
///   listing before requesting it
/// - a general user thread (`ChatScreen.forUser`), from a profile
class ChatScreen extends StatefulWidget {
  final String? requestId;
  final String? itemId;
  final String? otherUserId;

  const ChatScreen({super.key, this.requestId, this.itemId, this.otherUserId});

  const ChatScreen.forItem({
    super.key,
    required this.itemId,
    required this.otherUserId,
  }) : requestId = null;

  const ChatScreen.forUser({super.key, required this.otherUserId})
    : requestId = null,
      itemId = null;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  bool get _isRequestThread => widget.requestId != null;
  bool get _isItemThread => !_isRequestThread && widget.itemId != null;

  void _send(AppState state) {
    final text = _ctrl.text;
    if (text.trim().isEmpty) return;
    if (_isRequestThread) {
      state.sendMessage(widget.requestId!, text);
    } else if (_isItemThread) {
      state.sendItemMessage(widget.itemId!, widget.otherUserId!, text);
    } else {
      state.sendUserMessage(widget.otherUserId!, text);
    }
    _ctrl.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.currentUser;

    // Resolve the thread: header, messages, and empty-state copy.
    final Widget header;
    final List<Message> msgs;
    final String emptyText;

    if (_isRequestThread) {
      final req = state.requests
          .where((r) => r.id == widget.requestId)
          .firstOrNull;
      if (req == null) {
        return const NotFoundScreen(message: 'That conversation is gone.');
      }
      final itemTitle =
          state.itemByIdOrNull(req.itemId)?.title ??
          state.listingByIdOrNull(req.itemId)?.title ??
          'Listing';
      final other = state.otherPartyFor(req);
      msgs = state.messagesForRequest(req.id);
      emptyText = 'No messages yet. Say hi and sort out the pickup.';
      header = _PersonHeader(
        title: other.name,
        subtitle: itemTitle,
        leading: UserAvatar(user: other, radius: 18),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => UserProfileScreen(userId: other.id),
          ),
        ),
      );
    } else if (_isItemThread) {
      final item = state.itemByIdOrNull(widget.itemId!);
      final other = state.userByIdOrNull(widget.otherUserId!);
      if (item == null || other == null) {
        return const NotFoundScreen(message: 'That conversation is gone.');
      }
      msgs = state.messagesForItemThread(item.id, other.id);
      emptyText =
          'Ask ${other.name.split(' ').first} anything about this item.';
      header = _ItemHeader(item: item, otherName: other.name);
    } else {
      final other = state.userByIdOrNull(widget.otherUserId!);
      if (other == null) {
        return const NotFoundScreen(message: 'That conversation is gone.');
      }
      msgs = state.messagesForUserThread(other.id);
      emptyText = 'Say hi to ${other.name.split(' ').first}.';
      header = _PersonHeader(
        title: other.name,
        subtitle: other.neighborhood,
        leading: UserAvatar(user: other, radius: 18),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => UserProfileScreen(userId: other.id),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(titleSpacing: 0, title: header),
      body: Column(
        children: [
          Expanded(
            child: msgs.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(emptyText, textAlign: TextAlign.center),
                    ),
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    itemCount: msgs.length,
                    itemBuilder: (context, i) => _Bubble(
                      message: msgs[i],
                      mine: msgs[i].senderId == me.id,
                    ),
                  ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _ctrl,
                      decoration: const InputDecoration(hintText: 'Message…'),
                      onSubmitted: (_) => _send(state),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: () => _send(state),
                    style: IconButton.styleFrom(
                      minimumSize: const Size(48, 48),
                    ),
                    icon: const Icon(Icons.send, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Avatar + name header that taps through to the person's profile.
class _PersonHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget leading;
  final VoidCallback onTap;
  const _PersonHeader({
    required this.title,
    required this.subtitle,
    required this.leading,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          leading,
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Item-thread header: photo thumb + item title + the other person's
/// name; taps through to the item itself.
class _ItemHeader extends StatelessWidget {
  final Item item;
  final String otherName;
  const _ItemHeader({required this.item, required this.otherName});
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => ItemDetailScreen(itemId: item.id)),
      ),
      child: Row(
        children: [
          ItemPhoto.forItem(item, width: 40, height: 40, radius: 10),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  'Chatting with $otherName',
                  style: Theme.of(context).textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final Message message;
  final bool mine;
  const _Bubble({required this.message, required this.mine});
  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        decoration: BoxDecoration(
          color: mine ? AppColors.terracotta : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          border: mine ? null : Border.all(color: AppColors.sand),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message.body,
              style: TextStyle(color: mine ? Colors.white : AppColors.bark),
            ),
            const SizedBox(height: 3),
            Text(
              chatTimeLabel(message.createdAt),
              style: TextStyle(
                fontSize: 10,
                color: mine ? Colors.white70 : AppColors.barkLight,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
