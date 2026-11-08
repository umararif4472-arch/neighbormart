import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/data/models/item.dart';
import 'package:neighbor_mart/data/models/user.dart';
import 'package:neighbor_mart/state/app_state.dart';

Item _item(String id, String category) => Item(
  id: id,
  ownerId: 'u-maya',
  title: 'Item $id',
  description: 'A test item for grouping checks.',
  category: category,
  condition: 'Good',
  location: const LatLng(45.5, -122.63),
  availability: 'available',
  borrowTerms: const BorrowTerms(
    maxDurationDays: 3,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: '',
  ),
  createdAt: DateTime(2026, 1, 1),
);

void main() {
  group('new categories', () {
    test('the three new categories exist, before Other', () {
      for (final c in ['Cars & Vehicles', 'Houses & Places', 'Indoor Sports']) {
        expect(kItemCategories, contains(c), reason: '$c should be listed');
        expect(
          kItemCategories.indexOf(c),
          lessThan(kItemCategories.indexOf('Other')),
          reason: '$c should come before Other',
        );
      }
      expect(kItemCategories.last, 'Other');
    });

    test('seed data covers the new categories, with photos', () {
      final s = AppState();
      int count(String c) => s.items.where((i) => i.category == c).length;
      expect(count('Cars & Vehicles'), greaterThanOrEqualTo(2));
      expect(count('Houses & Places'), greaterThanOrEqualTo(2));
      expect(count('Indoor Sports'), greaterThanOrEqualTo(2));
      for (final item in s.items.where(
        (i) => [
          'Cars & Vehicles',
          'Houses & Places',
          'Indoor Sports',
        ].contains(i.category),
      )) {
        expect(
          item.photos,
          isNotEmpty,
          reason: '${item.title} should have at least one photo',
        );
      }
    });
  });

  group('listing photos', () {
    test('createItem stores the photos list on the created item', () {
      final s = AppState();
      final created = s.createItem(
        title: 'Photo Test Ladder XYZ',
        category: 'Tools',
        description: 'A ladder listed with photos for testing.',
        condition: 'Good',
        maxDurationDays: 4,
        photos: const ['/tmp/ladder-front.jpg', 'https://example.com/x.jpg'],
      );
      expect(created.photos, [
        '/tmp/ladder-front.jpg',
        'https://example.com/x.jpg',
      ]);
      expect(s.itemById(created.id).photos, created.photos);
    });

    test('updateItem can change the photos of an existing item', () {
      final s = AppState();
      final created = s.createItem(
        title: 'Editable Photo Item XYZ',
        category: 'Kitchen',
        description: 'Starts with one photo, gains another.',
        condition: 'Good',
        maxDurationDays: 4,
        photos: const ['/tmp/one.jpg'],
      );
      final updated = s.updateItem(
        created.id,
        title: 'Editable Photo Item XYZ',
        category: 'Kitchen',
        description: 'Starts with one photo, gains another.',
        condition: 'Good',
        maxDurationDays: 4,
        photos: const ['/tmp/one.jpg', '/tmp/two.jpg'],
      );
      expect(updated, isNotNull);
      expect(s.itemById(created.id).photos, ['/tmp/one.jpg', '/tmp/two.jpg']);
    });
  });

  group('groupItemsByCategory', () {
    test('groups correctly and preserves category order', () {
      final grouped = groupItemsByCategory([
        _item('a', 'Sports'),
        _item('b', 'Tools'),
        _item('c', 'Sports'),
        _item('d', 'Cars & Vehicles'),
        _item('e', 'Tools'),
      ]);
      expect(grouped.keys.toList(), ['Tools', 'Sports', 'Cars & Vehicles']);
      expect(grouped['Tools']!.map((i) => i.id), ['b', 'e']);
      expect(grouped['Sports']!.map((i) => i.id), ['a', 'c']);
      expect(grouped['Cars & Vehicles']!.single.id, 'd');
    });

    test('omits empty categories and handles an empty list', () {
      final grouped = groupItemsByCategory([_item('a', 'Kitchen')]);
      expect(grouped.keys, ['Kitchen']);
      expect(groupItemsByCategory(const []), isEmpty);
    });
  });
}
