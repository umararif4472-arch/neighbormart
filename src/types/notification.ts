import type { ISODateString } from './common'

export type NotificationType =
  | 'request-received'
  | 'request-approved'
  | 'request-declined'
  | 'pickup-confirmed'
  | 'return-reminder'
  | 'return-confirmed'
  | 'overdue'
  | 'review-requested'
  | 'review-received'
  | 'issue-reported'
  | 'message-received'

/**
 * Named AppNotification (not Notification) to avoid clashing with the DOM's
 * global Notification type.
 */
export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  requestId?: string
  listingId?: string
  read: boolean
  createdAt: ISODateString
}
