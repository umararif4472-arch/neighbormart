class LatLng {
  final double lat;
  final double lng;
  const LatLng(this.lat, this.lng);
}

class UserStats {
  final int successfulLends;
  final int successfulBorrows;
  final int onTimeReturns;
  final int lateReturns;

  /// Deals completed as the seller (Phase 2 trust extension).
  final int salesCompleted;

  /// Deals completed as the owner of a rented listing.
  final int rentalsHosted;
  const UserStats({
    required this.successfulLends,
    required this.successfulBorrows,
    required this.onTimeReturns,
    required this.lateReturns,
    this.salesCompleted = 0,
    this.rentalsHosted = 0,
  });
  UserStats copyWith({
    int? successfulLends,
    int? successfulBorrows,
    int? onTimeReturns,
    int? lateReturns,
    int? salesCompleted,
    int? rentalsHosted,
  }) {
    return UserStats(
      successfulLends: successfulLends ?? this.successfulLends,
      successfulBorrows: successfulBorrows ?? this.successfulBorrows,
      onTimeReturns: onTimeReturns ?? this.onTimeReturns,
      lateReturns: lateReturns ?? this.lateReturns,
      salesCompleted: salesCompleted ?? this.salesCompleted,
      rentalsHosted: rentalsHosted ?? this.rentalsHosted,
    );
  }

  /// Deals finished in ANY role — feeds the trust score's deals factor.
  int get completedDeals =>
      successfulLends + successfulBorrows + salesCompleted + rentalsHosted;
}

class UserBadge {
  final String id;
  final String label;
  final String description;
  final DateTime earnedAt;
  const UserBadge({
    required this.id,
    required this.label,
    required this.description,
    required this.earnedAt,
  });
}

class AppUser {
  final String id;
  final String name;
  final String email;
  final String password;
  final String bio;

  /// Contact number collected in profile setup (Phase 6). Empty until
  /// the user adds one — the app never invents a number for them.
  final String phone;

  /// City the user is based in (listings inherit it on publish).
  final String city;
  final String neighborhood;

  /// Phase 6 profile setup: false only for brand-new accounts, which
  /// are routed through the 3-step setup right after first login.
  /// Every seeded/demo user defaults to true so they are never prompted.
  final bool onboardingCompleted;

  /// Marketplace interests picked in profile setup (Step 3).
  final List<String> interests;

  /// Neighbors this user has blocked (Phase 8). Their listings are
  /// hidden from this user's Explore and section lists.
  final List<String> blockedUserIds;
  final LatLng homeLocation;
  final DateTime joinedAt;
  final bool phoneVerified;
  final bool emailVerified;

  /// Government/CNIC-style ID check — strongest verification signal.
  final bool idVerified;
  final double responseRate;
  final int avgResponseMinutes;
  final UserStats stats;
  final List<UserBadge> badges;
  const AppUser({
    required this.id,
    required this.name,
    this.email = '',
    this.password = '',
    required this.bio,
    this.phone = '',
    this.city = '',
    this.onboardingCompleted = true,
    this.interests = const [],
    this.blockedUserIds = const [],
    required this.neighborhood,
    required this.homeLocation,
    required this.joinedAt,
    required this.phoneVerified,
    required this.emailVerified,
    this.idVerified = false,
    required this.responseRate,
    required this.avgResponseMinutes,
    required this.stats,
    required this.badges,
  });
  AppUser copyWith({
    UserStats? stats,
    String? name,
    String? email,
    String? bio,
    String? phone,
    String? city,
    String? neighborhood,
    LatLng? homeLocation,
    bool? phoneVerified,
    bool? emailVerified,
    bool? idVerified,
    bool? onboardingCompleted,
    List<String>? interests,
    List<String>? blockedUserIds,
  }) {
    return AppUser(
      id: id,
      name: name ?? this.name,
      email: email ?? this.email,
      password: password,
      bio: bio ?? this.bio,
      phone: phone ?? this.phone,
      city: city ?? this.city,
      onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
      interests: interests ?? this.interests,
      blockedUserIds: blockedUserIds ?? this.blockedUserIds,
      neighborhood: neighborhood ?? this.neighborhood,
      homeLocation: homeLocation ?? this.homeLocation,
      joinedAt: joinedAt,
      phoneVerified: phoneVerified ?? this.phoneVerified,
      emailVerified: emailVerified ?? this.emailVerified,
      idVerified: idVerified ?? this.idVerified,
      responseRate: responseRate,
      avgResponseMinutes: avgResponseMinutes,
      stats: stats ?? this.stats,
      badges: badges,
    );
  }

  /// True when this user still has to finish the Phase 6 profile
  /// setup (new accounts only — seeds default to completed).
  bool get needsOnboarding => !onboardingCompleted;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class Review {
  final String id;
  final String requestId;
  final String itemId;
  final String reviewerId;
  final String revieweeId;
  final String reviewerRole; // lender | borrower
  final int rating;
  final String comment;
  final DateTime createdAt;
  const Review({
    required this.id,
    required this.requestId,
    required this.itemId,
    required this.reviewerId,
    required this.revieweeId,
    required this.reviewerRole,
    required this.rating,
    required this.comment,
    required this.createdAt,
  });
}
