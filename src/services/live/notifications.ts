import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  doc,
} from 'firebase/firestore/lite'
import type { AppNotification, NotificationType } from '@/types'
import { getDb } from '../firebase'
import { COLLECTIONS, fromDocs, stripUndefined } from './firestoreData'

/**
 * Live notification service. `createNotification` is the internal fan-out
 * helper sibling live services call (chat messages, issue reports,
 * reviews) — the same role it plays in the mock layer.
 */

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  const q = query(
    collection(getDb(), COLLECTIONS.notifications),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return fromDocs<AppNotification>(snap.docs)
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<AppNotification[]> {
  await updateDoc(doc(getDb(), COLLECTIONS.notifications, notificationId), { read: true })
  return getNotifications(userId)
}

export async function markAllNotificationsRead(userId: string): Promise<AppNotification[]> {
  const unread = await getNotifications(userId)
  const batch = writeBatch(getDb())
  for (const notification of unread) {
    if (!notification.read) {
      batch.update(doc(getDb(), COLLECTIONS.notifications, notification.id), { read: true })
    }
  }
  await batch.commit()
  return getNotifications(userId)
}

/** Internal: create + persist a notification, returning it with its id. */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  refs: { requestId?: string; listingId?: string } = {},
): Promise<AppNotification> {
  const notification: Omit<AppNotification, 'id'> = {
    userId,
    type,
    title,
    body,
    requestId: refs.requestId,
    listingId: refs.listingId,
    read: false,
    createdAt: new Date().toISOString(),
  }
  const ref = await addDoc(
    collection(getDb(), COLLECTIONS.notifications),
    stripUndefined(notification),
  )
  return { id: ref.id, ...notification }
}
