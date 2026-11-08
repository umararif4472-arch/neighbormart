import type { AppNotification, NotificationType } from '@/types'
import { clone, nextId, getStore, simulateLatency } from './store'

/**
 * Notification service. Also exposes `createNotification` for sibling
 * services (requests/messages/reviews) — on a real backend the server
 * would fan these out the same way.
 */

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  await simulateLatency()
  const list = getStore()
    .notifications.filter((n) => n.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return clone(list)
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<AppNotification[]> {
  await simulateLatency(80, 200)
  const notification = getStore().notifications.find((n) => n.id === notificationId)
  if (notification && notification.userId === userId) notification.read = true
  return getNotifications(userId)
}

export async function markAllNotificationsRead(userId: string): Promise<AppNotification[]> {
  await simulateLatency(80, 200)
  for (const notification of getStore().notifications) {
    if (notification.userId === userId) notification.read = true
  }
  return getNotifications(userId)
}

/** Internal: create + persist a notification, returning a clone. */
export function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  refs: { requestId?: string; listingId?: string } = {},
): AppNotification {
  const notification: AppNotification = {
    id: nextId('ntf'),
    userId,
    type,
    title,
    body,
    requestId: refs.requestId,
    listingId: refs.listingId,
    read: false,
    createdAt: new Date().toISOString(),
  }
  getStore().notifications.push(notification)
  return clone(notification)
}
