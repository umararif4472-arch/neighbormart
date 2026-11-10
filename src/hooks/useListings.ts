import { useCallback, useEffect, useRef, useState } from 'react'
import type { Listing, ListingSection, ListingType } from '@/types'
import { useApp } from '@/context/AppContext'
import {
  listingsApi,
  toErrorMessage,
  type ListingsCursor,
} from '@/services'

/**
 * THE listings fetch path (Workstream A) — browse and landing both read
 * through here, and AppContext no longer hydrates listings at all, so
 * the old AppContext + hook double fetch is gone.
 *
 * Pages come from listingsApi.getListingsPage (canonical query:
 * status == 'active' [+ section] [+ listingType] [+ city], newest
 * first, 24/page) and are cached per session inside the service —
 * remounts don't re-read. Client-only filters (price, search text,
 * distance — see services/pagination.ts) run over `listings` in the
 * caller via useFilteredListings.
 *
 * Every fetched page is also upserted into AppContext so id-lookups
 * elsewhere (dashboard, messages, moderation) can find listings they
 * reference without their own collection scan.
 */
export interface UseListingsOptions {
  section?: ListingSection | 'all'
  listingType?: ListingType | 'all'
  city?: string
  pageSize?: number
}

export function useListings(options: UseListingsOptions = {}) {
  const { section = 'all', listingType = 'all', city = '', pageSize } = options
  const { dispatch } = useApp()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nonce, setNonce] = useState(0)
  const cursorRef = useRef<ListingsCursor | null>(null)
  const queryKey = `${section}|${listingType}|${city}|${pageSize ?? 'default'}`

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    cursorRef.current = null

    listingsApi
      .getListingsPage({ section, listingType, city: city || undefined, pageSize })
      .then((page) => {
        if (!alive) return
        cursorRef.current = page.nextCursor
        setHasMore(page.hasMore)
        setListings(page.items)
        if (page.items.length > 0) {
          dispatch({ type: 'LISTINGS_UPSERTED', listings: page.items })
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(toErrorMessage(err))
        setLoading(false)
      })

    return () => {
      alive = false
    }
    // queryKey captures section/listingType/city/pageSize; nonce = reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, nonce, dispatch])

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    try {
      const page = await listingsApi.getListingsPage({
        section,
        listingType,
        city: city || undefined,
        pageSize,
        cursor: cursorRef.current,
      })
      cursorRef.current = page.nextCursor
      setHasMore(page.hasMore)
      if (page.items.length > 0) {
        setListings((prev) => {
          const seen = new Set(prev.map((l) => l.id))
          return [...prev, ...page.items.filter((l) => !seen.has(l.id))]
        })
        dispatch({ type: 'LISTINGS_UPSERTED', listings: page.items })
      }
    } catch (err: unknown) {
      setError(toErrorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, section, listingType, city, pageSize, dispatch])

  const reload = useCallback(() => {
    listingsApi.invalidateListingsCache()
    setNonce((n) => n + 1)
  }, [])

  return { listings, loading, loadingMore, error, reload, loadMore, hasMore }
}
