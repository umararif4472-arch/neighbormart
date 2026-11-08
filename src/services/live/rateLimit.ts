import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore/lite'
import { getDb } from '../firebase'
import { ApiError } from '../errors'
import {
  checkWindow,
  LISTING_RATE_LIMIT,
  MESSAGE_RATE_LIMIT,
  type WindowState,
} from '@/utils/rateLimit'

/**
 * Live rate limiting (Phase 8). Each user has a counter document at
 * rateLimits/{uid}. Before creating a listing/message, the client
 * bumps the counter and binds it to the new document's id
 * (lastListingId / lastMessageId); Firestore rules then only allow
 * the create when the counter names that exact id and the window
 * count is within the limit — so the quota can't be skipped by a
 * hand-crafted create, and resets when the window expires.
 */

interface CounterDoc {
  listingsCount?: number
  listingsWindowStartTs?: Timestamp
  lastListingId?: string
  messagesCount?: number
  messagesWindowStartTs?: Timestamp
  lastMessageId?: string
}

function toWindowState(count?: number, start?: Timestamp): WindowState {
  return { count: count ?? 0, windowStart: start ? start.toDate().toISOString() : null }
}

async function bump(uid: string, kind: 'listings' | 'messages', targetId: string): Promise<void> {
  const db = getDb()
  const ref = doc(db, 'rateLimits', uid)
  const snap = await getDoc(ref)
  const data = (snap.exists() ? snap.data() : {}) as CounterDoc
  const nowIso = new Date().toISOString()

  if (kind === 'listings') {
    const decision = checkWindow(
      toWindowState(data.listingsCount, data.listingsWindowStartTs),
      nowIso,
      LISTING_RATE_LIMIT.limit,
      LISTING_RATE_LIMIT.windowMs,
    )
    if (!decision.allowed) {
      throw new ApiError(
        'rate-limited',
        'You can publish at most 10 listings in 24 hours — try again later.',
      )
    }
    await setDoc(
      ref,
      {
        listingsCount: decision.count,
        listingsWindowStartTs: Timestamp.fromDate(new Date(decision.windowStart!)),
        lastListingId: targetId,
      },
      { merge: true },
    )
    return
  }

  const decision = checkWindow(
    toWindowState(data.messagesCount, data.messagesWindowStartTs),
    nowIso,
    MESSAGE_RATE_LIMIT.limit,
    MESSAGE_RATE_LIMIT.windowMs,
  )
  if (!decision.allowed) {
    throw new ApiError('rate-limited', 'You are sending messages too fast — wait a minute.')
  }
  await setDoc(
    ref,
    {
      messagesCount: decision.count,
      messagesWindowStartTs: Timestamp.fromDate(new Date(decision.windowStart!)),
      lastMessageId: targetId,
    },
    { merge: true },
  )
}

export function bumpListingQuota(uid: string, listingId: string) {
  return bump(uid, 'listings', listingId)
}

export function bumpMessageQuota(uid: string, messageId: string) {
  return bump(uid, 'messages', messageId)
}
