import type { AppNotification } from '@/types'
import { isoHoursAgo } from '@/utils/dates'

/**
 * Maya's STORED notifications.
 *
 * Lifecycle events (approved, declined, due-soon, review requests…) are
 * intentionally NOT stored — the dashboard derives them live from request
 * state (utils/derivedNotifications.ts), so they can never go stale. Only
 * push-like events that can't be projected from state live here: incoming
 * chat messages.
 */
export function seedNotifications(): AppNotification[] {
  return [
    {
      id: 'ntf-msg-kayak',
      userId: 'u-maya',
      type: 'message-received',
      title: 'New message from Tom Alvarez',
      body: 'Sedan\u2019s fine — I\u2019ll pack the soft straps and show you the tie-down. I\u2019m home all Saturday morning.',
      requestId: 'req-out-kayak',
      listingId: 'i-kayak',
      read: false,
      createdAt: isoHoursAgo(22),
    },
    {
      id: 'ntf-msg-karaoke',
      userId: 'u-maya',
      type: 'message-received',
      title: 'New message from Joan Whitfield',
      body: 'Wouldn\u2019t miss it. Have it back by Sunday evening and we stay friends.',
      requestId: 'req-active-karaoke',
      listingId: 'i-karaoke',
      read: true,
      createdAt: isoHoursAgo(24 * 2),
    },
  ]
}
