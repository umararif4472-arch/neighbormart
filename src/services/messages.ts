import type { AppNotification, Message } from '@/types'
import { ApiError } from './errors'
import { createNotification } from './notifications'
import { clone, findRequest, getStore, nextId, simulateLatency } from './store'
import { sanitizeMultiline } from '@/utils/sanitize'
import { checkWindow, MESSAGE_RATE_LIMIT, type WindowState } from '@/utils/rateLimit'

const messageWindows = new Map<string, WindowState>()

/** Chat service — one thread per borrow request, participants only. */

export interface SendMessageResult {
  message: Message
  notifications: AppNotification[]
}

export async function getMessagesForRequest(requestId: string): Promise<Message[]> {
  await simulateLatency(80, 250)
  const thread = getStore()
    .messages.filter((m) => m.requestId === requestId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  return clone(thread)
}

export async function sendMessage(
  requestId: string,
  senderId: string,
  body: string,
): Promise<SendMessageResult> {
  await simulateLatency(150, 400)

  const request = findRequest(requestId)
  const trimmed = sanitizeMultiline(body, 1000)
  if (trimmed.length === 0) throw new ApiError('invalid', 'Write something first.')
  const decision = checkWindow(
    messageWindows.get(senderId) ?? { windowStart: null, count: 0 },
    new Date().toISOString(),
    MESSAGE_RATE_LIMIT.limit,
    MESSAGE_RATE_LIMIT.windowMs,
  )
  if (!decision.allowed) {
    throw new ApiError('rate-limited', 'You are sending messages too fast — wait a minute.')
  }
  messageWindows.set(senderId, { windowStart: decision.windowStart, count: decision.count })
  if (trimmed.length > 1000) throw new ApiError('invalid', 'Messages max out at 1000 characters.')

  const store = getStore()
  const listing = store.listings.find((l) => l.id === request.listingId)
  if (!listing) throw new ApiError('not-found', 'This thread\u2019s listing no longer exists.')

  const isBorrower = request.borrowerId === senderId
  const isLender = listing.ownerId === senderId
  if (!isBorrower && !isLender) {
    throw new ApiError('forbidden', 'Only the two neighbors in this request can chat here.')
  }

  const message: Message = {
    id: nextId('msg'),
    requestId,
    senderId,
    body: trimmed,
    createdAt: new Date().toISOString(),
  }
  store.messages.push(message)

  // Notify the other party (mock push).
  const recipientId = isBorrower ? listing.ownerId : request.borrowerId
  const senderName = store.users.find((u) => u.id === senderId)?.name ?? 'A neighbor'
  const notification = createNotification(
    recipientId,
    'message-received',
    `New message from ${senderName}`,
    trimmed.slice(0, 80),
    { requestId, listingId: listing.id },
  )

  return { message: clone(message), notifications: [notification] }
}
