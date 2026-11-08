import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/state/app_state.dart';

void main() {
  group('favorites', () {
    test('toggleFavorite adds an item and isFavorite reflects it', () {
      final s = AppState();
      final id = s.items.first.id;
      expect(s.isFavorite(id), isFalse);
      expect(s.favoriteItems, isEmpty);

      s.toggleFavorite(id);

      expect(s.isFavorite(id), isTrue);
      expect(s.favoriteItemIds, contains(id));
      expect(s.favoriteItems.map((i) => i.id), [id]);
    });

    test('toggleFavorite again removes the item', () {
      final s = AppState();
      final id = s.items.first.id;
      s.toggleFavorite(id);
      s.toggleFavorite(id);
      expect(s.isFavorite(id), isFalse);
      expect(s.favoriteItems, isEmpty);
    });

    test('favoriteItems returns exactly the favorited items', () {
      final s = AppState();
      final a = s.items[0];
      final b = s.items[2];
      s.toggleFavorite(b.id);
      s.toggleFavorite(a.id);
      final favs = s.favoriteItems;
      expect(favs.length, 2);
      expect(favs.map((i) => i.id).toSet(), {a.id, b.id});
    });

    test('favorites survive other state operations, incl. createItem', () {
      final s = AppState();
      final existing = s.items.first;
      s.toggleFavorite(existing.id);

      final created = s.createItem(
        title: 'Step Ladder (test)',
        category: 'Tools',
        description: 'A ladder created while favorites exist.',
        condition: 'Good',
        maxDurationDays: 3,
      );

      // Earlier favorite is untouched by the unrelated mutation...
      expect(s.isFavorite(existing.id), isTrue);
      expect(s.favoriteItems.map((i) => i.id), contains(existing.id));

      // ...and the brand-new item can itself be favorited.
      s.toggleFavorite(created.id);
      expect(s.isFavorite(created.id), isTrue);
      expect(s.favoriteItems.map((i) => i.id).toSet(), {
        existing.id,
        created.id,
      });
    });

    test('toggling an unknown id does not leak into favoriteItems', () {
      final s = AppState();
      s.toggleFavorite('no-such-item');
      expect(s.isFavorite('no-such-item'), isTrue);
      expect(s.favoriteItems, isEmpty);
    });
  });
}
