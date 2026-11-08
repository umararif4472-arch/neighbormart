import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useMessages } from '@/hooks/useMessages'
import { useNow } from '@/hooks/useNow'
import { findById } from '@/utils/collections'
import { formatDate, relativeTime } from '@/utils/dates'
import { effectiveStatus, STATUS_META } from '@/utils/requestLifecycle'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { ChevronLeftIcon } from '@/components/icons'
import { cn } from '@/utils/cn'

/**
 * /messages and /messages/:requestId — one chat thread per borrow request.
 *
 * Threads load through the message service and persist in context
 * (messagesByRequest), so navigating away and back keeps the conversation.
 * The thread header carries the request's live lifecycle status (derived
 * overdue included), tying chat to the state machine.
 */
export function MessagesPage() {
  const { requestId } = useParams<{ requestId?: string }>()
  const { state } = useApp()

  if (requestId) {
    return <ThreadView requestId={requestId} />
  }

  // Threads = requests (mine) that have a message thread.
  const threads = state.requests
    .map((request) => {
      const listing = findById(state.listings, request.listingId)
      const counterpartId =
        request.borrowerId === state.currentUser?.id ? listing?.ownerId : request.borrowerId
      const counterpart = findById(state.users, counterpartId)
      const messages = state.messagesByRequest[request.id] ?? []
      return { request, listingTitle: listing?.title ?? 'Listing', counterpart, messages }
    })
    .filter((thread) => thread.messages.length > 0)

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-bark sm:text-3xl">Messages</h1>
        <p className="mt-1 text-sm text-bark-light">
          Chats live with each borrow request — pickup logistics, thank-yous, and the occasional
          joke.
        </p>
      </header>

      {threads.length === 0 ? (
        <EmptyState
          emoji="💬"
          title="No chats yet"
          message="When you send or receive a borrow request, the conversation starts here."
        />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {threads.map(({ request, listingTitle, counterpart, messages }) => {
            const last = messages[messages.length - 1]
            return (
              <li key={request.id}>
                <Link
                  to={`/messages/${request.id}`}
                  className="flex items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-terracotta-600"
                >
                  <Avatar
                    name={counterpart?.name ?? 'Neighbor'}
                    src={counterpart?.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-bark">
                      {counterpart?.name ?? 'A neighbor'} · {listingTitle}
                    </p>
                    <p className="truncate text-xs text-bark-light">{last?.body}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-bark-light">
                    {last ? relativeTime(last.createdAt) : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ThreadView({ requestId }: { requestId: string }) {
  const { state } = useApp()
  const { messages, loading, error, send } = useMessages(requestId)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const now = useNow()
  const endRef = useRef<HTMLDivElement>(null)

  const request = findById(state.requests, requestId)
  const listing = findById(state.listings, request?.listingId)
  const counterpartId =
    request?.borrowerId === state.currentUser?.id ? listing?.ownerId : request?.borrowerId
  const counterpart = findById(state.users, counterpartId)
  const me = state.currentUser

  // Keep the newest message in view as the thread loads or grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, loading])

  if (!request || !me) {
    return (
      <EmptyState
        emoji="💬"
        title="This conversation ended"
        message="We couldn't find that request — it may have been withdrawn."
        action={
          <Link to="/messages">
            <Button variant="secondary">All messages</Button>
          </Link>
        }
        className="mx-auto max-w-lg"
      />
    )
  }

  const status = effectiveStatus(request, now)
  const statusMeta = STATUS_META[status]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
    try {
      await send(body)
      setDraft('')
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Message failed to send.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-13rem)] max-w-2xl flex-col gap-3 md:h-[calc(100dvh-16rem)]">
      <Link
        to="/messages"
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-bark-light hover:text-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        All messages
      </Link>

      {/* Thread header: counterpart + item + LIVE request status */}
      <header className="flex shrink-0 items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-4 shadow-sm">
        <Avatar name={counterpart?.name ?? 'A neighbor'} src={counterpart?.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-bark">
            {counterpart?.name ?? 'A neighbor'}
          </p>
          <p className="truncate text-xs text-bark-light">
            About {listing?.title ?? 'a listing'} · {formatDate(request.period.start)}
          </p>
        </div>
        <Badge tone={statusMeta.tone} dot>
          {statusMeta.label}
        </Badge>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-3xl border border-bark/10 bg-surface p-4 shadow-sm">
        <div aria-live="polite" className="flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-bark-light">
              <Spinner size="sm" /> Loading conversation…
            </div>
          ) : error ? (
            <p role="alert" className="py-4 text-center text-sm text-red-700">
              {error}
            </p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-bark-light">
              Say hello — ask about pickup, timing, or what&apos;s included.
            </p>
          ) : (
            messages.map((message) => {
              const mine = message.senderId === me.id
              const sender = findById(state.users, message.senderId)
              return (
                <div
                  key={message.id}
                  className={cn('flex flex-col gap-0.5', mine ? 'items-end' : 'items-start')}
                >
                  <div className="flex items-center gap-2">
                    {!mine && (
                      <Avatar name={sender?.name ?? 'Neighbor'} src={sender?.avatarUrl} size="xs" />
                    )}
                    <p
                      className={cn(
                        'max-w-[80%] rounded-3xl px-4 py-2.5 text-sm leading-relaxed',
                        mine
                          ? 'rounded-br-lg bg-terracotta-600 text-white'
                          : 'rounded-bl-lg bg-bark/5 text-bark',
                      )}
                    >
                      {message.body}
                    </p>
                    {mine && <Avatar name={me.name} src={me.avatarUrl} size="xs" />}
                  </div>
                  <p className="px-1 text-[11px] text-bark-light">
                    {relativeTime(message.createdAt)}
                  </p>
                </div>
              )
            })
          )}
          <div ref={endRef} aria-hidden />
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="flex shrink-0 gap-2">
        <label htmlFor="message-draft" className="sr-only">
          Write a message
        </label>
        <input
          id="message-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          maxLength={1000}
          autoComplete="off"
          className="h-12 flex-1 rounded-full border border-bark/15 bg-surface px-4 text-sm text-bark shadow-sm placeholder:text-bark-light/60 focus-visible:outline-2 focus-visible:outline-terracotta-600"
        />
        <Button type="submit" size="lg" loading={sending} disabled={!draft.trim()}>
          Send
        </Button>
      </form>
      {sendError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {sendError}
        </p>
      )}
    </div>
  )
}
