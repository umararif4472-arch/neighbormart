import type { BorrowRequest } from '@/types'
import { isoHoursAgo, localDateFromToday } from '@/utils/dates'

/**
 * Seeded borrow requests — built with RELATIVE dates so every lifecycle
 * state is alive on any given day:
 *
 *   pending (incoming ×2, overlapping!)  → conflict demo on the pasta roller
 *   pending (outgoing)                  → Maya waiting on Tom's kayak
 *   active, due tomorrow                → due-soon demo (Maya borrowing karaoke)
 *   active, OVERDUE (due 5 days ago)    → escalation demo (Priya has Maya's drill)
 *   returned, one review in            → pending-review sub-state demo (washer)
 *   reviewed (both reviewed)           → terminal state demo (mixer)
 *   declined                            → terminal state demo
 *
 * "Historical" completed borrows back the seeded reviews; stats reflect
 * even more borrows beyond what's materialized here.
 */

interface RequestSeed {
  id: string
  listingId: string
  borrowerId: string
  /** Whole-day period offsets from today: [start, end]. */
  period: [number, number]
  note: string
  status: BorrowRequest['status']
  /** Hours ago the request was created. */
  createdHoursAgo: number
  /** Hours ago the lender responded (null while pending). */
  respondedHoursAgo?: number
  /** Hours ago the item was returned (returned/reviewed only). */
  returnedHoursAgo?: number
}

const LIVE: RequestSeed[] = [
  {
    // Incoming, pending: Diego wants Maya's pasta roller.
    id: 'req-in-pasta-diego',
    listingId: 'i-pasta',
    borrowerId: 'u-diego',
    period: [2, 4],
    note: 'Making ravioli for my daughter\u2019s birthday — I\u2019ll return it scrubbed and fed (the machine, not me).',
    status: 'pending',
    createdHoursAgo: 6,
  },
  {
    // Incoming, pending: Nina wants the SAME pasta roller for OVERLAPPING
    // days — the dashboard surfaces this conflict before Maya approves both.
    id: 'req-in-pasta-nina',
    listingId: 'i-pasta',
    borrowerId: 'u-nina',
    period: [3, 5],
    note: 'Fresh fettuccine for a dinner party — I\u2019ll bring the roller back sparkling.',
    status: 'pending',
    createdHoursAgo: 2,
  },
  {
    // Outgoing, pending: Maya wants Tom's kayak.
    id: 'req-out-kayak',
    listingId: 'i-kayak',
    borrowerId: 'u-maya',
    period: [3, 5],
    note: 'First flatwater paddle of the season — I\u2019ll bring snacks for the car ride.',
    status: 'pending',
    createdHoursAgo: 24,
  },
  {
    // Outgoing, active: Maya is mid-borrow on Joan's karaoke machine, due
    // tomorrow — the due-soon demo. Returning it on time levels Maya up to
    // Community Pillar (her trust score sits 2 points below the threshold).
    id: 'req-active-karaoke',
    listingId: 'i-karaoke',
    borrowerId: 'u-maya',
    period: [-2, 1],
    note: 'Block-party warm-up at our place — you\u2019re invited, obviously.',
    status: 'active',
    createdHoursAgo: 24 * 4,
    respondedHoursAgo: 24 * 3,
  },
  {
    // Incoming, active and OVERDUE: Priya has had Maya's drill for five
    // extra days — the escalation demo (contact / report an issue).
    id: 'req-overdue-drill',
    listingId: 'i-drill',
    borrowerId: 'u-priya',
    period: [-8, -5],
    note: 'Hanging shelves — this\u2019ll take a weekend, tops. (Famous last words.)',
    status: 'active',
    createdHoursAgo: 24 * 10,
    respondedHoursAgo: 24 * 9,
  },
  {
    // Outgoing, returned: Maya borrowed Tom's washer. Tom reviewed her; she
    // hasn't reviewed yet → the "pending review" sub-state with a CTA.
    id: 'req-done-washer',
    listingId: 'i-washer',
    borrowerId: 'u-maya',
    period: [-9, -7],
    note: 'The patio has gone full moss. I\u2019ll return it rinsed.',
    status: 'returned',
    createdHoursAgo: 24 * 11,
    respondedHoursAgo: 24 * 10,
    returnedHoursAgo: 24 * 7,
  },
  {
    // Incoming, reviewed: Nina borrowed Maya's mixer — both sides reviewed,
    // fully terminal. Also the "you got a review" derived notification.
    id: 'req-done-mixer',
    listingId: 'i-mixer',
    borrowerId: 'u-nina',
    period: [-20, -18],
    note: 'Birthday cake layers — three of them. Wish me luck.',
    status: 'reviewed',
    createdHoursAgo: 24 * 22,
    respondedHoursAgo: 24 * 21,
    returnedHoursAgo: 24 * 18,
  },
  {
    // Incoming, declined: Sana asked about the mixer during a busy weekend.
    id: 'req-declined-mixer',
    listingId: 'i-mixer',
    borrowerId: 'u-sana',
    period: [-15, -13],
    note: 'Cookie marathon for the school bake sale!',
    status: 'declined',
    createdHoursAgo: 24 * 17,
    respondedHoursAgo: 24 * 16,
  },
]

/**
 * Historical borrows backing the seeded reviews. Each entry is
 * [id, listingId, borrowerId, createdHoursAgo, status].
 *
 *   - h19/h20 involve Maya: h19 is reviewed by Maya only (Leo still owes
 *     one → visible "waiting" state), h20 is reviewed by Leo only (Maya
 *     still owes one → pending-review CTA in her Lending tab).
 *   - h21/h22 are fully reviewed (both sides) — they add the two extra
 *     5-star reviews about Maya that put her 2 points from Community Pillar.
 *   - The rest have exactly one review each and belong to other neighbors.
 */
const HISTORICAL: Array<[string, string, string, number, BorrowRequest['status']]> = [
  ['req-h1', 'i-drone', 'u-marcus', 24 * 40, 'returned'], // Marcus → Tom's drone
  ['req-h2', 'i-kayak', 'u-priya', 24 * 65, 'returned'], // Priya → Tom's kayak
  ['req-h3', 'i-washer', 'u-nina', 24 * 30, 'returned'], // Nina → Tom's washer
  ['req-h4', 'i-karaoke', 'u-priya', 24 * 90, 'returned'], // Priya → Joan's karaoke
  ['req-h5', 'i-sewing', 'u-marcus', 24 * 120, 'returned'], // Marcus → Joan's sewing
  ['req-h6', 'i-karaoke', 'u-sana', 24 * 200, 'returned'], // Sana → Joan's karaoke
  ['req-h7', 'i-tennis', 'u-joan', 24 * 50, 'returned'], // Joan → Priya's tennis
  ['req-h8', 'i-carpet', 'u-tom', 24 * 75, 'returned'], // Tom → Priya's carpet cleaner
  ['req-h9', 'i-tennis', 'u-marcus', 24 * 150, 'returned'], // Marcus → Priya's tennis
  ['req-h10', 'i-tent', 'u-leo', 24 * 20, 'returned'], // Leo → Marcus's tent
  ['req-h11', 'i-tent', 'u-joan', 24 * 160, 'returned'], // Joan → Marcus's tent
  ['req-h12', 'i-saw', 'u-diego', 24 * 100, 'returned'], // Diego → Marcus's saw
  ['req-h13', 'i-cider', 'u-priya', 24 * 250, 'returned'], // Priya → Sana's cider press
  ['req-h14', 'i-canner', 'u-marcus', 24 * 180, 'returned'], // Marcus → Sana's canner
  ['req-h15', 'i-cider', 'u-joan', 24 * 320, 'returned'], // Joan → Sana's cider press
  ['req-h16', 'i-snowboard', 'u-priya', 24 * 210, 'returned'], // Priya → Diego's snowboard
  ['req-h17', 'i-snowboard', 'u-joan', 24 * 240, 'returned'], // Joan → Diego's snowboard
  ['req-h18', 'i-lights', 'u-priya', 24 * 55, 'returned'], // Priya → Nina's lights
  ['req-h19', 'i-projector', 'u-maya', 24 * 15, 'returned'], // Maya → Leo's projector (Maya reviewed; Leo owes)
  ['req-h20', 'i-drill', 'u-leo', 24 * 25, 'returned'], // Leo → Maya's drill (Leo reviewed; Maya owes)
  ['req-h21', 'i-pasta', 'u-priya', 24 * 130, 'reviewed'], // Priya → Maya's pasta roller (both reviewed)
  ['req-h22', 'i-mixer', 'u-sana', 24 * 105, 'reviewed'], // Sana → Maya's mixer (both reviewed)
]

export function seedRequests(): BorrowRequest[] {
  const live: BorrowRequest[] = LIVE.map((seed) => ({
    id: seed.id,
    listingId: seed.listingId,
    borrowerId: seed.borrowerId,
    period: { start: localDateFromToday(seed.period[0]), end: localDateFromToday(seed.period[1]) },
    note: seed.note,
    status: seed.status,
    createdAt: isoHoursAgo(seed.createdHoursAgo),
    respondedAt: seed.respondedHoursAgo != null ? isoHoursAgo(seed.respondedHoursAgo) : null,
    dueAt:
      seed.status === 'active' || seed.status === 'returned' || seed.status === 'reviewed'
        ? localDateFromToday(seed.period[1])
        : null,
    returnedAt: seed.returnedHoursAgo != null ? isoHoursAgo(seed.returnedHoursAgo) : null,
    issue: null,
  }))

  const historical: BorrowRequest[] = HISTORICAL.map(
    ([id, listingId, borrowerId, createdHoursAgo, status]) => {
      // Derive a plausible 2–4 day borrow window ending well before today.
      const endOffset = -Math.ceil(createdHoursAgo / 24) + 3
      const startOffset = endOffset - 2
      return {
        id,
        listingId,
        borrowerId,
        period: { start: localDateFromToday(startOffset), end: localDateFromToday(endOffset) },
        note: '',
        status,
        createdAt: isoHoursAgo(createdHoursAgo + 72),
        respondedAt: isoHoursAgo(createdHoursAgo + 48),
        dueAt: localDateFromToday(endOffset),
        returnedAt: isoHoursAgo(createdHoursAgo),
        issue: null,
      }
    },
  )

  return [...live, ...historical]
}
