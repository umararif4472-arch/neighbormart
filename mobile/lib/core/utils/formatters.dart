import 'dart:math' as math;

import '../../data/models/user.dart';

double distanceKm(LatLng a, LatLng b) {
  const earthKm = 6371.0;
  double rad(double d) => d * math.pi / 180.0;
  final dLat = rad(b.lat - a.lat);
  final dLng = rad(b.lng - a.lng);
  final h =
      math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(rad(a.lat)) *
          math.cos(rad(b.lat)) *
          math.sin(dLng / 2) *
          math.sin(dLng / 2);
  return earthKm * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
}

String distanceLabel(double km) {
  if (km < 0.1) return 'Very close';
  if (km < 1) return '${(km * 1000).round()} m away';
  return '${km.toStringAsFixed(1)} km away';
}

/// 'Rs 6,850,000' — mirrors web formatMoney (en-PK grouping, no decimals).
String formatRs(num amount) {
  final rounded = amount.round();
  final digits = rounded.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
    buf.write(digits[i]);
  }
  return 'Rs ${rounded < 0 ? '-' : ''}$buf';
}

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

int dueInDays(DateTime due, [DateTime? now]) {
  final today = dateOnly(now ?? DateTime.now());
  return dateOnly(due).difference(today).inDays;
}

String dueLabel(DateTime due, [DateTime? now]) {
  final days = dueInDays(due, now);
  if (days < 0) {
    final n = days.abs();
    return 'Overdue by $n ${n == 1 ? 'day' : 'days'}';
  }
  if (days == 0) return 'Due today';
  if (days == 1) return 'Due tomorrow';
  return 'Due in $days days';
}

String shortDate(DateTime d) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${months[d.month - 1]} ${d.day}';
}

String dateRangeLabel(DateTime start, DateTime end) {
  final s = shortDate(start);
  final e = shortDate(end);
  return s == e ? s : '$s – $e';
}

String moneyLabel(int? amount, {String freeLabel = 'Free'}) {
  if (amount == null || amount == 0) return freeLabel;
  return '\$$amount';
}
