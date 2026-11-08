import { useCallback, useEffect, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { listingsApi, toErrorMessage } from '@/services'

/**
 * Listing data access — stale-while-revalidate style:
 *  - First mount: fetch through the service (real async path) and sync the
 *    result into context, showing skeletons while loading.
 *  - Remounts: serve cached listings from context instantly and refresh in
 *    the background. New listings created anywhere in the app appear
 *    because context stays synced.
 */
export function useListings() {
  const { state, dispatch } = useApp()
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setFetching(true)
    setError(null)

    listingsApi
      .getListings()
      .then((listings) => {
        if (!alive) return
        dispatch({ type: 'LISTINGS_SET', listings })
        setFetching(false)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(toErrorMessage(err))
        setFetching(false)
      })

    return () => {
      alive = false
    }
  }, [dispatch, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    listings: state.listings,
    loading: fetching && state.listings.length === 0,
    error,
    reload,
  }
}
