import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('messages', () {
    test('seed threads exist for the kayak and karaoke requests', () {
      final s = AppState();
      expect(s.messagesForRequest('req-out-kayak').length, 3);
      expect(s.messagesForRequest('req-active-karaoke').length, 3);
      expect(s.messagesForRequest('req-out-kayak').first.senderId, 'u-tom');
    });

    test('sendMessage appends to the right thread as the current user', () {
      final s = AppState();
      const reqId = 'req-out-kayak';
      final before = s.messagesForRequest(reqId).length;
      s.sendMessage(reqId, '  See you Saturday at 10!  ');
      final thread = s.messagesForRequest(reqId);
      expect(thread.length, before + 1);
      expect(thread.last.body, 'See you Saturday at 10!');
      expect(thread.last.senderId, 'u-maya');
      // Other threads untouched.
      expect(s.messagesForRequest('req-active-karaoke').length, 3);
    });

    test('sendMessage ignores blank bodies', () {
      final s = AppState();
      const reqId = 'req-out-kayak';
      final before = s.messagesForRequest(reqId).length;
      s.sendMessage(reqId, '   ');
      expect(s.messagesForRequest(reqId).length, before);
    });

    test('conversations cover requests the user is part of', () {
      final s = AppState();
      final ids = s.myConversations.map((r) => r.id).toSet();
      expect(ids, contains('req-out-kayak'));
      expect(ids, contains('req-in-pasta-diego'));
      expect(ids, contains('req-active-karaoke'));
      expect(
        s
            .otherPartyFor(
              s.requests.firstWhere((r) => r.id == 'req-out-kayak'),
            )
            .id,
        'u-tom',
      );
    });
  });
}
