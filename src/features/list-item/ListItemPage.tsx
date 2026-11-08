import { useMemo, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ItemListing } from '@/types'
import { ITEM_CATEGORIES } from '@/types'
import { useApp } from '@/context/AppContext'
import { useListItemDraft } from './useListItemDraft'
import { listingsApi, toErrorMessage } from '@/services'
import { CATEGORY_META, categoryEmoji } from '@/utils/categoryMeta'
import { formatMoney } from '@/utils/money'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListingPhoto } from '@/components/listings/ListingPhoto'
import { CheckIcon, ChevronLeftIcon, XIcon, CameraIcon } from '@/components/icons'
import { LIST_ITEM_STEPS, MAX_PHOTOS, type DraftField, type ListItemDraft } from './listItemForm'

/**
 * /list-item — multi-step listing flow.
 *
 * State lives in ONE form reducer (see listItemForm.ts) — no scattered
 * useState per field. Each step validates before "Next" with visible
 * inline errors. Progress persists to localStorage, so leaving mid-form
 * and coming back restores the draft (with a notice + "start over").
 * Publishing goes through listingsApi.createItemListing → shared mock store →
 * context, so the new listing appears everywhere immediately.
 */
export function ListItemPage() {
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { state: form, dispatch: dispatchForm, discard, publishSucceeded } = useListItemDraft()
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [published, setPublished] = useState<ItemListing | null>(null)

  const step = LIST_ITEM_STEPS[form.stepIndex]
  const draft = form.draft
  const owner = state.currentUser

  // Photo "upload" mock: local file input → object URLs (session-only).
  function onPhotoFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    const urls = files
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, MAX_PHOTOS - draft.photos.length)
      .map((file) => URL.createObjectURL(file))
    if (urls.length > 0) dispatchForm({ type: 'photos_add', urls })
    event.target.value = '' // allow re-choosing the same file
  }

  function setField(field: DraftField, value: ListItemDraft[DraftField]) {
    dispatchForm({ type: 'field', field, value })
  }

  async function handlePublish() {
    if (!owner) return
    // Defensive: the stepper already gates this, but the service would
    // reject an empty category anyway — fail with a clear message here.
    if (!draft.category) {
      setPublishError('Pick a category for your listing before publishing.')
      return
    }
    setPublishing(true)
    setPublishError(null)
    try {
      const item = await listingsApi.createItemListing({
        ownerId: owner.id,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        condition: draft.condition,
        photos: draft.photos,
        maxDurationDays: Number(draft.maxDurationDays),
        depositAmount: draft.depositAmount === '' ? null : Number(draft.depositAmount),
        dailyFee: draft.dailyFee === '' ? null : Number(draft.dailyFee),
        pickupPreference: draft.pickupPreference,
        pickupInstructions: draft.pickupInstructions,
      })
      // Single listing created → sync context once; every reader sees it.
      dispatch({ type: 'LISTINGS_UPSERTED', listings: [item] })
      publishSucceeded()
      setPublished(item)
    } catch (error) {
      setPublishError(toErrorMessage(error))
    } finally {
      setPublishing(false)
    }
  }

  // --- Published: confirmation screen with share --------------------------
  if (published) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-8 text-center">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-moss-100 text-moss-700"
        >
          <CheckIcon className="h-8 w-8" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-bark">
            It&apos;s live on the block! 🎉
          </h1>
          <p className="mt-2 text-sm text-bark-light">
            {published.title} is now visible to neighbors within walking distance. We&apos;ll notify
            you the moment someone requests it.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-bark/10 bg-white p-4 text-left shadow-sm">
          <div className="flex gap-3">
            <ListingPhoto
              src={published.photos[0]}
              alt={published.title}
              emoji={categoryEmoji(published.details.category)}
              className="h-16 w-16 rounded-2xl"
            />
            <div className="min-w-0">
              <p className="truncate font-display font-bold text-bark">{published.title}</p>
              <p className="text-xs text-bark-light">
                {CATEGORY_META[published.details.category].emoji} {published.details.category} · up
                to {published.details.maxDurationDays} days
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/listing/${published.id}`} className="flex-1">
              <Button variant="secondary" className="w-full">
                View listing
              </Button>
            </Link>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                const shareData = {
                  title: 'NeighborMart',
                  text: `My ${published.title} is now listed on NeighborMart — check it out!`,
                  url: `${window.location.origin}/listing/${published.id}`,
                }
                // Best-effort share: native share sheet or clipboard copy.
                if (navigator.share) {
                  void navigator.share(shareData).catch(() => undefined)
                } else {
                  void navigator.clipboard
                    ?.writeText(shareData.url)
                    .then(() => setPublishError(null))
                    .catch(() => undefined)
                }
              }}
            >
              Share
            </Button>
          </div>
        </div>
        <Link
          to="/browse"
          className="text-sm font-semibold text-terracotta-700 underline-offset-4 hover:underline"
        >
          Browse what neighbors are sharing →
        </Link>
      </div>
    )
  }

  if (!owner) {
    return (
      <EmptyState
        emoji="👋"
        title="Sign in to list an item"
        message="You need a neighbor profile before you can lend things."
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-extrabold text-bark sm:text-3xl">
          List something you own
        </h1>
        <p className="text-sm text-bark-light">
          That thing in the garage deserves better than dust. Two minutes, four steps.
        </p>
      </header>

      {/* Restored-draft notice (the abandon case handled) */}
      {form.restored && form.dirty && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p>
            Welcome back — we kept your draft ({LIST_ITEM_STEPS[form.stepIndex].toLowerCase()}{' '}
            step).
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={discard}
            className="shrink-0 text-amber-900 hover:bg-amber-100"
          >
            Start over
          </Button>
        </div>
      )}

      {/* Stepper */}
      <ol className="flex list-none items-center gap-1.5" aria-label="Listing steps">
        {LIST_ITEM_STEPS.map((name, index) => {
          const isCurrent = index === form.stepIndex
          const isDone = index < form.stepIndex
          return (
            <li key={name} className="flex flex-1 flex-col gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'h-1.5 rounded-full transition-colors',
                  isDone ? 'bg-moss-500' : isCurrent ? 'bg-terracotta-600' : 'bg-bark/10',
                )}
              />
              <span
                className={cn(
                  'text-[11px] font-semibold sm:text-xs',
                  isCurrent ? 'text-terracotta-700' : isDone ? 'text-moss-700' : 'text-bark-light',
                )}
              >
                {isDone && '✓ '}
                {name}
              </span>
            </li>
          )
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        Step {form.stepIndex + 1} of {LIST_ITEM_STEPS.length}: {step}
      </p>

      {/* Step panels */}
      <div className="rounded-3xl border border-bark/10 bg-white p-5 shadow-sm sm:p-6">
        {step === 'The basics' && (
          <BasicsStep
            draft={draft}
            showErrors={form.showErrors}
            errors={form.errors}
            setField={setField}
            onPhotoFiles={onPhotoFiles}
            onRemovePhoto={(index) => dispatchForm({ type: 'photo_remove', index })}
          />
        )}
        {step === 'Details' && (
          <DetailsStep
            draft={draft}
            showErrors={form.showErrors}
            errors={form.errors}
            setField={setField}
          />
        )}
        {step === 'Borrowing terms' && (
          <TermsStep
            draft={draft}
            showErrors={form.showErrors}
            errors={form.errors}
            setField={setField}
          />
        )}
        {step === 'Preview' && (
          <PreviewStep draft={draft} ownerName={owner.name} ownerAvatarUrl={owner.avatarUrl} />
        )}
      </div>

      {publishError && (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {publishError}
        </p>
      )}

      {/* Nav buttons */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() =>
            form.stepIndex === 0 ? navigate('/browse') : dispatchForm({ type: 'back' })
          }
        >
          <ChevronLeftIcon className="h-4 w-4" />
          {form.stepIndex === 0 ? 'Cancel' : 'Back'}
        </Button>

        {form.stepIndex < LIST_ITEM_STEPS.length - 1 ? (
          <Button onClick={() => dispatchForm({ type: 'next' })}>
            Next: {LIST_ITEM_STEPS[form.stepIndex + 1]}
          </Button>
        ) : (
          <Button onClick={handlePublish} loading={publishing}>
            Publish my listing
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step panels (presentational; state + validation come from the reducer)
// ---------------------------------------------------------------------------

function fieldError(
  errors: Partial<Record<DraftField, string>>,
  showErrors: boolean,
  field: DraftField,
): string | undefined {
  return showErrors ? errors[field] : undefined
}

function BasicsStep({
  draft,
  showErrors,
  errors,
  setField,
  onPhotoFiles,
  onRemovePhoto,
}: {
  draft: ListItemDraft
  showErrors: boolean
  errors: Partial<Record<DraftField, string>>
  setField: (field: DraftField, value: ListItemDraft[DraftField]) => void
  onPhotoFiles: (event: ChangeEvent<HTMLInputElement>) => void
  onRemovePhoto: (index: number) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">The basics</h2>

      <SelectField
        label="Category"
        required
        value={draft.category}
        onChange={(e) => setField('category', e.target.value as ListItemDraft['category'])}
        error={fieldError(errors, showErrors, 'category')}
      >
        <option value="" disabled>
          Pick a category…
        </option>
        {ITEM_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {CATEGORY_META[category].emoji} {category}
          </option>
        ))}
      </SelectField>
      <p className="-mt-2 text-xs text-bark-light">
        {draft.category
          ? CATEGORY_META[draft.category].blurb
          : 'Pick the closest fit — filters use it.'}
      </p>

      <TextField
        label="Title"
        required
        value={draft.title}
        maxLength={80}
        placeholder="e.g. 20V Cordless Drill + Bit Kit"
        hint="What would a neighbor type to find this?"
        onChange={(e) => setField('title', e.target.value)}
        error={fieldError(errors, showErrors, 'title')}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-bark">
          Photos <span className="font-normal text-bark-light">(optional, up to {MAX_PHOTOS})</span>
        </legend>
        <div className="flex flex-wrap gap-3">
          {draft.photos.map((photo, index) => (
            <div key={photo} className="relative">
              <img
                src={photo}
                alt={`Listing photo ${index + 1}`}
                className="h-20 w-20 rounded-2xl border border-bark/10 object-cover"
              />
              <button
                type="button"
                onClick={() => onRemovePhoto(index)}
                aria-label={`Remove photo ${index + 1}`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-bark text-cream shadow-md transition-transform hover:scale-110"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {draft.photos.length < MAX_PHOTOS && (
            <label
              className={cn(
                'flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-bark/20 bg-cream/50 text-bark-light',
                'transition-colors hover:border-terracotta-400 hover:text-terracotta-600',
              )}
            >
              <CameraIcon className="h-6 w-6" aria-hidden />
              <span className="text-[11px] font-semibold">Add photo</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={onPhotoFiles}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-bark-light">
          No photo yet? No problem — the listing gets a friendly category badge instead.
        </p>
      </fieldset>
    </div>
  )
}

function DetailsStep({
  draft,
  showErrors,
  errors,
  setField,
}: {
  draft: ListItemDraft
  showErrors: boolean
  errors: Partial<Record<DraftField, string>>
  setField: (field: DraftField, value: ListItemDraft[DraftField]) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">The details</h2>
      <TextAreaField
        label="Description"
        required
        value={draft.description}
        maxLength={1000}
        rows={5}
        placeholder="What is it, what's included, and why is it great to borrow?"
        hint={`${draft.description.length}/1000 — honest and specific wins neighbors.`}
        onChange={(e) => setField('description', e.target.value)}
        error={fieldError(errors, showErrors, 'description')}
      />
      <TextField
        label="Condition"
        required
        value={draft.condition}
        maxLength={200}
        placeholder='e.g. "Good — one scuff, works perfectly"'
        onChange={(e) => setField('condition', e.target.value)}
        error={fieldError(errors, showErrors, 'condition')}
      />
    </div>
  )
}

function TermsStep({
  draft,
  showErrors,
  errors,
  setField,
}: {
  draft: ListItemDraft
  showErrors: boolean
  errors: Partial<Record<DraftField, string>>
  setField: (field: DraftField, value: ListItemDraft[DraftField]) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">Borrowing terms</h2>

      <TextField
        label="Max borrow duration (days)"
        required
        type="number"
        min={1}
        max={60}
        value={draft.maxDurationDays}
        placeholder="7"
        hint="How long can a neighbor keep it? (1–60)"
        onChange={(e) =>
          setField('maxDurationDays', e.target.value === '' ? '' : Number(e.target.value))
        }
        error={fieldError(errors, showErrors, 'maxDurationDays')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Deposit (Rs, optional)"
          type="number"
          min={0}
          max={200000}
          value={draft.depositAmount}
          placeholder="0"
          hint="Refunded on return. Leave empty for none."
          onChange={(e) =>
            setField('depositAmount', e.target.value === '' ? '' : Number(e.target.value))
          }
          error={fieldError(errors, showErrors, 'depositAmount')}
        />
        <TextField
          label="Daily fee (Rs, optional)"
          type="number"
          min={0}
          max={50000}
          value={draft.dailyFee}
          placeholder="0"
          hint="Most items are free — leave empty."
          onChange={(e) =>
            setField('dailyFee', e.target.value === '' ? '' : Number(e.target.value))
          }
          error={fieldError(errors, showErrors, 'dailyFee')}
        />
      </div>

      <SelectField
        label="Pickup preference"
        value={draft.pickupPreference}
        onChange={(e) =>
          setField('pickupPreference', e.target.value as ListItemDraft['pickupPreference'])
        }
      >
        <option value="either">Pickup or drop-off — whatever works</option>
        <option value="pickup">Pickup at my place</option>
        <option value="drop-off">I can drop it off</option>
      </SelectField>

      <TextAreaField
        label="Pickup instructions"
        required
        value={draft.pickupInstructions}
        maxLength={300}
        rows={3}
        placeholder="e.g. Porch pickup after 5pm — text when you're close."
        onChange={(e) => setField('pickupInstructions', e.target.value)}
        error={fieldError(errors, showErrors, 'pickupInstructions')}
      />
    </div>
  )
}

function PreviewStep({
  draft,
  ownerName,
  ownerAvatarUrl,
}: {
  draft: ListItemDraft
  ownerName: string
  ownerAvatarUrl: string
}) {
  const summary = useMemo(
    () =>
      [
        [
          'Category',
          `${CATEGORY_META[draft.category as keyof typeof CATEGORY_META]?.emoji ?? '📦'} ${draft.category}`,
        ],
        ['Max duration', `${draft.maxDurationDays} days`],
        [
          'Deposit',
          draft.depositAmount === '' || draft.depositAmount === 0
            ? 'None'
            : formatMoney(draft.depositAmount, 'PKR'),
        ],
        [
          'Daily fee',
          draft.dailyFee === '' || draft.dailyFee === 0
            ? 'Free'
            : `${formatMoney(draft.dailyFee, 'PKR')}/day`,
        ],
      ] as const,
    [draft],
  )

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">Preview</h2>
      <p className="text-sm text-bark-light">
        This is exactly what neighbors will see. Last chance to polish.
      </p>

      <article className="flex flex-col gap-3 overflow-hidden rounded-3xl border border-bark/10 bg-white shadow-sm">
        <ListingPhoto
          src={draft.photos[0]}
          alt={draft.title}
          emoji={categoryEmoji(draft.category)}
          className="aspect-[4/3] w-full"
          emojiClassName="text-6xl"
        />
        <div className="flex flex-col gap-2 p-4">
          <Badge tone="success" dot className="w-fit">
            Available
          </Badge>
          <p className="font-display text-lg font-bold text-bark">
            {draft.title || 'Untitled listing'}
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-bark-light">
            {draft.description}
          </p>
          <p className="text-sm text-bark">
            <span className="font-semibold">Condition: </span>
            {draft.condition}
          </p>
          <div className="flex items-center gap-2 border-t border-bark/10 pt-3">
            <img
              src={ownerAvatarUrl}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
              className="h-6 w-6 rounded-full object-cover"
            />
            <span className="text-xs font-medium text-bark-light">Shared by you — {ownerName}</span>
          </div>
        </div>
      </article>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summary.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-2xl bg-bark/5 p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-bark-light">
              {label}
            </dt>
            <dd className="text-sm font-semibold text-bark">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
