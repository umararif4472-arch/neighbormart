import { useCallback, useEffect, useReducer } from 'react'
import {
  clearDraftStorage,
  initialListItemFormState,
  listItemFormReducer,
  readDraftFromStorage,
  saveDraftToStorage,
} from './listItemForm'

/**
 * Wires the list-item form reducer to localStorage:
 *
 *  - On mount, restores a saved draft (so navigating away mid-form is
 *    recoverable — progress is never lost silently).
 *  - After every dirty change, persists the draft.
 *  - `discard` clears storage + resets the form.
 *  - `publishSucceeded` clears storage and resets, but keeps the caller's
 *    success screen in charge.
 */
export function useListItemDraft() {
  const [state, dispatch] = useReducer(listItemFormReducer, initialListItemFormState)

  // Restore once on mount. The lazy-ish dispatch is safe: the reducer is
  // initialized with the plain initial state, then restored immediately.
  useEffect(() => {
    const stored = readDraftFromStorage()
    if (stored) {
      dispatch({ type: 'restored', draft: stored.draft, stepIndex: stored.stepIndex })
    }
    // Mount only: dispatch is stable and storage is read exactly once.
  }, [])

  // Persist whenever a dirty draft changes (skips pristine/empty drafts).
  useEffect(() => {
    if (!state.dirty) return
    saveDraftToStorage(state)
  }, [state])

  const discard = useCallback(() => {
    clearDraftStorage()
    dispatch({ type: 'reset' })
  }, [])

  const publishSucceeded = useCallback(() => {
    clearDraftStorage()
    dispatch({ type: 'reset' })
  }, [])

  return { state, dispatch, discard, publishSucceeded }
}
