import type { Item, User } from '@/types'
import { localDateFromToday } from '@/utils/dates'

/**
 * 19 seed items spanning every category. Photos use seeded picsum URLs
 * (stable, no API key). One item deliberately has zero photos and one is
 * "unavailable" so their graceful UI states are visible out of the box.
 *
 * The mock neighborhood is Portland-ish: locations are real coordinates a
 * few km apart, so distances and the map are truthful.
 */

/** Small deterministic jitter so co-located items don't stack perfectly. */
function jitter(base: number, salt: number): number {
  const wave = Math.sin(salt * 12.9898) * 43758.5453
  return base + (wave - Math.floor(wave) - 0.5) * 0.004
}

function photo(seed: string): string {
  return `https://picsum.photos/seed/bdb-${seed}/640/480`
}

interface ItemSeed {
  id: string
  ownerId: string
  title: string
  description: string
  category: Item['category']
  condition: string
  photos: string[]
  availability: Item['availability']
  maxDurationDays: number
  depositAmount: number | null
  dailyFee: number | null
  pickupPreference: Item['borrowTerms']['pickupPreference']
  pickupInstructions: string
  /** Days ago the item was listed. */
  listedDaysAgo: number
}

const SEEDS: ItemSeed[] = [
  {
    id: 'i-drill',
    ownerId: 'u-maya',
    title: '20V Cordless Drill + 40-Piece Bit Kit',
    description:
      'DeWalt driver with two batteries, so one is always charged. Handles shelves, furniture, and the occasional honey-do list. Bits stay organized in the case — mostly.',
    category: 'Tools',
    condition: 'Well loved but runs great — one small scuff on the chuck.',
    photos: [photo('drill-1'), photo('drill-2')],
    availability: 'borrowed', // Priya has it — overdue (see seeded request)
    maxDurationDays: 7,
    depositAmount: 20,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions:
      'Home most evenings — porch pickup on Richmond St, or I can drop within a couple of blocks.',
    listedDaysAgo: 210,
  },
  {
    id: 'i-mixer',
    ownerId: 'u-maya',
    title: '6-Qt Stand Mixer (Bowl, Paddle & Dough Hook)',
    description:
      'For the sourdough era of your life. Heavy, glorious, barely used since I got a hand mixer. Manual and dough hook included.',
    category: 'Kitchen',
    condition: 'Excellent — like new.',
    photos: [photo('mixer-1')],
    availability: 'available',
    maxDurationDays: 10,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions:
      'Porch pickup. Text when you\u2019re close and I\u2019ll set it by the door.',
    listedDaysAgo: 120,
  },
  {
    id: 'i-pasta',
    ownerId: 'u-maya',
    title: 'Electric Pasta Roller & Cutter',
    description:
      'Marcato Atlas motorized roller. Fresh tagliatelle in 20 minutes, I promise. Clamp included so it doesn\u2019t wander the counter.',
    category: 'Kitchen',
    condition: 'Great — cleaned and floured after every use.',
    photos: [photo('pasta-1')],
    availability: 'available',
    maxDurationDays: 5,
    depositAmount: 15,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'Kitchen is on the ground floor — easy pickup.',
    listedDaysAgo: 45,
  },
  {
    id: 'i-tent',
    ownerId: 'u-marcus',
    title: '6-Person Dome Tent + Footprint',
    description:
      'REI Kingdom-style dome. Survived two kids and one very rainy weekend at the lake. Poles are numbered, footprint included, and it goes back in the bag (mostly) on the first try.',
    category: 'Outdoor & Camping',
    condition: 'Excellent — seams resealed last spring.',
    photos: [photo('tent-1'), photo('tent-2')],
    availability: 'available',
    maxDurationDays: 14,
    depositAmount: 50,
    dailyFee: 5,
    pickupPreference: 'pickup',
    pickupInstructions:
      'Garage off the alley — I\u2019ll leave it open, tent\u2019s right by the door.',
    listedDaysAgo: 30,
  },
  {
    id: 'i-washer',
    ownerId: 'u-tom',
    title: '2,000 PSI Electric Pressure Washer',
    description:
      'Great for mossy patios, grimy fences, and that sidewalk the neighbors keep mentioning. Three nozzles plus a detergent bottle. Garden-hose hookup.',
    category: 'Tools',
    condition: 'Good — works perfectly, the hose reel is fussy.',
    photos: [photo('washer-1')],
    availability: 'available',
    maxDurationDays: 4,
    depositAmount: 30,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions:
      'Driveway pickup. I\u2019ll show you the startup trick so it doesn\u2019t stall.',
    listedDaysAgo: 400,
  },
  {
    id: 'i-karaoke',
    ownerId: 'u-joan',
    title: 'Karaoke Machine + 2 Mics & Songbook',
    description:
      'The undisputed star of every block party since 2019. Bluetooth, two mics (one squeaky), and an echo dial for extra drama. The songbook skews 80s — deliberately.',
    category: 'Party & Events',
    condition: 'Good — one mic crackles if you swing it too hard.',
    photos: [photo('karaoke-1')],
    availability: 'borrowed', // Maya is mid-borrow (see seeded request)
    maxDurationDays: 3,
    depositAmount: 25,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions:
      'Porch pickup on Sellwood Blvd. I\u2019ll carry it to your car — it\u2019s heavier than it looks.',
    listedDaysAgo: 500,
  },
  {
    id: 'i-saw',
    ownerId: 'u-marcus',
    title: '7¼" Circular Saw + Blade Set',
    description:
      'For the deck project you keep telling people about. Extra blade for finishing cuts, corded, long extension included. Safety glasses live in the case, because I\u2019m your dad now.',
    category: 'Tools',
    condition: 'Good — some sawdust character.',
    photos: [photo('saw-1')],
    availability: 'available',
    maxDurationDays: 5,
    depositAmount: 25,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Text me when you\u2019re outside — the garage code changes monthly.',
    listedDaysAgo: 200,
  },
  {
    id: 'i-kayak',
    ownerId: 'u-tom',
    title: 'Solo Sit-On Kayak + Roof Straps',
    description:
      'Old Town-style sportsman. Stable enough for beginners, quick enough to matter. Includes cart, paddle, and soft straps that won\u2019t chew up your roof.',
    category: 'Outdoor & Camping',
    condition: 'Good — some sun fade, zero leaks.',
    photos: [photo('kayak-1'), photo('kayak-2'), photo('kayak-3')],
    availability: 'available',
    maxDurationDays: 7,
    depositAmount: 100,
    dailyFee: 10,
    pickupPreference: 'either',
    pickupInstructions: 'I can help load it — rooftop experience helps but isn\u2019t required.',
    listedDaysAgo: 90,
  },
  {
    id: 'i-projector',
    ownerId: 'u-leo',
    title: 'Portable 1080p Projector + 100" Screen',
    description:
      'Unpacked it for one movie night, then the box spring broke. Your backyard deserves better. HDMI and USB-C, and the speaker is surprisingly OK.',
    category: 'Electronics',
    condition: 'Like new — original box, obviously.',
    photos: [photo('projector-1')],
    availability: 'available',
    maxDurationDays: 5,
    depositAmount: 40,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'I work from home — anytime before 6 works.',
    listedDaysAgo: 12,
  },
  {
    id: 'i-stroller',
    ownerId: 'u-nina',
    title: 'Double Jogging Stroller',
    description:
      'Thule-style chariot. We outgrew it, cried a little, and are ready to pass it to the next family. Swivel front wheel, rain cover, and it folds "easily" (it\u2019s a workout).',
    category: 'Kids & Baby',
    condition: 'Good — sun faded, everything works.',
    photos: [photo('stroller-1')],
    availability: 'available',
    maxDurationDays: 10,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Side gate\u2019s usually open — the stroller is under the tarp.',
    listedDaysAgo: 60,
  },
  {
    id: 'i-tennis',
    ownerId: 'u-priya',
    title: 'Two Adult Tennis Rackets + Case',
    description:
      'A matching pair for that "we should play more" couple. Fresh grips this spring; one racket has a small chip that adds character (and zero spin).',
    category: 'Sports',
    condition: 'Good.',
    photos: [photo('tennis-1')],
    availability: 'available',
    maxDurationDays: 3,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'I\u2019m at the courts most Saturdays — or porch pickup anytime.',
    listedDaysAgo: 150,
  },
  {
    id: 'i-carpet',
    ownerId: 'u-priya',
    title: 'Upright Carpet Cleaner',
    description:
      'For post-birthday-party carpets and "the dog did WHAT" emergencies. Works great on stairs if you\u2019re patient. One bottle of solution included.',
    category: 'Tools',
    condition: 'Good — rinsed after every use, I promise.',
    photos: [photo('carpet-1')],
    availability: 'available',
    maxDurationDays: 4,
    depositAmount: null,
    dailyFee: 8,
    pickupPreference: 'pickup',
    pickupInstructions: 'Front porch. Return it empty of solution — I\u2019ll refill.',
    listedDaysAgo: 320,
  },
  {
    id: 'i-cider',
    ownerId: 'u-sana',
    title: 'Apple Press & Crusher (Cider Season!)',
    description:
      'Hand-crank press that\u2019s made 200+ gallons of cider. Perfect for the "we bought too many apples at the farm stand" weekend. Pails included.',
    category: 'Other',
    condition: 'Good — the wood needs a rinse before use; I\u2019ll do it.',
    photos: [photo('cider-1')],
    availability: 'available',
    maxDurationDays: 5,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Driveway pickup. I\u2019ll tape my cider recipe card to the handle.',
    listedDaysAgo: 260,
  },
  {
    id: 'i-canner',
    ownerId: 'u-sana',
    title: '23-Qt Pressure Canner + Jar Kit',
    description:
      'Everything for a proper canning day: canner, rack, tongs, 12 jars, and my phone number for panicked questions.',
    category: 'Kitchen',
    condition: 'Good — gasket replaced last season.',
    photos: [photo('canner-1')],
    availability: 'unavailable', // paused for canning season — shows the "unavailable" state
    maxDurationDays: 7,
    depositAmount: 10,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Basement pickup — mind the low beam on the stairs.',
    listedDaysAgo: 5,
  },
  {
    id: 'i-snowboard',
    ownerId: 'u-diego',
    title: 'Snowboard + Boots (Men\u2019s 10.5)',
    description:
      'Rome Mechanic-style all-mountain board. Boots barely broken in — I\u2019m a size 10.5 and in denial. Wax it and it\u2019s yours for the weekend.',
    category: 'Sports',
    condition: 'Good — base has one repaired scratch, rides fine.',
    photos: [photo('snowboard-1')],
    availability: 'available',
    maxDurationDays: 7,
    depositAmount: 60,
    dailyFee: 5,
    pickupPreference: 'either',
    pickupInstructions:
      'The buzzer\u2019s broken — knock loud. Or message me and I\u2019ll meet you out front.',
    listedDaysAgo: 500,
  },
  {
    id: 'i-lights',
    ownerId: 'u-nina',
    title: '300ft Market String Lights + Stands',
    description:
      'The wedding-grade set: warm bulbs, two stands, spare fuses. Transforms any backyard into "we should do this monthly" territory.',
    category: 'Party & Events',
    condition: 'Excellent — tested before every lend.',
    photos: [photo('lights-1')],
    availability: 'available',
    maxDurationDays: 4,
    depositAmount: 30,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'Heavy-ish — I can help carry it to your car.',
    listedDaysAgo: 80,
  },
  {
    id: 'i-sewing',
    ownerId: 'u-joan',
    title: 'Sewing Machine + Mending Kit',
    description:
      'Janome workhorse. The threading diagram is taped inside the lid because we\u2019ve all been there. The kit has 30 thread colors, buttons, and the good scissors.',
    category: 'Other',
    condition: 'Good — recently serviced.',
    photos: [photo('sewing-1')],
    availability: 'available',
    maxDurationDays: 10,
    depositAmount: 20,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Porch pickup. I\u2019ll wind a fresh bobbin for you.',
    listedDaysAgo: 600,
  },
  {
    id: 'i-drone',
    ownerId: 'u-tom',
    title: '4K Camera Drone + Spare Battery',
    description:
      'Sub-registration-weight flyer. Two batteries (~50 min total), controller, and ND filters for cinematic ego trips. Crashed once, repaired properly.',
    category: 'Electronics',
    condition: 'Good — flies straight, one prop scuffed.',
    photos: [photo('drone-1')],
    availability: 'available',
    maxDurationDays: 5,
    depositAmount: 150,
    dailyFee: 10,
    pickupPreference: 'pickup',
    pickupInstructions: 'Pickup only, and I\u2019ll walk you through the fail-safes first.',
    listedDaysAgo: 25,
  },
  {
    id: 'i-campstove',
    ownerId: 'u-leo',
    title: '2-Burner Camp Stove + Griddle',
    description:
      'Car-camping champion. Griddle for pancakes, two burners for everything else. Fits a picnic table like it was drawn there.',
    category: 'Outdoor & Camping',
    condition: 'Excellent — cleaned after every trip.',
    photos: [], // deliberately photo-less: new neighbor, "photos this weekend"
    availability: 'available',
    maxDurationDays: 7,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions:
      'I\u2019m around most days — message and we\u2019ll sort a time. Photos coming this weekend, I just moved in!',
    listedDaysAgo: 18,
  },
]

/** Takes the seeded users so each item can sit near its owner's home. */
export function seedItems(users: User[]): Item[] {
  const homes = new Map(users.map((u) => [u.id, u.homeLocation]))
  return SEEDS.map((seed, index) => {
    const home = homes.get(seed.ownerId) ?? { lat: 45.51, lng: -122.64 }
    return {
      id: seed.id,
      ownerId: seed.ownerId,
      title: seed.title,
      description: seed.description,
      category: seed.category,
      condition: seed.condition,
      photos: seed.photos,
      location: { lat: jitter(home.lat, index + 1), lng: jitter(home.lng, index + 7) },
      availability: seed.availability,
      borrowTerms: {
        maxDurationDays: seed.maxDurationDays,
        depositAmount: seed.depositAmount,
        dailyFee: seed.dailyFee,
        pickupPreference: seed.pickupPreference,
        pickupInstructions: seed.pickupInstructions,
      },
      createdAt: localDateFromToday(-seed.listedDaysAgo),
    }
  })
}
