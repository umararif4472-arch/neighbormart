import type { User, UserBadge } from '@/types'
import { localDateFromToday } from '@/utils/dates'

/**
 * Seed neighbors (Lahore). Stats and review counts are tuned so each
 * user's REAL calculated trust score (utils/trustScore.ts — the Phase 2
 * formula with the completed-deals factor) lands in the intended tier.
 * Nothing is hardcoded; the table below is recomputed from the live
 * formula and drifts by design as account ages grow:
 *
 *   Leo    → New Neighbor     (13)   1 late return, no verifications
 *   Nina   → Reliable         (33)
 *   Diego  → Reliable         (35)
 *   Sana   → Trusted          (53)
 *   Marcus → Trusted          (66)
 *   Priya  → Trusted          (74)   ← her OVERDUE drill return, marked late,
 *   Maya   → Trusted          (72)     drops her visibly; Maya's on-time
 *   Tom    → Community Pillar (79)     karaoke return lifts her past 75
 *   Joan   → Community Pillar (82)     = Community Pillar 🎉
 *
 * (Scores verified against the live formula on 2026-11-08.)
 */

const badge = (
  id: string,
  label: string,
  emoji: string,
  description: string,
  earnedDaysAgo: number,
): UserBadge => ({
  id,
  label,
  emoji,
  description,
  earnedAt: localDateFromToday(-earnedDaysAgo),
})

export function seedUsers(): User[] {
  return [
    {
      id: 'u-maya',
      name: 'Maya Chen',
      avatarUrl: 'https://picsum.photos/seed/bdb-maya/128/128',
      bio: 'Weekend woodworker, weekday cook. Happy to lend the drill if you return it with a story.',
      city: 'Lahore',
      neighborhood: 'DHA Phase 5',
      homeLocation: { lat: 31.4624, lng: 74.442 },
      joinedAt: '2025-05-01',
      phoneVerified: true,
      emailVerified: true,
      idVerified: true,
      responseRate: 0.87,
      avgResponseMinutes: 45,
      // Tuned for the tier-up demo: on-time 6/7 → 23 pts, reviews → 12,
      // deals 15 → 11, verified 10, responsiveness 13, age ~4 ≈ 73
      // (Trusted, just under Pillar). The on-time karaoke return lifts
      // on-time to 7/8 → 26 and deals to 16 → 12: she crosses 75 =
      // Community Pillar and the tier-up toast fires on the demo return.
      stats: {
        successfulLends: 8,
        successfulBorrows: 7,
        salesCompleted: 0,
        rentalsHosted: 0,
        onTimeReturns: 6,
        lateReturns: 1,
      },
      badges: [
        badge('b-first-lend', 'First Lend', '🎁', 'Lent their first item to a neighbor', 470),
        badge(
          'b-on-time-3',
          'Hat-Trick Returns',
          '⏰',
          'Three borrows returned by the due date',
          230,
        ),
      ],
    },
    {
      id: 'u-joan',
      name: 'Joan Whitfield',
      avatarUrl: 'https://picsum.photos/seed/bdb-joan/128/128',
      bio: 'Retired teacher. If it\u2019s in my garage, it\u2019s yours to borrow — just bring it back so the next neighbor can.',
      city: 'Lahore',
      neighborhood: 'Model Town',
      homeLocation: { lat: 31.483, lng: 74.322 },
      joinedAt: '2024-04-10',
      phoneVerified: true,
      emailVerified: true,
      idVerified: true,
      responseRate: 0.93,
      avgResponseMinutes: 20,
      stats: {
        successfulLends: 23,
        successfulBorrows: 9,
        salesCompleted: 3,
        rentalsHosted: 4,
        onTimeReturns: 9,
        lateReturns: 0,
      },
      badges: [
        badge(
          'b-favorite',
          'Neighborhood Favorite',
          '❤️',
          'Keeps getting 5-star reviews from borrowers',
          400,
        ),
        badge('b-lends-10', '10 Lends Club', '🏆', 'Ten successful lends and counting', 300),
        badge(
          'b-on-time-3',
          'Hat-Trick Returns',
          '⏰',
          'Three borrows returned by the due date',
          180,
        ),
      ],
    },
    {
      id: 'u-tom',
      name: 'Tom Alvarez',
      avatarUrl: 'https://picsum.photos/seed/bdb-tom/128/128',
      bio: 'The fix-it guy on the block. Tools are meant to be used, not dusted.',
      city: 'Lahore',
      neighborhood: 'Gulberg',
      homeLocation: { lat: 31.505, lng: 74.353 },
      joinedAt: '2024-07-22',
      phoneVerified: true,
      emailVerified: true,
      idVerified: true,
      responseRate: 0.9,
      avgResponseMinutes: 30,
      // 9/10 on-time — even the fix-it guy was late once.
      stats: {
        successfulLends: 19,
        successfulBorrows: 10,
        salesCompleted: 5,
        rentalsHosted: 6,
        onTimeReturns: 9,
        lateReturns: 1,
      },
      badges: [
        badge('b-lends-10', '10 Lends Club', '🏆', 'Ten successful lends and counting', 500),
        badge('b-verified', 'Verified Neighbor', '✅', 'Phone and email both verified', 500),
      ],
    },
    {
      id: 'u-priya',
      name: 'Priya Sharma',
      avatarUrl: 'https://picsum.photos/seed/bdb-priya/128/128',
      bio: 'Gardener, tennis regular, and firm believer that every block needs a shared ladder.',
      city: 'Lahore',
      neighborhood: 'Johar Town',
      homeLocation: { lat: 31.469, lng: 74.272 },
      joinedAt: '2024-10-15',
      phoneVerified: false,
      emailVerified: true,
      idVerified: false,
      responseRate: 0.8,
      avgResponseMinutes: 60,
      // 8/9 on-time → 27 pts (Trusted). Her OVERDUE drill return, marked
      // late, makes it 8/10 → 24 pts — the visible late-return demo.
      stats: {
        successfulLends: 9,
        successfulBorrows: 9,
        salesCompleted: 1,
        rentalsHosted: 2,
        onTimeReturns: 8,
        lateReturns: 1,
      },
      badges: [
        badge('b-first-lend', 'First Lend', '🎁', 'Lent their first item to a neighbor', 650),
        badge(
          'b-on-time-3',
          'Hat-Trick Returns',
          '⏰',
          'Three borrows returned by the due date',
          100,
        ),
      ],
    },
    {
      id: 'u-marcus',
      name: 'Marcus Webb',
      avatarUrl: 'https://picsum.photos/seed/bdb-marcus/128/128',
      bio: 'I own more camping gear than my garage can explain. Ask away.',
      city: 'Lahore',
      neighborhood: 'Bahria Town',
      homeLocation: { lat: 31.365, lng: 74.228 },
      joinedAt: '2025-04-10',
      phoneVerified: true,
      emailVerified: true,
      idVerified: true,
      responseRate: 0.8,
      avgResponseMinutes: 90,
      stats: {
        successfulLends: 12,
        successfulBorrows: 6,
        salesCompleted: 2,
        rentalsHosted: 3,
        onTimeReturns: 4,
        lateReturns: 2,
      },
      badges: [badge('b-lends-10', '10 Lends Club', '🏆', 'Ten successful lends and counting', 60)],
    },
    {
      id: 'u-sana',
      name: 'Sana Iqbal',
      avatarUrl: 'https://picsum.photos/seed/bdb-sana/128/128',
      bio: 'Canning season is a lifestyle. Jars included with the canner, obviously.',
      city: 'Lahore',
      neighborhood: 'Wapda Town',
      homeLocation: { lat: 31.452, lng: 74.286 },
      joinedAt: '2025-01-28',
      phoneVerified: false,
      emailVerified: true,
      idVerified: false,
      responseRate: 0.78,
      avgResponseMinutes: 120,
      stats: {
        successfulLends: 6,
        successfulBorrows: 5,
        salesCompleted: 1,
        rentalsHosted: 1,
        onTimeReturns: 4,
        lateReturns: 1,
      },
      badges: [
        badge('b-first-lend', 'First Lend', '🎁', 'Lent their first item to a neighbor', 560),
      ],
    },
    {
      id: 'u-diego',
      name: 'Diego Ramírez',
      avatarUrl: 'https://picsum.photos/seed/bdb-diego/128/128',
      bio: 'New-ish here. The snowboard collects dust eight months a year — it should be on the mountain.',
      city: 'Lahore',
      neighborhood: 'Cantt',
      homeLocation: { lat: 31.505, lng: 74.39 },
      joinedAt: '2025-08-30',
      phoneVerified: false,
      emailVerified: true,
      idVerified: false,
      responseRate: 0.75,
      avgResponseMinutes: 150,
      stats: {
        successfulLends: 2,
        successfulBorrows: 4,
        salesCompleted: 0,
        rentalsHosted: 1,
        onTimeReturns: 2,
        lateReturns: 2,
      },
      badges: [],
    },
    {
      id: 'u-nina',
      name: 'Nina Kowalski',
      avatarUrl: 'https://picsum.photos/seed/bdb-nina/128/128',
      bio: 'Party supplies central. If your backyard needs string lights, I\u2019ve got 300 feet of them.',
      city: 'Lahore',
      neighborhood: 'DHA Phase 1',
      homeLocation: { lat: 31.475, lng: 74.425 },
      joinedAt: '2025-11-15',
      phoneVerified: false,
      emailVerified: true,
      idVerified: false,
      responseRate: 0.72,
      avgResponseMinutes: 200,
      stats: {
        successfulLends: 5,
        successfulBorrows: 3,
        salesCompleted: 1,
        rentalsHosted: 2,
        onTimeReturns: 1,
        lateReturns: 2,
      },
      badges: [
        badge('b-first-lend', 'First Lend', '🎁', 'Lent their first item to a neighbor', 120),
      ],
    },
    {
      id: 'u-leo',
      name: 'Leo Park',
      avatarUrl: 'https://picsum.photos/seed/bdb-leo/128/128',
      bio: 'Just moved in. The projector is the only thing I\u2019ve unpacked so far.',
      city: 'Lahore',
      neighborhood: 'Gulshan-e-Ravi',
      homeLocation: { lat: 31.553, lng: 74.295 },
      joinedAt: '2026-07-25',
      phoneVerified: false,
      emailVerified: false,
      idVerified: false,
      responseRate: 0.5,
      avgResponseMinutes: 240,
      // One borrow so far — returned a day late. Everyone starts somewhere.
      stats: {
        successfulLends: 0,
        successfulBorrows: 1,
        salesCompleted: 0,
        rentalsHosted: 0,
        onTimeReturns: 0,
        lateReturns: 1,
      },
      badges: [],
    },
  ]
}
