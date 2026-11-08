import 'package:flutter_test/flutter_test.dart';
import 'package:neighbor_mart/core/utils/formatters.dart';
import 'package:neighbor_mart/core/utils/map_projection.dart';
import 'package:neighbor_mart/data/models/user.dart';

const bounds = MapBounds(width: 800, height: 600, padding: 40);

void main() {
  group('createProjection (ported from web mapProjection.test.ts)', () {
    test('places the center point inside the padded box', () {
      const center = LatLng(45.5, -122.65);
      final projection = createProjection(
        const [LatLng(45.52, -122.62), LatLng(45.47, -122.68)],
        center,
        bounds,
        null,
      );
      final p = projection.project(center);
      expect(p.x, greaterThanOrEqualTo(bounds.padding));
      expect(p.x, lessThanOrEqualTo(bounds.width - bounds.padding));
      expect(p.y, greaterThanOrEqualTo(bounds.padding));
      expect(p.y, lessThanOrEqualTo(bounds.height - bounds.padding));
    });

    test('center maps to the center of the box when it is the only point', () {
      const center = LatLng(45.5, -122.65);
      final projection = createProjection(const [], center, bounds, null);
      final p = projection.project(center);
      expect(p.x, closeTo(bounds.width / 2, 0.6));
      expect(p.y, closeTo(bounds.height / 2, 0.6));
    });

    test('puts north above south and west left of east', () {
      const north = LatLng(45.52, -122.65);
      const south = LatLng(45.48, -122.65);
      const west = LatLng(45.5, -122.69);
      const east = LatLng(45.5, -122.61);
      final projection = createProjection(
        const [north, south, west, east],
        null,
        bounds,
        null,
      );
      expect(
        projection.project(north).y,
        lessThan(projection.project(south).y),
      );
      expect(projection.project(west).x, lessThan(projection.project(east).x));
    });

    test(
      'keeps pin spacing proportional to real-world distance (uniform scale)',
      () {
        const a = LatLng(45.5, -122.65);
        const b = LatLng(45.51, -122.65); // ~1.1 km north
        const c = LatLng(45.52, -122.65); // ~2.2 km north
        final projection = createProjection(
          const [a, b, c],
          null,
          bounds,
          null,
        );
        final ab = projection.project(a).y - projection.project(b).y;
        final bc = projection.project(b).y - projection.project(c).y;
        expect(ab, greaterThan(0));
        expect((ab - bc).abs(), lessThan(0.5));
      },
    );

    test(
      'round-trips project -> unproject back to the original coordinate',
      () {
        const points = [LatLng(45.51, -122.64), LatLng(45.49, -122.66)];
        final projection = createProjection(
          points,
          const LatLng(45.5, -122.65),
          bounds,
          null,
        );
        for (final point in points) {
          final back = projection.unproject(projection.project(point));
          expect(back.lat, closeTo(point.lat, 1e-8));
          expect(back.lng, closeTo(point.lng, 1e-8));
        }
      },
    );

    test('scales the radius ring with the map so it matches real km', () {
      const a = LatLng(45.5, -122.65);
      const b = LatLng(45.52, -122.65);
      final projection = createProjection(const [a, b], null, bounds, 5);
      final pxPerKm =
          (projection.project(b).y - projection.project(a).y).abs() /
          distanceKm(a, b);
      expect(projection.radiusPx, isNotNull);
      expect(projection.radiusPx!, closeTo(5 * pxPerKm, 0.5));
    });

    test('radiusPx is null without a radius filter', () {
      final projection = createProjection(
        const [LatLng(45.5, -122.65)],
        null,
        bounds,
        null,
      );
      expect(projection.radiusPx, isNull);
    });

    test('handles an empty world gracefully', () {
      final projection = createProjection(const [], null, bounds, null);
      final p = projection.project(const LatLng(45.52, -122.65));
      expect(p.x.isFinite, isTrue);
      expect(p.y.isFinite, isTrue);
    });
  });
}
