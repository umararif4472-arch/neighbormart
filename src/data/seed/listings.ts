import type {
  ArenaListing,
  ItemListing,
  Listing,
  PropertyListing,
  User,
  VehicleListing,
} from '@/types'
import { DEFAULT_CURRENCY } from '@/config'
import { localDateFromToday } from '@/utils/dates'

/**
 * Seed listings for all four sections (Phase 2). Photos use seeded picsum
 * URLs (stable, no API key). The items section carries the original demo
 * flows (one listing out on loan, one paused, one photo-less); vehicles,
 * properties, and arenas arrive with realistic Lahore listings and PKR
 * prices so every section browses like a real marketplace.
 *
 * Locations sit near each owner's home in Lahore, so distances and the
 * map are truthful.
 */

/** Small deterministic jitter so co-located listings don't stack perfectly. */
function jitter(base: number, salt: number): number {
  const wave = Math.sin(salt * 12.9898) * 43758.5453
  return base + (wave - Math.floor(wave) - 0.5) * 0.004
}

function photo(seed: string): string {
  return `https://picsum.photos/seed/bdb-${seed}/640/480`
}

type Homes = Map<string, User>

function near(homes: Homes, ownerId: string, salt: number): Listing['location'] {
  const owner = homes.get(ownerId)
  const home = owner?.homeLocation ?? { lat: 31.5204, lng: 74.3587 }
  return {
    lat: jitter(home.lat, salt),
    lng: jitter(home.lng, salt + 7),
    city: owner?.city ?? 'Lahore',
    area: owner?.neighborhood ?? 'Gulberg',
  }
}

// --- Items & Tools -----------------------------------------------------------

interface ItemSeed {
  id: string
  ownerId: string
  title: string
  description: string
  category: ItemListing['details']['category']
  condition: string
  photos: string[]
  status: ItemListing['status']
  maxDurationDays: number
  depositAmount: number | null
  /** null = free borrow; a number makes it a per-day rent listing. */
  dailyFee: number | null
  pickupPreference: ItemListing['details']['pickupPreference']
  pickupInstructions: string
  listedDaysAgo: number
  views: number
}

const ITEM_SEEDS: ItemSeed[] = [
  {
    id: 'i-drill',
    ownerId: 'u-maya',
    title: '20V Cordless Drill + 40-Piece Bit Kit',
    description:
      'DeWalt driver with two batteries, so one is always charged. Handles shelves, furniture, and the occasional honey-do list. Bits stay organized in the case — mostly.',
    category: 'Tools',
    condition: 'Well loved but runs great — one small scuff on the chuck.',
    photos: [photo('drill-1'), photo('drill-2')],
    status: 'rented', // Priya has it — overdue (see seeded request)
    maxDurationDays: 7,
    depositAmount: 5000,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions:
      'Home most evenings — porch pickup in DHA Phase 5, or I can drop within a couple of blocks.',
    listedDaysAgo: 210,
    views: 342,
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
    status: 'active',
    maxDurationDays: 10,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Porch pickup. Message when you’re close and I’ll set it by the door.',
    listedDaysAgo: 120,
    views: 187,
  },
  {
    id: 'i-pasta',
    ownerId: 'u-maya',
    title: 'Electric Pasta Roller & Cutter',
    description:
      'Marcato Atlas motorized roller. Fresh tagliatelle in 20 minutes, I promise. Clamp included so it doesn’t wander the counter.',
    category: 'Kitchen',
    condition: 'Great — cleaned and floured after every use.',
    photos: [photo('pasta-1')],
    status: 'active',
    maxDurationDays: 5,
    depositAmount: 3000,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'Kitchen is on the ground floor — easy pickup.',
    listedDaysAgo: 45,
    views: 98,
  },
  {
    id: 'i-tent',
    ownerId: 'u-marcus',
    title: '6-Person Dome Tent + Footprint',
    description:
      'REI Kingdom-style dome. Survived two kids and one very rainy weekend up north. Poles are numbered, footprint included, and it goes back in the bag (mostly) on the first try.',
    category: 'Outdoor & Camping',
    condition: 'Excellent — seams resealed last spring.',
    photos: [photo('tent-1'), photo('tent-2')],
    status: 'active',
    maxDurationDays: 14,
    depositAmount: 10000,
    dailyFee: 1500,
    pickupPreference: 'pickup',
    pickupInstructions: 'Garage off the lane — I’ll leave it open, tent’s right by the door.',
    listedDaysAgo: 30,
    views: 264,
  },
  {
    id: 'i-washer',
    ownerId: 'u-tom',
    title: '2,000 PSI Electric Pressure Washer',
    description:
      'Great for mossy patios, grimy fences, and that driveway the neighbors keep mentioning. Three nozzles plus a detergent bottle. Garden-hose hookup.',
    category: 'Tools',
    condition: 'Good — works perfectly, the hose reel is fussy.',
    photos: [photo('washer-1')],
    status: 'active',
    maxDurationDays: 4,
    depositAmount: 8000,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'Driveway pickup. I’ll show you the startup trick so it doesn’t stall.',
    listedDaysAgo: 400,
    views: 431,
  },
  {
    id: 'i-karaoke',
    ownerId: 'u-joan',
    title: 'Karaoke Machine + 2 Mics & Songbook',
    description:
      'The undisputed star of every street party since 2019. Bluetooth, two mics (one squeaky), and an echo dial for extra drama. The songbook skews old Bollywood and 80s pop — deliberately.',
    category: 'Party & Events',
    condition: 'Good — one mic crackles if you swing it too hard.',
    photos: [photo('karaoke-1')],
    status: 'rented', // Maya is mid-borrow (see seeded request)
    maxDurationDays: 3,
    depositAmount: 5000,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions:
      'Porch pickup in Model Town. I’ll carry it to your car — it’s heavier than it looks.',
    listedDaysAgo: 500,
    views: 512,
  },
  {
    id: 'i-saw',
    ownerId: 'u-marcus',
    title: '7¼" Circular Saw + Blade Set',
    description:
      'For the deck project you keep telling people about. Extra blade for finishing cuts, corded, long extension included. Safety glasses live in the case, because I’m your dad now.',
    category: 'Tools',
    condition: 'Good — some sawdust character.',
    photos: [photo('saw-1')],
    status: 'active',
    maxDurationDays: 5,
    depositAmount: 5000,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Message me when you’re outside — the garage code changes monthly.',
    listedDaysAgo: 200,
    views: 203,
  },
  {
    id: 'i-kayak',
    ownerId: 'u-tom',
    title: 'Solo Sit-On Kayak + Roof Straps',
    description:
      'Old Town-style sportsman. Stable enough for beginners, quick enough to matter. Includes cart, paddle, and soft straps that won’t chew up your roof. Lovely on the lake at Rana Resort or a slow canal run.',
    category: 'Outdoor & Camping',
    condition: 'Good — some sun fade, zero leaks.',
    photos: [photo('kayak-1'), photo('kayak-2'), photo('kayak-3')],
    status: 'active',
    maxDurationDays: 7,
    depositAmount: 25000,
    dailyFee: 3000,
    pickupPreference: 'either',
    pickupInstructions: 'I can help load it — rooftop experience helps but isn’t required.',
    listedDaysAgo: 90,
    views: 377,
  },
  {
    id: 'i-projector',
    ownerId: 'u-leo',
    title: 'Portable 1080p Projector + 100" Screen',
    description:
      'Unpacked it for one movie night, then life happened. Your rooftop deserves better. HDMI and USB-C, and the speaker is surprisingly OK.',
    category: 'Electronics',
    condition: 'Like new — original box, obviously.',
    photos: [photo('projector-1')],
    status: 'active',
    maxDurationDays: 5,
    depositAmount: 10000,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'I work from home — anytime before 6 works.',
    listedDaysAgo: 12,
    views: 156,
  },
  {
    id: 'i-stroller',
    ownerId: 'u-nina',
    title: 'Double Jogging Stroller',
    description:
      'Thule-style chariot. We outgrew it, cried a little, and are ready to pass it to the next family. Swivel front wheel, rain cover, and it folds "easily" (it’s a workout).',
    category: 'Kids & Baby',
    condition: 'Good — sun faded, everything works.',
    photos: [photo('stroller-1')],
    status: 'active',
    maxDurationDays: 10,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Side gate’s usually open — the stroller is under the tarp.',
    listedDaysAgo: 60,
    views: 88,
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
    status: 'active',
    maxDurationDays: 3,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'I’m at the courts most Saturdays — or porch pickup anytime.',
    listedDaysAgo: 150,
    views: 64,
  },
  {
    id: 'i-carpet',
    ownerId: 'u-priya',
    title: 'Upright Carpet Cleaner',
    description:
      'For post-birthday-party carpets and "the pet did WHAT" emergencies. Works great on stairs if you’re patient. One bottle of solution included.',
    category: 'Tools',
    condition: 'Good — rinsed after every use, I promise.',
    photos: [photo('carpet-1')],
    status: 'active',
    maxDurationDays: 4,
    depositAmount: null,
    dailyFee: 2500,
    pickupPreference: 'pickup',
    pickupInstructions: 'Front porch. Return it empty of solution — I’ll refill.',
    listedDaysAgo: 320,
    views: 229,
  },
  {
    id: 'i-cider',
    ownerId: 'u-sana',
    title: 'Fruit Press & Crusher (Juice Season!)',
    description:
      'Hand-crank press that’s made 200+ litres of fresh juice. Perfect for the "we bought too many oranges at the Sunday bazaar" weekend. Buckets included.',
    category: 'Other',
    condition: 'Good — the wood needs a rinse before use; I’ll do it.',
    photos: [photo('cider-1')],
    status: 'active',
    maxDurationDays: 5,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Driveway pickup. I’ll tape my juice recipe card to the handle.',
    listedDaysAgo: 260,
    views: 141,
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
    status: 'paused', // paused for canning season — shows the "paused" state
    maxDurationDays: 7,
    depositAmount: 2000,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Basement pickup — mind the low beam on the stairs.',
    listedDaysAgo: 5,
    views: 47,
  },
  {
    id: 'i-snowboard',
    ownerId: 'u-diego',
    title: 'Snowboard + Boots (Men’s 10.5)',
    description:
      'Rome Mechanic-style all-mountain board, ready for a Malam Jabba or Naltar trip. Boots barely broken in — I’m a size 10.5 and in denial. Wax it and it’s yours for the weekend.',
    category: 'Sports',
    condition: 'Good — base has one repaired scratch, rides fine.',
    photos: [photo('snowboard-1')],
    status: 'active',
    maxDurationDays: 7,
    depositAmount: 15000,
    dailyFee: 2000,
    pickupPreference: 'either',
    pickupInstructions:
      'The buzzer’s broken — knock loud. Or message me and I’ll meet you out front.',
    listedDaysAgo: 500,
    views: 198,
  },
  {
    id: 'i-lights',
    ownerId: 'u-nina',
    title: '300ft Market String Lights + Stands',
    description:
      'The wedding-grade set: warm bulbs, two stands, spare fuses. Transforms any rooftop into "we should do this monthly" territory.',
    category: 'Party & Events',
    condition: 'Excellent — tested before every lend.',
    photos: [photo('lights-1')],
    status: 'active',
    maxDurationDays: 4,
    depositAmount: 8000,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'Heavy-ish — I can help carry it to your car.',
    listedDaysAgo: 80,
    views: 176,
  },
  {
    id: 'i-sewing',
    ownerId: 'u-joan',
    title: 'Sewing Machine + Mending Kit',
    description:
      'Janome workhorse. The threading diagram is taped inside the lid because we’ve all been there. The kit has 30 thread colors, buttons, and the good scissors.',
    category: 'Other',
    condition: 'Good — recently serviced.',
    photos: [photo('sewing-1')],
    status: 'active',
    maxDurationDays: 10,
    depositAmount: 5000,
    dailyFee: null,
    pickupPreference: 'pickup',
    pickupInstructions: 'Porch pickup. I’ll wind a fresh bobbin for you.',
    listedDaysAgo: 600,
    views: 154,
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
    status: 'active',
    maxDurationDays: 5,
    depositAmount: 40000,
    dailyFee: 5000,
    pickupPreference: 'pickup',
    pickupInstructions: 'Pickup only, and I’ll walk you through the fail-safes first.',
    listedDaysAgo: 25,
    views: 689,
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
    status: 'active',
    maxDurationDays: 7,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions:
      'I’m around most days — message and we’ll sort a time. Photos coming this weekend, I just moved in!',
    listedDaysAgo: 18,
    views: 39,
  },
]

function buildItemListings(homes: Homes): ItemListing[] {
  return ITEM_SEEDS.map((seed, index) => {
    const createdAt = localDateFromToday(-seed.listedDaysAgo)
    const isRent = seed.dailyFee != null
    return {
      id: seed.id,
      ownerId: seed.ownerId,
      section: 'items',
      listingType: isRent ? 'rent' : 'borrow',
      title: seed.title,
      description: seed.description,
      price: seed.dailyFee ?? 0,
      currency: DEFAULT_CURRENCY,
      priceUnit: isRent ? 'day' : 'fixed',
      negotiable: false,
      photos: seed.photos,
      location: near(homes, seed.ownerId, index + 1),
      status: seed.status,
      createdAt,
      updatedAt: createdAt,
      views: seed.views,
      details: {
        category: seed.category,
        condition: seed.condition,
        depositAmount: seed.depositAmount,
        maxDurationDays: seed.maxDurationDays,
        pickupPreference: seed.pickupPreference,
        pickupInstructions: seed.pickupInstructions,
      },
    }
  })
}

// --- Vehicles ------------------------------------------------------------------

function buildVehicleListings(homes: Homes): VehicleListing[] {
  const base = (
    seed: Omit<VehicleListing, 'location' | 'currency' | 'createdAt' | 'updatedAt'> & {
      listedDaysAgo: number
    },
    salt: number,
  ): VehicleListing => {
    const { listedDaysAgo, ...rest } = seed
    const createdAt = localDateFromToday(-listedDaysAgo)
    return {
      ...rest,
      currency: DEFAULT_CURRENCY,
      location: near(homes, seed.ownerId, salt),
      createdAt,
      updatedAt: createdAt,
    }
  }
  return [
    base(
      {
        id: 'v-corolla',
        ownerId: 'u-tom',
        section: 'vehicles',
        listingType: 'rent',
        title: 'Toyota Corolla GLi 2020 — Rent by the Day',
        description:
          'Clean, fuel-average-friendly Corolla for family trips and airport runs. Regularly serviced, new tyres this year, chilled AC. Fuel policy: return with the same level.',
        price: 8000,
        priceUnit: 'day',
        negotiable: false,
        photos: [photo('corolla-1'), photo('corolla-2'), photo('corolla-3')],
        status: 'active',
        views: 412,
        details: {
          make: 'Toyota',
          model: 'Corolla GLi',
          year: 2020,
          mileageKm: 62000,
          fuelType: 'petrol',
          transmission: 'automatic',
          condition: 'Excellent — serviced on schedule, non-accidental.',
          withDriver: false,
          registrationCity: 'Lahore',
        },
        listedDaysAgo: 40,
      },
      101,
    ),
    base(
      {
        id: 'v-civic',
        ownerId: 'u-marcus',
        section: 'vehicles',
        listingType: 'sell',
        title: 'Honda Civic Oriel 2022 — Total Genuine',
        description:
          'First owner, Honda-maintained throughout, complete service record in the file. Selling because the family is upgrading. Token and biometric ready for transfer.',
        price: 6850000,
        priceUnit: 'fixed',
        negotiable: true,
        photos: [photo('civic-1'), photo('civic-2'), photo('civic-3'), photo('civic-4')],
        status: 'active',
        views: 1050,
        details: {
          make: 'Honda',
          model: 'Civic Oriel',
          year: 2022,
          mileageKm: 28500,
          fuelType: 'petrol',
          transmission: 'automatic',
          condition: 'Total genuine — bumper-to-bumper original paint.',
          withDriver: false,
          registrationCity: 'Lahore',
        },
        listedDaysAgo: 15,
      },
      102,
    ),
    base(
      {
        id: 'v-mehran',
        ownerId: 'u-diego',
        section: 'vehicles',
        listingType: 'sell',
        title: 'Suzuki Mehran VXR 2017 — The Reliable Boss',
        description:
          'The Boss. Engine in genuine condition, suspension done last year, chilled AC for a Mehran (a minor miracle). Ideal first car or campus runabout.',
        price: 1150000,
        priceUnit: 'fixed',
        negotiable: true,
        photos: [photo('mehran-1'), photo('mehran-2'), photo('mehran-3')],
        status: 'active',
        views: 640,
        details: {
          make: 'Suzuki',
          model: 'Mehran VXR',
          year: 2017,
          mileageKm: 98000,
          fuelType: 'petrol',
          transmission: 'manual',
          condition: 'Good for its age — two dry dents, engine sealed.',
          withDriver: false,
          registrationCity: 'Lahore',
        },
        listedDaysAgo: 65,
      },
      103,
    ),
    base(
      {
        id: 'v-cd70',
        ownerId: 'u-leo',
        section: 'vehicles',
        listingType: 'rent',
        title: 'Honda CD 70 2023 — Daily Bike Rental',
        description:
          'Nearly new CD 70 for delivery riders and anyone whose own bike is in the workshop. Helmet included. Daily and weekly rates — message for weekly.',
        price: 1500,
        priceUnit: 'day',
        negotiable: false,
        photos: [photo('cd70-1'), photo('cd70-2'), photo('cd70-3')],
        status: 'active',
        views: 233,
        details: {
          make: 'Honda',
          model: 'CD 70',
          year: 2023,
          mileageKm: 8200,
          fuelType: 'petrol',
          transmission: 'manual',
          condition: 'Excellent — first owner, all original.',
          withDriver: false,
          registrationCity: 'Lahore',
        },
        listedDaysAgo: 22,
      },
      104,
    ),
    base(
      {
        id: 'v-hiace',
        ownerId: 'u-tom',
        section: 'vehicles',
        listingType: 'rent',
        title: 'Toyota Hiace 2019 — With Driver, Group Trips',
        description:
          '13-seater Hiace with an experienced driver for weddings, northern trips, and office outings. Fuel and tolls at actual. Out today on a trip — back tomorrow evening.',
        price: 15000,
        priceUnit: 'day',
        negotiable: true,
        photos: [photo('hiace-1'), photo('hiace-2'), photo('hiace-3')],
        status: 'rented',
        views: 389,
        details: {
          make: 'Toyota',
          model: 'Hiace',
          year: 2019,
          mileageKm: 145000,
          fuelType: 'diesel',
          transmission: 'manual',
          condition: 'Good — maintained for commercial use, AC front and rear.',
          withDriver: true,
          registrationCity: 'Lahore',
        },
        listedDaysAgo: 90,
      },
      105,
    ),
  ]
}

// --- Properties ------------------------------------------------------------------

function buildPropertyListings(homes: Homes): PropertyListing[] {
  const base = (
    seed: Omit<PropertyListing, 'location' | 'currency' | 'createdAt' | 'updatedAt'> & {
      listedDaysAgo: number
    },
    salt: number,
  ): PropertyListing => {
    const { listedDaysAgo, ...rest } = seed
    const createdAt = localDateFromToday(-listedDaysAgo)
    return {
      ...rest,
      currency: DEFAULT_CURRENCY,
      location: near(homes, seed.ownerId, salt),
      createdAt,
      updatedAt: createdAt,
    }
  }
  return [
    base(
      {
        id: 'p-dha-house',
        ownerId: 'u-joan',
        section: 'properties',
        listingType: 'rent',
        title: '1 Kanal House in DHA Phase 5 — Family Home',
        description:
          'Sunny 1 kanal house on a quiet street: big lawn, drawing/dining, company room with attached bath, and a proper terrace. Ideal for a joint family. Water and security are sorted; generator installed.',
        price: 250000,
        priceUnit: 'month',
        negotiable: false,
        photos: [
          photo('house-dha-1'),
          photo('house-dha-2'),
          photo('house-dha-3'),
          photo('house-dha-4'),
        ],
        status: 'active',
        views: 890,
        details: {
          propertyType: 'house',
          bedrooms: 5,
          bathrooms: 6,
          areaSize: 1,
          areaUnit: 'kanal',
          furnished: false,
          floor: null,
          amenities: ['Parking for 3 cars', 'Lawn', 'Generator', 'Security guard', 'Terrace'],
          availableFrom: localDateFromToday(14),
        },
        listedDaysAgo: 18,
      },
      201,
    ),
    base(
      {
        id: 'p-gulberg-flat',
        ownerId: 'u-maya',
        section: 'properties',
        listingType: 'rent',
        title: '3-Bed Apartment in Gulberg — Near Main Boulevard',
        description:
          'Bright 3-bed flat in a maintained building, five minutes from Main Boulevard. Lift, standby generator, and covered parking. Families preferred; small pets negotiable.',
        price: 85000,
        priceUnit: 'month',
        negotiable: true,
        photos: [photo('flat-gulberg-1'), photo('flat-gulberg-2'), photo('flat-gulberg-3')],
        status: 'active',
        views: 655,
        details: {
          propertyType: 'apartment',
          bedrooms: 3,
          bathrooms: 3,
          areaSize: 1800,
          areaUnit: 'sqft',
          furnished: false,
          floor: 4,
          amenities: ['Lift', 'Standby generator', 'Covered parking', '24/7 security'],
          availableFrom: localDateFromToday(7),
        },
        listedDaysAgo: 26,
      },
      202,
    ),
    base(
      {
        id: 'p-modeltown-house',
        ownerId: 'u-sana',
        section: 'properties',
        listingType: 'sell',
        title: '10 Marla House in Model Town — Near Park',
        description:
          'Solid-construction 10 marla, two units, marble and ash wood work throughout. Clear title, all dues paid, ready for immediate transfer. A genuine family home in the oldest, greenest block of Model Town.',
        price: 48500000,
        priceUnit: 'fixed',
        negotiable: true,
        photos: [
          photo('house-mt-1'),
          photo('house-mt-2'),
          photo('house-mt-3'),
          photo('house-mt-4'),
        ],
        status: 'active',
        views: 1230,
        details: {
          propertyType: 'house',
          bedrooms: 4,
          bathrooms: 4,
          areaSize: 10,
          areaUnit: 'marla',
          furnished: false,
          floor: null,
          amenities: ['Near park', 'Two kitchens', 'Store room', 'Servant quarter'],
          availableFrom: localDateFromToday(0),
        },
        listedDaysAgo: 33,
      },
      203,
    ),
    base(
      {
        id: 'p-johar-studio',
        ownerId: 'u-leo',
        section: 'properties',
        listingType: 'rent',
        title: 'Furnished Studio in Johar Town — Students Welcome',
        description:
          'Compact furnished studio with a kitchenette, ideal for a student or a young professional. Currently reserved for a viewing this week — message to join the waitlist.',
        price: 35000,
        priceUnit: 'month',
        negotiable: false,
        photos: [photo('studio-jt-1'), photo('studio-jt-2'), photo('studio-jt-3')],
        status: 'reserved',
        views: 480,
        details: {
          propertyType: 'apartment',
          bedrooms: 1,
          bathrooms: 1,
          areaSize: 550,
          areaUnit: 'sqft',
          furnished: true,
          floor: 2,
          amenities: ['Furnished', 'UPS', 'Near university', 'Separate meter'],
          availableFrom: localDateFromToday(3),
        },
        listedDaysAgo: 9,
      },
      204,
    ),
    base(
      {
        id: 'p-bahria-plot',
        ownerId: 'u-marcus',
        section: 'properties',
        listingType: 'sell',
        title: '5 Marla Plot in Bahria Town — Level, Near Boulevard',
        description:
          'Level 5 marla in a developed block, utilities at the doorstep, possession and utility charges paid. Solid investment or build-your-home plot; all documents complete and available for verification.',
        price: 9800000,
        priceUnit: 'fixed',
        negotiable: true,
        photos: [photo('plot-bahria-1'), photo('plot-bahria-2'), photo('plot-bahria-3')],
        status: 'active',
        views: 760,
        details: {
          propertyType: 'plot',
          bedrooms: null,
          bathrooms: null,
          areaSize: 5,
          areaUnit: 'marla',
          furnished: false,
          floor: null,
          amenities: ['Developed block', 'Utilities available', 'Near boulevard'],
          availableFrom: localDateFromToday(0),
        },
        listedDaysAgo: 47,
      },
      205,
    ),
    base(
      {
        id: 'p-liberty-shop',
        ownerId: 'u-nina',
        section: 'properties',
        listingType: 'rent',
        title: 'Shop in Liberty Market — High Footfall Corner',
        description:
          'Ground-floor shop in the heart of Liberty Market. Suited to garments, cosmetics, or a café counter. Long lease available for the right tenant.',
        price: 120000,
        priceUnit: 'month',
        negotiable: true,
        photos: [photo('shop-liberty-1'), photo('shop-liberty-2'), photo('shop-liberty-3')],
        status: 'active',
        views: 540,
        details: {
          propertyType: 'shop',
          bedrooms: null,
          bathrooms: 1,
          areaSize: 400,
          areaUnit: 'sqft',
          furnished: false,
          floor: 0,
          amenities: ['Corner unit', 'High footfall', 'Storage at back'],
          availableFrom: localDateFromToday(21),
        },
        listedDaysAgo: 52,
      },
      206,
    ),
  ]
}

// --- Sports Arenas & Venues ------------------------------------------------------

function buildArenaListings(homes: Homes): ArenaListing[] {
  const base = (
    seed: Omit<ArenaListing, 'location' | 'currency' | 'createdAt' | 'updatedAt'> & {
      listedDaysAgo: number
    },
    salt: number,
  ): ArenaListing => {
    const { listedDaysAgo, ...rest } = seed
    const createdAt = localDateFromToday(-listedDaysAgo)
    return {
      ...rest,
      currency: DEFAULT_CURRENCY,
      location: near(homes, seed.ownerId, salt),
      createdAt,
      updatedAt: createdAt,
    }
  }
  return [
    base(
      {
        id: 'a-padel',
        ownerId: 'u-marcus',
        section: 'arenas',
        listingType: 'rent',
        title: 'Padel Court in DHA — Book by the Hour',
        description:
          'Glass-walled padel court with pro turf and full floodlights. Rackets and balls available at the desk. Peak hours (6–10 pm) book out fast on weekends.',
        price: 4000,
        priceUnit: 'hour',
        negotiable: false,
        photos: [photo('padel-1'), photo('padel-2'), photo('padel-3')],
        status: 'active',
        views: 980,
        details: {
          sportTypes: ['Padel'],
          surface: 'Indoor synthetic turf',
          capacity: 12,
          openingHours: { opens: '08:00', closes: '23:00' },
          slotMinutes: 60,
          facilities: { floodlights: true, parking: true, washrooms: true, changingRooms: true },
          advanceBooking: { maxAdvanceDays: 14, minAdvanceHours: 2 },
        },
        listedDaysAgo: 28,
      },
      301,
    ),
    base(
      {
        id: 'a-football-turf',
        ownerId: 'u-tom',
        section: 'arenas',
        listingType: 'rent',
        title: 'Football Turf in Gulberg — 7-a-side, Floodlit',
        description:
          'FIFA-grade astro turf, proper line markings, and lights bright enough for night leagues. Bibs, balls, and a referee available on request.',
        price: 6500,
        priceUnit: 'hour',
        negotiable: false,
        photos: [photo('turf-1'), photo('turf-2'), photo('turf-3')],
        status: 'active',
        views: 1240,
        details: {
          sportTypes: ['Football', 'Futsal'],
          surface: 'Astro turf (FIFA-grade)',
          capacity: 22,
          openingHours: { opens: '06:00', closes: '00:00' },
          slotMinutes: 90,
          facilities: { floodlights: true, parking: true, washrooms: true, changingRooms: true },
          advanceBooking: { maxAdvanceDays: 21, minAdvanceHours: 4 },
        },
        listedDaysAgo: 55,
      },
      302,
    ),
    base(
      {
        id: 'a-cricket',
        ownerId: 'u-diego',
        section: 'arenas',
        listingType: 'rent',
        title: 'Cricket Ground in Cantt — Turf Wicket, Full Day',
        description:
          'Full-size ground with a prepared turf wicket, sightscreens, and a small pavilion. Tape-ball and hard-ball both welcome. Groundsman levels the pitch the morning of your match.',
        price: 30000,
        priceUnit: 'day',
        negotiable: true,
        photos: [photo('cricket-1'), photo('cricket-2'), photo('cricket-3')],
        status: 'active',
        views: 860,
        details: {
          sportTypes: ['Cricket'],
          surface: 'Natural grass, turf wicket',
          capacity: 100,
          openingHours: { opens: '07:00', closes: '19:00' },
          slotMinutes: 480,
          facilities: { floodlights: false, parking: true, washrooms: true, changingRooms: true },
          advanceBooking: { maxAdvanceDays: 30, minAdvanceHours: 24 },
        },
        listedDaysAgo: 70,
      },
      303,
    ),
    base(
      {
        id: 'a-tennis',
        ownerId: 'u-priya',
        section: 'arenas',
        listingType: 'rent',
        title: 'Tennis Court in Johar Town — Hard Court',
        description:
          'Well-kept hard court in a quiet block, newly resurfaced this season. Coaching available on weekday mornings; ball machine rental on request.',
        price: 2500,
        priceUnit: 'hour',
        negotiable: false,
        photos: [photo('tennis-court-1'), photo('tennis-court-2')],
        status: 'active',
        views: 430,
        details: {
          sportTypes: ['Tennis'],
          surface: 'Hard court',
          capacity: 8,
          openingHours: { opens: '06:00', closes: '22:00' },
          slotMinutes: 60,
          facilities: { floodlights: true, parking: true, washrooms: true, changingRooms: false },
          advanceBooking: { maxAdvanceDays: 10, minAdvanceHours: 1 },
        },
        listedDaysAgo: 36,
      },
      304,
    ),
    base(
      {
        id: 'a-banquet',
        ownerId: 'u-joan',
        section: 'arenas',
        listingType: 'rent',
        title: 'Pearl Banquet Hall in Gulberg — Weddings & Events',
        description:
          'Air-conditioned hall for up to 500 guests with a bridal room, full kitchen access, and valet parking. Decor and catering partners available, or bring your own.',
        price: 150000,
        priceUnit: 'day',
        negotiable: true,
        photos: [photo('banquet-1'), photo('banquet-2'), photo('banquet-3')],
        status: 'active',
        views: 1500,
        details: {
          sportTypes: ['Weddings', 'Corporate events', 'Walima', 'Mehndi'],
          surface: 'Indoor hall — marble flooring',
          capacity: 500,
          openingHours: { opens: '09:00', closes: '00:00' },
          slotMinutes: 720,
          facilities: { floodlights: false, parking: true, washrooms: true, changingRooms: true },
          advanceBooking: { maxAdvanceDays: 90, minAdvanceHours: 72 },
        },
        listedDaysAgo: 120,
      },
      305,
    ),
  ]
}

/** Takes the seeded users so each listing can sit near its owner's home. */
export function seedListings(users: User[]): Listing[] {
  const homes: Homes = new Map(users.map((u) => [u.id, u]))
  return [
    ...buildItemListings(homes),
    ...buildVehicleListings(homes),
    ...buildPropertyListings(homes),
    ...buildArenaListings(homes),
  ]
}
