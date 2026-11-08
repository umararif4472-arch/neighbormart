import { useState, type FormEvent } from 'react'
import type { Listing } from '@/types'
import { useApp } from '@/context/AppContext'
import { listingsApi, toErrorMessage } from '@/services'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextAreaField, TextField } from '@/components/ui/Field'

export interface EditListingModalProps {
  listing: Listing
  open: boolean
  onClose: () => void
}

/**
 * Owner edit for the quick-win fields (title, description, price,
 * negotiable) — the full detail edit stays in the create wizard's
 * domain. Saves through listingsApi.updateListingBasics and syncs the
 * updated listing into context.
 */
export function EditListingModal({ listing, open, onClose }: EditListingModalProps) {
  const { state, dispatch } = useApp()
  const currentUser = state.currentUser
  const [title, setTitle] = useState(listing.title)
  const [description, setDescription] = useState(listing.description)
  const [price, setPrice] = useState(String(listing.price))
  const [negotiable, setNegotiable] = useState(listing.negotiable)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setTitle(listing.title)
      setDescription(listing.description)
      setPrice(String(listing.price))
      setNegotiable(listing.negotiable)
      setError(null)
      setSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!currentUser) return
    setSaving(true)
    setError(null)
    try {
      const updated = await listingsApi.updateListingBasics(listing.id, currentUser.id, {
        title,
        description,
        ...(listing.listingType !== 'borrow' ? { price: Number(price) } : {}),
        ...(listing.listingType === 'sell' ? { negotiable } : {}),
      })
      dispatch({ type: 'LISTINGS_UPSERTED', listings: [updated] })
      onClose()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit listing">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Title"
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextAreaField
          label="Description"
          required
          maxLength={1000}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          hint={`${description.length}/1000`}
        />
        {listing.listingType !== 'borrow' && (
          <TextField
            label={`Price (Rs${listing.listingType === 'rent' ? ` per ${listing.priceUnit}` : ''})`}
            type="number"
            min={0}
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        )}
        {listing.listingType === 'sell' && (
          <label className="flex items-center gap-2 text-sm font-medium text-bark">
            <input
              type="checkbox"
              checked={negotiable}
              className="h-4 w-4 accent-terracotta-600"
              onChange={(e) => setNegotiable(e.target.checked)}
            />
            Open to offers (negotiable)
          </label>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-2xl bg-red-50 dark:bg-red-950/60 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}
