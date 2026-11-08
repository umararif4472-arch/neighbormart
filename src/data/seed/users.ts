import type { User, UserBadge } from '@/types'
import { localDateFromToday } from '@/utils/dates'

/**
 * Seed neighbors. Stats and review counts are tuned so each user's REAL
 * calculated trust score (utils/trustScore.ts — rate × volume formula)
 * lands in the intended tier. Nothing is hardcoded:
 *
 *   Leo    → New Neighbor     (12)  1 late return, no verifications
 *   Nina   → Reliable         (38)
 *   Diego  → Reliable         (46)
 *   Sana   → Trusted          (59)
 *   Marcus → Trusted          (63)
 *   Priya  → Trusted          (73)  ← her OVERDUE drill return, marked late,
 *   Maya   → Trusted          (74)     drops her to 63; Maya's on-time
 *   Tom    → Community Pillar (78)     karaoke return lifts her to 75
 *   Joan   → Community Pillar (82)     = Community Pillar 🎉
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
      neighborhood: 'Richmond',
      homeLocation: { lat: 45.5, lng: -122.63 },
      joinedAt: '2025-05-01',
      phoneVerified: true,
      emailVerified: true,
      responseRate: 0.87,
      avgResponseMinutes: 45,
      // Live-formula math: on-time 6/7 → 30 pts, reviews 5@4.8 → 12,
      // verified 10, age 7, responsiveness 13 = 72 (Trusted, 3 from Pillar).
      // The on-time karaoke return makes it 7/8 → 35 pts = 77 = Community
      // Pillar — the tier-up toast fires exactly on the demo return.
      stats: { successfulLends: 8, successfulBorrows: 9, onTimeReturns: 6, lateReturns: 1 },
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
      neighborhood: 'Sellwood',
      homeLocation: { lat: 45.479, lng: -122.656 },
      joinedAt: '2024-04-10',
      phoneVerified: true,
      emailVerified: true,
      responseRate: 0.93,
      avgResponseMinutes: 20,
      stats: { successfulLends: 23, successfulBorrows: 9, onTimeReturns: 9, lateReturns: 0 },
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
      neighborhood: 'Mt. Tabor',
      homeLocation: { lat: 45.511, lng: -122.653 },
      joinedAt: '2024-07-22',
      phoneVerified: true,
      emailVerified: true,
      responseRate: 0.9,
      avgResponseMinutes: 30,
      // 9/10 on-time — even the fix-it guy was late once.
      stats: { successfulLends: 19, successfulBorrows: 10, onTimeReturns: 9, lateReturns: 1 },
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
      neighborhood: 'Laurelhurst',
      homeLocation: { lat: 45.528, lng: -122.619 },
      joinedAt: '2024-10-15',
      phoneVerified: false,
      emailVerified: true,
      responseRate: 0.8,
      avgResponseMinutes: 60,
      // 8/9 on-time → 36 pts (Trusted). Her OVERDUE drill return, marked
      // late, drops this to 8/10 → 32 pts — the visible late-return demo.
      stats: { successfulLends: 9, successfulBorrows: 9, onTimeReturns: 8, lateReturns: 1 },
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
      neighborhood: 'Kerns',
      homeLocation: { lat: 45.518, lng: -122.652 },
      joinedAt: '2025-04-10',
      phoneVerified: true,
      emailVerified: true,
      responseRate: 0.8,
      avgResponseMinutes: 90,
      stats: { successfulLends: 12, successfulBorrows: 6, onTimeReturns: 4, lateReturns: 2 },
      badges: [badge('b-lends-10', '10 Lends Club', '🏆', 'Ten successful lends and counting', 60)],
    },
    {
      id: 'u-sana',
      name: 'Sana Iqbal',
      avatarUrl: 'https://picsum.photos/seed/bdb-sana/128/128',
      bio: 'Canning season is a lifestyle. Jars included with the canner, obviously.',
      neighborhood: 'Woodstock',
      homeLocation: { lat: 45.478, lng: -122.629 },
      joinedAt: '2025-01-28',
      phoneVerified: false,
      emailVerified: true,
      responseRate: 0.78,
      avgResponseMinutes: 120,
      stats: { successfulLends: 6, successfulBorrows: 5, onTimeReturns: 4, lateReturns: 1 },
      badges: [
        badge('b-first-lend', 'First Lend', '🎁', 'Lent their first item to a neighbor', 560),
      ],
    },
    {
      id: 'u-diego',
      name: 'Diego Ramírez',
      avatarUrl: 'https://picsum.photos/seed/bdb-diego/128/128',
      bio: 'New-ish here. The snowboard collects dust eight months a year — it should be on the mountain.',
      neighborhood: 'Alberta Arts',
      homeLocation: { lat: 45.559, lng: -122.648 },
      joinedAt: '2025-08-30',
      phoneVerified: false,
      emailVerified: true,
      responseRate: 0.75,
      avgResponseMinutes: 150,
      stats: { successfulLends: 2, successfulBorrows: 4, onTimeReturns: 2, lateReturns: 2 },
      badges: [],
    },
    {
      id: 'u-nina',
      name: 'Nina Kowalski',
      avatarUrl: 'https://picsum.photos/seed/bdb-nina/128/128',
      bio: 'Party supplies central. If your backyard needs string lights, I\u2019ve got 300 feet of them.',
      neighborhood: 'Buckman',
      homeLocation: { lat: 45.517, lng: -122.649 },
      joinedAt: '2025-11-15',
      phoneVerified: false,
      emailVerified: true,
      responseRate: 0.72,
      avgResponseMinutes: 200,
      stats: { successfulLends: 5, successfulBorrows: 3, onTimeReturns: 1, lateReturns: 2 },
      badges: [
        badge('b-first-lend', 'First Lend', '🎁', 'Lent their first item to a neighbor', 120),
      ],
    },
    {
      id: 'u-leo',
      name: 'Leo Park',
      avatarUrl: 'https://picsum.photos/seed/bdb-leo/128/128',
      bio: 'Just moved in. The projector is the only thing I\u2019ve unpacked so far.',
      neighborhood: 'Irvington',
      homeLocation: { lat: 45.534, lng: -122.651 },
      joinedAt: '2026-07-25',
      phoneVerified: false,
      emailVerified: false,
      responseRate: 0.5,
      avgResponseMinutes: 240,
      // One borrow so far — returned a day late. Everyone starts somewhere.
      stats: { successfulLends: 0, successfulBorrows: 1, onTimeReturns: 0, lateReturns: 1 },
      badges: [],
    },
  ]
}
