import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('item inquiry messaging', () {
    test('seeded inquiry thread exists: Maya asked Marcus about the tent', () {
      final s = AppState();
      final thread = s.messagesForItemThread('i-tent', 'u-marcus');
      expect(thread.length, 2);
      expect(thread.first.senderId, 'u-maya');
      expect(thread.last.senderId, 'u-marcus');
      // It is NOT part of any request thread.
      expect(s.messagesForRequest('req-out-kayak').length, 3);
    });

    test('sendItemMessage lands in the item thread only', () {
      final s = AppState();
      final beforeReq = s.messagesForRequest('req-out-kayak').length;
      s.sendItemMessage(
        'i-kayak',
        'u-tom',
        'Does the kayak come with a roof rack strap?',
      );
      final thread = s.messagesForItemThread('i-kayak', 'u-tom');
      expect(thread.length, 1);
      expect(thread.single.senderId, 'u-maya');
      expect(thread.single.itemId, 'i-kayak');
      expect(thread.single.requestId, isNull);
      // Request threads untouched.
      expect(s.messagesForRequest('req-out-kayak').length, beforeReq);
    });

    test('sendItemMessage ignores blank bodies', () {
      final s = AppState();
      s.sendItemMessage('i-kayak', 'u-tom', '   ');
      expect(s.messagesForItemThread('i-kayak', 'u-tom'), isEmpty);
    });

    test('item conversations appear in the conversations list', () {
      final s = AppState();
      final convos = s.conversations;
      final tent = convos.where((c) => c.key == 'item:i-tent:u-marcus');
      expect(tent.length, 1);
      expect(tent.single.isItemThread, isTrue);
      expect(tent.single.item?.id, 'i-tent');
      expect(tent.single.other.id, 'u-marcus');
      expect(tent.single.lastMessage, isNotNull);
      // Request threads are still listed as request conversations.
      final reqKeys = convos
          .where((c) => c.isRequestThread)
          .map((c) => c.requestId)
          .toSet();
      expect(reqKeys, contains('req-out-kayak'));
      expect(reqKeys, contains('req-active-karaoke'));
    });

    test('a fresh inquiry shows up in conversations immediately', () {
      final s = AppState();
      expect(
        s.conversations.where((c) => c.key == 'item:i-kayak:u-tom'),
        isEmpty,
      );
      s.sendItemMessage('i-kayak', 'u-tom', 'Is the paddle included?');
      final found = s.conversations.where((c) => c.key == 'item:i-kayak:u-tom');
      expect(found.length, 1);
      expect(found.single.lastMessage?.body, 'Is the paddle included?');
    });

    test('user threads (profile messages) work and list separately', () {
      final s = AppState();
      s.sendUserMessage(
        'u-priya',
        'Hi Priya! Your garden tools are famous on this block.',
      );
      final thread = s.messagesForUserThread('u-priya');
      expect(thread.length, 1);
      expect(thread.single.itemId, isNull);
      expect(thread.single.requestId, isNull);
      // No item thread was created by the user-thread message.
      expect(s.messagesForItemThread('i-tent', 'u-priya'), isEmpty);
      final convo = s.conversations.where((c) => c.key == 'user:u-priya');
      expect(convo.length, 1);
      expect(convo.single.isItemThread, isFalse);
      expect(convo.single.isRequestThread, isFalse);
    });

    test('request-thread behavior is unchanged by pair threads', () {
      final s = AppState();
      s.sendItemMessage('i-tent', 'u-marcus', 'One more question!');
      s.sendMessage('req-out-kayak', 'See you at 10.');
      expect(s.messagesForRequest('req-out-kayak').length, 4);
      expect(s.messagesForItemThread('i-tent', 'u-marcus').length, 3);
    });
  });
}
