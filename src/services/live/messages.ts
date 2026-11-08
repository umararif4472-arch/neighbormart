import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore/lite'
import type { AppNotification, BorrowRequest, Listing, Message } from '@/types'
import { ApiError } from '../errors'
import { getDb } from '../firebase'
import { COLLECTIONS, fromDoc, fromDocs, stripUndefined } from './firestoreData'
import { createNotification } from './notifications'

/** Live chat service — one thread per borrow request, participants only. */

export interface SendMessageResult {
  message: Message
  notifications: AppNotification[]
}

export async function getMessagesForRequest(requestId: string): Promise<Message[]> {
  const q = query(
    collection(getDb(), COLLECTIONS.messages),
    where('requestId', '==', requestId),
    orderBy('createdAt', 'asc'),
  )
  const snap = await getDocs(q)
  return fromDocs<Message>(snap.docs)
}

export async function sendMessage(
  requestId: string,
  senderId: string,
  body: string,
): Promise<SendMessageResult> {
  const requestSnap = await getDoc(doc(getDb(), COLLECTIONS.requests, requestId))
  const request = fromDoc<BorrowRequest & { ownerId: string }>(requestSnap)
  if (!request) throw new ApiError('not-found', 'That borrow request no longer exists.')

  const trimmed = body.trim()
  if (trimmed.length === 0) throw new ApiError('invalid', 'Write something first.')
  if (trimmed.length > 1000) throw new ApiError('invalid', 'Messages max out at 1000 characters.')

  const listingSnap = await getDoc(doc(getDb(), COLLECTIONS.listings, request.listingId))
  const listing = fromDoc<Listing>(listingSnap)
  if (!listing) throw new ApiError('not-found', 'This thread’s listing no longer exists.')

  const isBorrower = request.borrowerId === senderId
  const isLender = listing.ownerId === senderId
  if (!isBorrower && !isLender) {
    throw new ApiError('forbidden', 'Only the two neighbors in this request can chat here.')
  }

  const message: Omit<Message, 'id'> = {
    requestId,
    senderId,
    body: trimmed,
    createdAt: new Date().toISOString(),
  }
  const ref = await addDoc(collection(getDb(), COLLECTIONS.messages), stripUndefined(message))

  // Notify the other party.
  const recipientId = isBorrower ? listing.ownerId : request.borrowerId
  const senderSnap = await getDoc(doc(getDb(), COLLECTIONS.users, senderId))
  const senderName = fromDoc<{ name: string }>(senderSnap)?.name ?? 'A neighbor'
  const notification = await createNotification(
    recipientId,
    'message-received',
    `New message from ${senderName}`,
    trimmed.slice(0, 80),
    { requestId, listingId: listing.id },
  )

  return { message: { id: ref.id, ...message }, notifications: [notification] }
}
