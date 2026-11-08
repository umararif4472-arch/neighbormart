import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/core/cloudinary_config.dart';
import 'package:neighbor_mart/data/models/listing.dart';
import 'package:neighbor_mart/data/services/photo_upload_service.dart';
import 'package:neighbor_mart/ui/features/list_item/photo_upload_field.dart';

const _cloud =
    'https://res.cloudinary.com/sgwcguwo/image/upload/neighbormart/listings/abc.jpg';
const _cloudVersioned =
    'https://res.cloudinary.com/sgwcguwo/image/upload/v1712345/neighbormart/listings/abc.jpg';
const _foreign = 'https://picsum.photos/seed/drill/600/450';

void main() {
  group('cloudinaryImageUrl / cardImageUrl', () {
    test('inserts the card transform after /upload/', () {
      expect(
        cardImageUrl(_cloud),
        'https://res.cloudinary.com/sgwcguwo/image/upload/'
        'w_600,h_450,c_fill,q_auto,f_auto/neighbormart/listings/abc.jpg',
      );
    });

    test('inserts the transform before a version segment', () {
      expect(
        cardImageUrl(_cloudVersioned),
        'https://res.cloudinary.com/sgwcguwo/image/upload/'
        'w_600,h_450,c_fill,q_auto,f_auto/v1712345/neighbormart/listings/abc.jpg',
      );
    });

    test('custom transforms work the same way', () {
      expect(
        cloudinaryImageUrl(_cloud, transform: 'w_100'),
        contains('/upload/w_100/neighbormart/'),
      );
    });

    test('foreign URLs and local paths pass through unchanged', () {
      expect(cardImageUrl(_foreign), _foreign);
      expect(cardImageUrl('/data/user/0/photo.jpg'), '/data/user/0/photo.jpg');
      expect(cardImageUrl(''), '');
    });

    test('already-transformed URLs are not transformed twice', () {
      final once = cardImageUrl(_cloud);
      expect(cardImageUrl(once), once);
    });

    test('isCloudinaryUrl only matches our cloud', () {
      expect(isCloudinaryUrl(_cloud), isTrue);
      expect(isCloudinaryUrl(_foreign), isFalse);
      expect(
        isCloudinaryUrl(
          'https://res.cloudinary.com/someoneelse/image/upload/x.jpg',
        ),
        isFalse,
      );
    });
  });

  group('caps and minimums', () {
    test('per-section photo caps match the Phase 4 spec', () {
      expect(photoCapForSection(ListingSection.items), 10);
      expect(photoCapForSection(ListingSection.vehicles), 15);
      expect(photoCapForSection(ListingSection.properties), 20);
      expect(photoCapForSection(ListingSection.arenas), 10);
    });

    test('only vehicles and properties have a publish minimum', () {
      expect(minPhotosForSection(ListingSection.vehicles), 3);
      expect(minPhotosForSection(ListingSection.properties), 3);
      expect(minPhotosForSection(ListingSection.items), 0);
      expect(minPhotosForSection(ListingSection.arenas), 0);
    });
  });

  group('validatePhotoFile', () {
    test('accepts jpg, jpeg, png and webp under the cap', () {
      for (final name in ['a.jpg', 'b.JPG', 'c.jpeg', 'd.png', 'e.webp']) {
        expect(
          validatePhotoFile(nameOrPath: name, sizeBytes: 1024),
          isNull,
          reason: name,
        );
      }
      expect(
        validatePhotoFile(nameOrPath: 'a.jpg', sizeBytes: kMaxPhotoBytes),
        isNull,
      );
    });

    test('rejects non-image formats with a clear message', () {
      for (final name in ['a.gif', 'b.bmp', 'c.mp4', 'noextension']) {
        final error = validatePhotoFile(nameOrPath: name, sizeBytes: 1024);
        expect(error, isNotNull, reason: name);
        expect(error, contains('JPG, PNG or WebP'));
      }
    });

    test('rejects files over 5 MB — the preset cannot enforce size', () {
      final error = validatePhotoFile(
        nameOrPath: 'big.jpg',
        sizeBytes: kMaxPhotoBytes + 1,
      );
      expect(error, isNotNull);
      expect(error, contains('5 MB'));
    });

    test('rejects empty/unreadable files', () {
      expect(validatePhotoFile(nameOrPath: 'a.jpg', sizeBytes: 0), isNotNull);
    });
  });

  group('parseUploadResponse', () {
    test('returns secure_url from a success body', () {
      final body = jsonEncode({
        'public_id': 'neighbormart/listings/abc',
        'secure_url': _cloud,
      });
      expect(parseUploadResponse(body), _cloud);
    });

    test('surfaces Cloudinary\'s own error message', () {
      final body = jsonEncode({
        'error': {'message': 'File size too large.'},
      });
      expect(
        () => parseUploadResponse(body),
        throwsA(
          isA<PhotoUploadException>().having(
            (e) => e.message,
            'message',
            contains('File size too large.'),
          ),
        ),
      );
    });

    test('throws a friendly error on garbage or missing url', () {
      expect(() => parseUploadResponse('not json'), throwsA(anything));
      expect(() => parseUploadResponse('{}'), throwsA(anything));
    });
  });

  group('buildMultipartBody', () {
    test('contains the file, its filename and the unsigned preset', () {
      final (:body, :contentType) = buildMultipartBody(
        fileBytes: utf8.encode('fake-jpeg-bytes'),
        filename: 'car.jpg',
        boundary: 'test-boundary',
      );
      final text = utf8.decode(body, allowMalformed: true);
      expect(text, contains('name="file"; filename="car.jpg"'));
      expect(text, contains('Content-Type: image/jpeg'));
      expect(text, contains('fake-jpeg-bytes'));
      expect(text, contains('name="upload_preset"'));
      expect(text, contains('neighbormart_listings'));
      expect(text, contains('--test-boundary--'));
      expect(contentType, 'multipart/form-data; boundary=test-boundary');
    });
  });

  group('publish gating counts only uploaded Cloudinary photos', () {
    test('local paths never satisfy the vehicles minimum', () {
      final error = photoPublishError(ListingSection.vehicles, [
        '/tmp/a.jpg',
        '/tmp/b.jpg',
        '/tmp/c.jpg',
      ]);
      expect(error, isNotNull);
      expect(error, contains('at least 3 uploaded photos'));
    });

    test('foreign links do not count either', () {
      expect(
        photoPublishError(ListingSection.properties, [
          _cloud,
          _cloud,
          _foreign,
        ]),
        isNotNull,
      );
    });

    test('three done Cloudinary uploads satisfy vehicles + properties', () {
      final three = [_cloud, _cloudVersioned, _cloud];
      expect(photoPublishError(ListingSection.vehicles, three), isNull);
      expect(photoPublishError(ListingSection.properties, three), isNull);
    });

    test('items and arenas publish with no photos', () {
      expect(photoPublishError(ListingSection.items, const []), isNull);
      expect(photoPublishError(ListingSection.arenas, const []), isNull);
    });

    test('uploadedCloudinaryCount ignores everything else', () {
      expect(uploadedCloudinaryCount([_cloud, _foreign, '/tmp/x.jpg']), 1);
    });
  });

  group('ListingPhoto entries', () {
    test('uploadedUrlsOf returns only finished uploads, in order', () {
      final photos = [
        ListingPhoto.uploading('/tmp/a.jpg'),
        ListingPhoto.done(_cloud),
        ListingPhoto.failed('/tmp/b.jpg', 'boom'),
        ListingPhoto.done(_cloudVersioned, localPath: '/tmp/c.jpg'),
      ];
      expect(uploadedUrlsOf(photos), [_cloud, _cloudVersioned]);
      expect(photos[1].isDone, isTrue);
      expect(photos[3].displaySource, _cloudVersioned);
      expect(photos[0].displaySource, '/tmp/a.jpg');
    });
  });

  group('PhotoUploadField widget', () {
    testWidgets('done first photo shows the Cover badge; failed shows Retry', (
      tester,
    ) async {
      final photos = [
        ListingPhoto.done(_cloud),
        ListingPhoto.failed('/tmp/b.jpg', 'Upload failed — retry.'),
      ];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PhotoUploadField(
              section: ListingSection.vehicles,
              photos: photos,
              onChanged: (_) {},
            ),
          ),
        ),
      );
      expect(find.text('Cover'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(find.text('Upload failed — retry.'), findsOneWidget);
      expect(find.text('2/15'), findsOneWidget);
    });

    testWidgets('set-as-cover and delete emit reordered/shortened lists', (
      tester,
    ) async {
      var current = [
        ListingPhoto.done(_cloud),
        ListingPhoto.done(_cloudVersioned),
        ListingPhoto.done(_foreign),
      ];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                return PhotoUploadField(
                  section: ListingSection.items,
                  photos: current,
                  onChanged: (next) => setState(() => current = next),
                );
              },
            ),
          ),
        ),
      );

      // Make the third photo the cover.
      await tester.tap(find.byTooltip('Set as cover').last);
      await tester.pump();
      expect(current.first.remoteUrl, _foreign);

      // Delete the (new) first photo via its close button.
      await tester.tap(find.byIcon(Icons.close).first);
      await tester.pump();
      expect(current.length, 2);
      expect(current.first.remoteUrl, _cloud);
    });
  });
}
