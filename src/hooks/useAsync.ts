import { useCallback, useEffect, useRef, useState } from 'react'
import { toErrorMessage } from '@/services'

/**
 * Generic async fetch hook with real loading/error states — used everywhere
 * data is loaded, even from the mock services, so the async code path is
 * genuine. `fn` may change between renders without re-triggering; list the
 * values that SHOULD re-fetch in `deps` (like useEffect deps).
 */
export interface UseAsyncResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAsync<T>(fn: () => Promise<T>, deps: ReadonlyArray<unknown>): UseAsyncResult<T> {
  const [nonce, setNonce] = useState(0)
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keep the latest fn without adding it to deps (callers pass closures).
  // Refs are written inside an effect, never during render; this effect is
  // declared before the fetch effect, so fnRef is current when it runs.
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    fnRef
      .current()
      .then((result) => {
        if (!alive) return
        setData(result)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are caller-controlled
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, reload }
}
