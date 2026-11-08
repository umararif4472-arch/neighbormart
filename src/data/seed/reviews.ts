import type { Review } from '@/types'
import { isoHoursAgo } from '@/utils/dates'

/**
 * Seeded reviews. Every review ties to a real seeded request, and the
 * per-user counts/averages are tuned so REAL trust scores (computed by
 * utils/trustScore.ts at runtime) land where the demo needs them:
 *
 *   Maya 5@4.8  → 24 pts (score 74 — 2 from Community Pillar; the on-time
 *                  karaoke return + a 5th review complete the tier-up demo)
 *   Priya 4@4.75 → 19 pts (score 73 → drops to ~63 when her overdue drill
 *                  return is marked late: 40→30 on-time points)
 *   Tom 3@5, Joan 3@5, Marcus 3@4.67, Sana 3@4.33, Diego 2@4.5, Nina 2@5,
 *   Leo 1@5
 *
 * h19/h20 back the one-sided review sub-states; h21/h22 are Maya's extra
 * fully-reviewed pairs (they carry the two 5-star reviews about her).
 */

interface ReviewSeed {
  id: string
  requestId: string
  listingId: string
  reviewerId: string
  revieweeId: string
  reviewerRole: Review['reviewerRole']
  rating: number
  comment: string
  /** Hours ago the review was left. */
  hoursAgo: number
}

const SEEDS: ReviewSeed[] = [
  // --- Reviews about Tom (lender) ---
  {
    id: 'rev-1',
    requestId: 'req-h1',
    listingId: 'i-drone',
    reviewerId: 'u-marcus',
    revieweeId: 'u-tom',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 39,
    comment:
      'Tom spent ten minutes walking me through the controls. The drone came back with a story, and I came back with footage.',
  },
  {
    id: 'rev-2',
    requestId: 'req-h2',
    listingId: 'i-kayak',
    reviewerId: 'u-priya',
    revieweeId: 'u-tom',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 64,
    comment:
      'Straps, cart, paddle, and tips for the best launch spot. This is exactly how lending should work.',
  },
  {
    id: 'rev-3',
    requestId: 'req-h3',
    listingId: 'i-washer',
    reviewerId: 'u-nina',
    revieweeId: 'u-tom',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 29,
    comment: 'Sparkling patio, zero hassle. Tom is the guy to know on this street.',
  },
  // --- Reviews about Joan (lender) ---
  {
    id: 'rev-4',
    requestId: 'req-h4',
    listingId: 'i-karaoke',
    reviewerId: 'u-priya',
    revieweeId: 'u-joan',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 89,
    comment:
      'Three hours of ABBA. The echo dial was a hit with the kids, and Joan even helped carry it to the car.',
  },
  {
    id: 'rev-5',
    requestId: 'req-h5',
    listingId: 'i-sewing',
    reviewerId: 'u-marcus',
    revieweeId: 'u-joan',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 119,
    comment: 'Patched a tent, hemmed curtains, felt like a wizard. That machine is a tank.',
  },
  {
    id: 'rev-6',
    requestId: 'req-h6',
    listingId: 'i-karaoke',
    reviewerId: 'u-sana',
    revieweeId: 'u-joan',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 199,
    comment: 'Our harvest party will be talking about that karaoke night for years.',
  },
  // --- Reviews about Priya (lender) ---
  {
    id: 'rev-7',
    requestId: 'req-h7',
    listingId: 'i-tennis',
    reviewerId: 'u-joan',
    revieweeId: 'u-priya',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 49,
    comment: 'Rackets were re-gripped and ready. Priya even included court-time tips.',
  },
  {
    id: 'rev-8',
    requestId: 'req-h8',
    listingId: 'i-carpet',
    reviewerId: 'u-tom',
    revieweeId: 'u-priya',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 74,
    comment: 'Saved my dining room rug after a very unfortunate stew incident.',
  },
  {
    id: 'rev-9',
    requestId: 'req-h9',
    listingId: 'i-tennis',
    reviewerId: 'u-marcus',
    revieweeId: 'u-priya',
    reviewerRole: 'borrower',
    rating: 4,
    hoursAgo: 24 * 149,
    comment: 'Great rackets — just wish I\u2019d booked a longer slot.',
  },
  {
    id: 'rev-10',
    requestId: 'req-h9',
    listingId: 'i-tennis',
    reviewerId: 'u-priya',
    revieweeId: 'u-marcus',
    reviewerRole: 'lender',
    rating: 5,
    hoursAgo: 24 * 149,
    comment: 'Marcus treats gear like his own — rackets came back Sunday evening, grips clean.',
  },
  // --- Reviews about Marcus (lender) ---
  {
    id: 'rev-11',
    requestId: 'req-h10',
    listingId: 'i-tent',
    reviewerId: 'u-leo',
    revieweeId: 'u-marcus',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 19,
    comment:
      'My first camping trip as a local. Tent was dry and the instructions were taped inside. Legend.',
  },
  {
    id: 'rev-12',
    requestId: 'req-h11',
    listingId: 'i-tent',
    reviewerId: 'u-joan',
    revieweeId: 'u-marcus',
    reviewerRole: 'borrower',
    rating: 4,
    hoursAgo: 24 * 159,
    comment: 'The grandkids loved it. I even got the poles back in the bag on the first try.',
  },
  {
    id: 'rev-13',
    requestId: 'req-h12',
    listingId: 'i-saw',
    reviewerId: 'u-diego',
    revieweeId: 'u-marcus',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 99,
    comment:
      'The saw sliced through everything. I picked it up at an odd hour and Marcus didn\u2019t mind at all.',
  },
  // --- Reviews about Sana (lender) ---
  {
    id: 'rev-14',
    requestId: 'req-h13',
    listingId: 'i-cider',
    reviewerId: 'u-priya',
    revieweeId: 'u-sana',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 249,
    comment: 'Pressed five gallons of cider with my nieces. Sana\u2019s recipe card is gold.',
  },
  {
    id: 'rev-15',
    requestId: 'req-h14',
    listingId: 'i-canner',
    reviewerId: 'u-marcus',
    revieweeId: 'u-sana',
    reviewerRole: 'borrower',
    rating: 4,
    hoursAgo: 24 * 179,
    comment: 'Canned forty pounds of tomatoes. Everything came labeled and ready.',
  },
  {
    id: 'rev-16',
    requestId: 'req-h15',
    listingId: 'i-cider',
    reviewerId: 'u-joan',
    revieweeId: 'u-sana',
    reviewerRole: 'borrower',
    rating: 4,
    hoursAgo: 24 * 319,
    comment: 'Sana delivered it herself and stayed for a glass. This is what neighbors are for.',
  },
  // --- Reviews about Diego (lender) ---
  {
    id: 'rev-17',
    requestId: 'req-h16',
    listingId: 'i-snowboard',
    reviewerId: 'u-priya',
    revieweeId: 'u-diego',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 209,
    comment:
      'The board was freshly waxed. Diego answered every beginner question without laughing (much).',
  },
  {
    id: 'rev-18',
    requestId: 'req-h17',
    listingId: 'i-snowboard',
    reviewerId: 'u-joan',
    revieweeId: 'u-diego',
    reviewerRole: 'borrower',
    rating: 4,
    hoursAgo: 24 * 239,
    comment:
      'Board in great shape. The pickup instructions were a little mysterious, but we found each other.',
  },
  // --- Reviews about Nina (lender) ---
  {
    id: 'rev-19',
    requestId: 'req-h18',
    listingId: 'i-lights',
    reviewerId: 'u-priya',
    revieweeId: 'u-nina',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 54,
    comment: 'Three hundred feet of magic for our garden party. Nina helped set up the stands.',
  },
  {
    id: 'rev-20',
    requestId: 'req-h18',
    listingId: 'i-lights',
    reviewerId: 'u-nina',
    revieweeId: 'u-priya',
    reviewerRole: 'lender',
    rating: 5,
    hoursAgo: 24 * 54,
    comment: 'Priya\u2019s garden looked like a wedding. Lights came back coiled — respect.',
  },
  // --- Reviews about Leo (lender) ---
  {
    id: 'rev-21',
    requestId: 'req-h19',
    listingId: 'i-projector',
    reviewerId: 'u-maya',
    revieweeId: 'u-leo',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 14,
    comment:
      'Leo is a new neighbor and already the best — the projector came with a spare HDMI cable and popcorn advice.',
  },
  // --- Reviews about Maya: 5 total @ avg 4.8 (24 pts → score 74) ---
  {
    id: 'rev-22',
    requestId: 'req-h20',
    listingId: 'i-drill',
    reviewerId: 'u-leo',
    revieweeId: 'u-maya',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 24,
    comment: 'Maya taped a cheat-sheet of which bit does what. I built a whole bookshelf.',
  },
  {
    id: 'rev-23',
    requestId: 'req-done-washer',
    listingId: 'i-washer',
    reviewerId: 'u-tom',
    revieweeId: 'u-maya',
    reviewerRole: 'lender',
    rating: 5,
    hoursAgo: 24 * 7,
    comment: 'The patio is moss-free and the washer came back cleaner than I lend it. A+.',
  },
  {
    id: 'rev-24',
    requestId: 'req-done-mixer',
    listingId: 'i-mixer',
    reviewerId: 'u-nina',
    revieweeId: 'u-maya',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 18,
    comment:
      'Cake layers achieved! The mixer came back spotless — and there were cookies. COOKIES.',
  },
  {
    id: 'rev-25',
    requestId: 'req-h21',
    listingId: 'i-pasta',
    reviewerId: 'u-priya',
    revieweeId: 'u-maya',
    reviewerRole: 'borrower',
    rating: 4,
    hoursAgo: 24 * 129,
    comment:
      'Great machine, clear instructions. I forgot the clamp on the porch — Maya was very kind about it.',
  },
  {
    id: 'rev-26',
    requestId: 'req-h21',
    listingId: 'i-pasta',
    reviewerId: 'u-maya',
    revieweeId: 'u-priya',
    reviewerRole: 'lender',
    rating: 5,
    hoursAgo: 24 * 129,
    comment:
      'Priya returned it floured, cleaned, AND with a jar of her chutney. Immediate re-lend.',
  },
  {
    id: 'rev-27',
    requestId: 'req-h22',
    listingId: 'i-mixer',
    reviewerId: 'u-sana',
    revieweeId: 'u-maya',
    reviewerRole: 'borrower',
    rating: 5,
    hoursAgo: 24 * 104,
    comment:
      'Six dozen cookies, zero mixer complaints. Maya even shared the butter-softening trick.',
  },
  {
    id: 'rev-28',
    requestId: 'req-h22',
    listingId: 'i-mixer',
    reviewerId: 'u-maya',
    revieweeId: 'u-sana',
    reviewerRole: 'lender',
    rating: 5,
    hoursAgo: 24 * 104,
    comment:
      'Sana is the bake-sale MVP. The mixer came back smelling like vanilla — in a good way.',
  },
  // Maya's side of the mixer borrow (reviewed Nina) — completes that pair.
  {
    id: 'rev-29',
    requestId: 'req-done-mixer',
    listingId: 'i-mixer',
    reviewerId: 'u-maya',
    revieweeId: 'u-nina',
    reviewerRole: 'lender',
    rating: 5,
    hoursAgo: 24 * 18,
    comment: 'Nina returned it with a thank-you note. Lend to her immediately.',
  },
]

export function seedReviews(): Review[] {
  return SEEDS.map((seed) => ({
    id: seed.id,
    requestId: seed.requestId,
    listingId: seed.listingId,
    reviewerId: seed.reviewerId,
    revieweeId: seed.revieweeId,
    reviewerRole: seed.reviewerRole,
    rating: seed.rating,
    comment: seed.comment,
    createdAt: isoHoursAgo(seed.hoursAgo),
  }))
}
