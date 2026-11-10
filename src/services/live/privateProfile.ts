import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore/lite'
import type { LatLng, User } from '@/types'
import { COLLECTIONS, stripUndefined } from './firestoreData'

/**
 * Privacy split (Workstream C, client half) — the sensitive fields of
 * a profile live in ONE private subcollection doc,
 * `users/{uid}/private/data`, readable/writable only by the owner
 * (admins may read; see firestore.rules). The public doc at
 * `users/{uid}` keeps everything else — name, avatar, city/area,
 * verification flags, stats, badges and the PUBLIC `showPhone`
 * visibility flag.
 *
 * Transition contract:
 *   - Reading your OWN profile merges the two docs: the private doc
 *     wins per-field, and each field falls back to the legacy public
 *     doc copy when the private doc (or that field in it) is absent —
 *     pre-migration users keep working until the migration runs.
 *   - Reading ANYONE ELSE returns the public doc only. The private
 *     path is never requested for another user; the fields simply
 *     come back as safe defaults (no phone, no precise location).
 *   - Writes of private fields go ONLY to the private doc.
 */

/** The exact private field list — mirrors firestore.rules
 *  (privateDataValid) and scripts/migrate-user-privacy.mjs. */
export interface PrivateProfileData {
  phone?: string
  email?: string
  blockedUserIds?: string[]
  homeLocation?: LatLng
}

/** Default precise location for a brand-new profile (Lahore centre) —
 *  the user sets their real area during onboarding. Also the neutral
 *  placeholder normalizePublicUser fills for OTHER users, whose
 *  precise location is private: no display or distance code reads
 *  another user's homeLocation (distances use listing.location, and
 *  the origin is always the signed-in user's own merged profile). */
export const LAHORE_CENTER: LatLng = { lat: 31.5204, lng: 74.3587 }

export function privateProfileRef(db: Firestore, uid: string) {
  return doc(db, COLLECTIONS.users, uid, 'private', 'data')
}

/**
 * Fill the private fields a migrated public doc no longer carries
 * with safe defaults, so a public-only User always satisfies the
 * model shape. Legacy (pre-migration) public fields pass through
 * untouched — they are the fallback the transition depends on.
 */
export function normalizePublicUser(raw: Record<string, unknown> & { id: string }): User {
  const user = raw as unknown as User
  return {
    ...user,
    phone: user.phone ?? '',
    blockedUserIds: user.blockedUserIds ?? [],
    homeLocation: user.homeLocation ?? LAHORE_CENTER,
  }
}

/**
 * Merge a private doc over a (normalized) public profile, per-field:
 * a field present in the private doc wins; a field absent from it
 * keeps the public/legacy value. A null private doc (not yet
 * migrated, or the read failed) returns the public profile as-is.
 */
export function mergePrivateProfile(
  publicUser: User,
  privateData: PrivateProfileData | null,
): User {
  if (!privateData) return publicUser
  return {
    ...publicUser,
    phone: privateData.phone ?? publicUser.phone,
    email: privateData.email ?? publicUser.email,
    blockedUserIds: privateData.blockedUserIds ?? publicUser.blockedUserIds,
    homeLocation: privateData.homeLocation ?? publicUser.homeLocation,
  }
}

/** Read the private doc. Null when it does not exist — and null on a
 *  failed read, so a transient error degrades an own-profile load to
 *  the legacy public fields instead of failing sign-in outright. */
export async function fetchPrivateProfile(
  db: Firestore,
  uid: string,
): Promise<PrivateProfileData | null> {
  try {
    const snap = await getDoc(privateProfileRef(db, uid))
    if (!snap.exists()) return null
    return snap.data() as PrivateProfileData
  } catch {
    return null
  }
}

/** Write private fields ONLY to the private doc (merge, so partial
 *  updates — a phone change, a block-list change — never clobber the
 *  sibling fields). Creates the doc for pre-migration users. */
export async function writePrivateProfile(
  db: Firestore,
  uid: string,
  fields: PrivateProfileData,
): Promise<void> {
  await setDoc(privateProfileRef(db, uid), stripUndefined({ ...fields }), { merge: true })
}

/**
 * The merged OWN profile for `uid` from an already-read public doc
 * body. Callers must only pass their OWN uid — this is the one place
 * the private path is read, and every caller scopes it to the
 * signed-in user.
 */
export async function mergeOwnProfile(
  db: Firestore,
  uid: string,
  publicRaw: Record<string, unknown> & { id: string },
): Promise<User> {
  const publicUser = normalizePublicUser(publicRaw)
  const privateData = await fetchPrivateProfile(db, uid)
  return mergePrivateProfile(publicUser, privateData)
}
