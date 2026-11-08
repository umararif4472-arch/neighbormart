import { useMemo, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Listing, ListingSection, ListingType, PriceUnit } from '@/types'
import { ITEM_CATEGORIES, LISTING_SECTIONS, PROPERTY_TYPES } from '@/types'
import { useApp } from '@/context/AppContext'
import { useListItemDraft } from './useListItemDraft'
import { listingsApi, toErrorMessage } from '@/services'
import { SECTION_META } from '@/utils/categoryMeta'
import { formatMoney } from '@/utils/money'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListingCard } from '@/components/listings/ListingCard'
import { CheckIcon, ChevronLeftIcon } from '@/components/icons'
import { PhotoUploader } from './PhotoUploader'
import {
  LIST_ITEM_STEPS,
  PHOTO_LIMITS,
  PHOTO_MINIMUM,
  buildCreateInput,
  buildPreviewListing,
  dealTypesFor,
  type DraftField,
  type FormErrors,
  type ListItemDraft,
} from './listItemForm'

/**
 * /list-item — the Phase 5 five-step listing wizard for ALL sections:
 * section & type → details → photos → price & place → preview & publish.
 *
 * State lives in ONE form reducer (listItemForm.ts) with localStorage
 * autosave. Publishing goes through listingsApi.createListing — the
 * shared service validator runs in buildCreateInput first, so a draft
 * that reaches the service is already valid on both backends.
 * Photos (Phase 4) are real Cloudinary uploads via PhotoUploader; only
 * finished upload URLs ever enter draft.photos.
 */
export function ListItemPage() {
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const { state: form, dispatch: dispatchForm, discard, publishSucceeded } = useListItemDraft()
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [published, setPublished] = useState<Listing | null>(null)
  /** In-flight photo uploads — navigation/publish wait for these. */
  const [pendingUploads, setPendingUploads] = useState(0)

  const step = LIST_ITEM_STEPS[form.stepIndex]
  const draft = form.draft
  const owner = state.currentUser

  function setField(field: DraftField, value: ListItemDraft[DraftField]) {
    dispatchForm({ type: 'field', field, value })
  }

  async function handlePublish() {
    if (!owner) return
    if (pendingUploads > 0) {
      setPublishError('Wait for your photos to finish uploading, then publish.')
      return
    }
    const built = buildCreateInput(draft, owner.id)
    if ('errors' in built) {
      setPublishError(Object.values(built.errors)[0] ?? 'Check the form and try again.')
      return
    }
    setPublishing(true)
    setPublishError(null)
    try {
      const listing = await listingsApi.createListing(built.input)
      dispatch({ type: 'LISTINGS_UPSERTED', listings: [listing] })
      publishSucceeded()
      setPublished(listing)
    } catch (error) {
      setPublishError(toErrorMessage(error))
    } finally {
      setPublishing(false)
    }
  }

  // --- Published ------------------------------------------------------------
  if (published) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-8 text-center">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-moss-100 dark:bg-moss-900/50 text-moss-700 dark:text-moss-300"
        >
          <CheckIcon className="h-8 w-8" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-bark">
            It&apos;s live on NeighborMart! 🎉
          </h1>
          <p className="mt-2 text-sm text-bark-light">
            {published.title} is now visible to neighbors in {published.location.area},{' '}
            {published.location.city}. We&apos;ll notify you the moment someone reaches out.
          </p>
        </div>
        <div className="flex w-full max-w-sm gap-2">
          <Link to={`/listing/${published.id}`} className="flex-1">
            <Button variant="secondary" className="w-full">
              View listing
            </Button>
          </Link>
          <Link to="/dashboard" className="flex-1">
            <Button variant="secondary" className="w-full">
              My dashboard
            </Button>
          </Link>
        </div>
        <Link
          to="/browse"
          className="text-sm font-semibold text-terracotta-700 dark:text-terracotta-300 underline-offset-4 hover:underline"
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
        title="Sign in to post a listing"
        message="You need a neighbor profile before you can list anything."
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-extrabold text-bark sm:text-3xl">
          Post a listing
        </h1>
        <p className="text-sm text-bark-light">
          An item, a vehicle, a place, an arena — five quick steps and it&apos;s live.
        </p>
      </header>

      {form.restored && form.dirty && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
        >
          <p>Welcome back — we kept your draft ({step.toLowerCase()} step).</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={discard}
            className="shrink-0 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50"
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
                  isCurrent
                    ? 'text-terracotta-700 dark:text-terracotta-300'
                    : isDone
                      ? 'text-moss-700 dark:text-moss-300'
                      : 'text-bark-light',
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

      <div className="rounded-3xl border border-bark/10 bg-surface p-5 shadow-sm sm:p-6">
        {form.stepIndex === 0 && (
          <SectionStep
            draft={draft}
            errors={form.errors}
            showErrors={form.showErrors}
            setField={setField}
          />
        )}
        {form.stepIndex === 1 && (
          <DetailsStep
            draft={draft}
            errors={form.errors}
            showErrors={form.showErrors}
            setField={setField}
          />
        )}
        {form.stepIndex === 2 && (
          <PhotosStep
            draft={draft}
            errors={form.errors}
            showErrors={form.showErrors}
            onPhotosChange={(urls) => dispatchForm({ type: 'photos_set', urls })}
            onPendingChange={setPendingUploads}
          />
        )}
        {form.stepIndex === 3 && (
          <PriceStep
            draft={draft}
            errors={form.errors}
            showErrors={form.showErrors}
            setField={setField}
            ownerArea={owner.neighborhood}
            ownerCity={owner.city}
          />
        )}
        {form.stepIndex === 4 && <PreviewStep draft={draft} owner={owner} />}
      </div>

      {publishError && (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 dark:bg-red-950/60 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
        >
          {publishError}
        </p>
      )}

      {form.stepIndex === 2 && pendingUploads > 0 && (
        <p role="status" className="text-center text-sm font-medium text-bark-light">
          Uploading {pendingUploads} photo{pendingUploads === 1 ? '' : 's'} — you can continue as
          soon as they finish.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          disabled={form.stepIndex === 2 && pendingUploads > 0}
          onClick={() =>
            form.stepIndex === 0 ? navigate('/browse') : dispatchForm({ type: 'back' })
          }
        >
          <ChevronLeftIcon className="h-4 w-4" />
          {form.stepIndex === 0 ? 'Cancel' : 'Back'}
        </Button>
        {form.stepIndex < LIST_ITEM_STEPS.length - 1 ? (
          <Button
            onClick={() => dispatchForm({ type: 'next' })}
            disabled={form.stepIndex === 2 && pendingUploads > 0}
          >
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
// Step panels
// ---------------------------------------------------------------------------

type StepProps = {
  draft: ListItemDraft
  errors: FormErrors
  showErrors: boolean
  setField: (field: DraftField, value: ListItemDraft[DraftField]) => void
}

function fieldError(errors: FormErrors, showErrors: boolean, field: DraftField | 'photos') {
  return showErrors ? errors[field] : undefined
}

const DEAL_LABEL: Record<ListingType, string> = {
  borrow: 'Borrow — free',
  rent: 'Rent — paid per period',
  sell: 'Sell — one price',
}

function SectionStep({ draft, errors, showErrors, setField }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">What are you listing?</h2>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Section">
        {LISTING_SECTIONS.map((section: ListingSection) => (
          <button
            key={section}
            type="button"
            aria-pressed={draft.section === section}
            onClick={() => setField('section', section)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors',
              draft.section === section
                ? 'border-terracotta-600 bg-terracotta-50 dark:bg-terracotta-900/50'
                : 'border-bark/15 bg-surface hover:border-terracotta-300 dark:border-terracotta-800',
            )}
          >
            <span className="text-2xl" aria-hidden>
              {SECTION_META[section].emoji}
            </span>
            <span className="text-sm font-bold text-bark">{SECTION_META[section].label}</span>
            <span className="text-xs text-bark-light">{SECTION_META[section].blurb}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Deal type">
        {dealTypesFor(draft.section).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={draft.listingType === type}
            onClick={() => setField('listingType', type)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
              draft.listingType === type
                ? 'border-moss-600 bg-moss-600 text-white'
                : 'border-bark/15 bg-surface text-bark-light hover:border-moss-400',
            )}
          >
            {DEAL_LABEL[type]}
          </button>
        ))}
      </div>
      {fieldError(errors, showErrors, 'listingType') && (
        <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">
          {errors.listingType}
        </p>
      )}

      <TextField
        label="Title"
        required
        value={draft.title}
        maxLength={80}
        placeholder="e.g. Toyota Corolla GLi 2021 — neat & clean"
        hint="What would a neighbor type to find this?"
        onChange={(e) => setField('title', e.target.value)}
        error={fieldError(errors, showErrors, 'title')}
      />
    </div>
  )
}

function DetailsStep({ draft, errors, showErrors, setField }: StepProps) {
  const num = (field: DraftField) => ({
    value: draft[field] as number | '',
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      setField(field, e.target.value === '' ? '' : Number(e.target.value)),
  })
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">The details</h2>
      <TextAreaField
        label="Description"
        required
        value={draft.description}
        maxLength={1000}
        rows={5}
        placeholder="What is it, what's included, and why is it a good deal?"
        hint={`${draft.description.length}/1000 — honest and specific wins neighbors.`}
        onChange={(e) => setField('description', e.target.value)}
        error={fieldError(errors, showErrors, 'description')}
      />

      {draft.section === 'items' && (
        <>
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
                {category}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Condition"
            required
            value={draft.condition}
            maxLength={200}
            placeholder='e.g. "Good — one scuff, works perfectly"'
            onChange={(e) => setField('condition', e.target.value)}
            error={fieldError(errors, showErrors, 'condition')}
          />
          {draft.listingType !== 'sell' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Max duration (days)"
                  required
                  type="number"
                  min={1}
                  max={60}
                  placeholder="7"
                  {...num('maxDurationDays')}
                  error={fieldError(errors, showErrors, 'maxDurationDays')}
                />
                <TextField
                  label="Deposit (Rs, optional)"
                  type="number"
                  min={0}
                  max={200000}
                  placeholder="0"
                  hint="Refunded on return."
                  {...num('depositAmount')}
                  error={fieldError(errors, showErrors, 'depositAmount')}
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
                placeholder="e.g. Porch pickup after 5pm — message when you're close."
                onChange={(e) => setField('pickupInstructions', e.target.value)}
                error={fieldError(errors, showErrors, 'pickupInstructions')}
              />
            </>
          )}
        </>
      )}

      {draft.section === 'vehicles' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Make"
              required
              value={draft.make}
              placeholder="Toyota"
              onChange={(e) => setField('make', e.target.value)}
              error={fieldError(errors, showErrors, 'make')}
            />
            <TextField
              label="Model"
              required
              value={draft.model}
              placeholder="Corolla GLi"
              onChange={(e) => setField('model', e.target.value)}
              error={fieldError(errors, showErrors, 'model')}
            />
            <TextField
              label="Year"
              required
              type="number"
              placeholder="2021"
              {...num('year')}
              error={fieldError(errors, showErrors, 'year')}
            />
            <TextField
              label="Mileage (km)"
              required
              type="number"
              placeholder="45000"
              {...num('mileageKm')}
              error={fieldError(errors, showErrors, 'mileageKm')}
            />
            <SelectField
              label="Fuel"
              value={draft.fuelType}
              onChange={(e) => setField('fuelType', e.target.value as ListItemDraft['fuelType'])}
            >
              {(['petrol', 'diesel', 'cng', 'hybrid', 'electric'] as const).map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Transmission"
              value={draft.transmission}
              onChange={(e) =>
                setField('transmission', e.target.value as ListItemDraft['transmission'])
              }
            >
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </SelectField>
          </div>
          <TextField
            label="Condition"
            required
            value={draft.condition}
            maxLength={200}
            placeholder='e.g. "Total genuine, new tyres"'
            onChange={(e) => setField('condition', e.target.value)}
            error={fieldError(errors, showErrors, 'condition')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Registration city"
              required
              value={draft.registrationCity}
              placeholder="Lahore"
              onChange={(e) => setField('registrationCity', e.target.value)}
              error={fieldError(errors, showErrors, 'registrationCity')}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-bark">
              <input
                type="checkbox"
                checked={draft.withDriver}
                className="h-4 w-4 accent-terracotta-600"
                onChange={(e) => setField('withDriver', e.target.checked)}
              />
              Comes with a driver
            </label>
          </div>
        </>
      )}

      {draft.section === 'properties' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Property type"
              required
              value={draft.propertyType}
              onChange={(e) =>
                setField('propertyType', e.target.value as ListItemDraft['propertyType'])
              }
              error={fieldError(errors, showErrors, 'propertyType')}
            >
              <option value="" disabled>
                Pick a type…
              </option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </SelectField>
            <div className="flex gap-2">
              <TextField
                label="Area size"
                required
                type="number"
                placeholder="10"
                {...num('areaSize')}
                error={fieldError(errors, showErrors, 'areaSize')}
                className="flex-1"
              />
              <SelectField
                label="Unit"
                value={draft.areaUnit}
                onChange={(e) => setField('areaUnit', e.target.value as ListItemDraft['areaUnit'])}
              >
                {(['marla', 'kanal', 'sqft', 'sqyd'] as const).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextField
              label="Bedrooms (if any)"
              type="number"
              placeholder="3"
              {...num('bedrooms')}
              error={fieldError(errors, showErrors, 'bedrooms')}
            />
            <TextField
              label="Bathrooms (if any)"
              type="number"
              placeholder="2"
              {...num('bathrooms')}
              error={fieldError(errors, showErrors, 'bathrooms')}
            />
            <TextField
              label="Available from"
              type="date"
              value={draft.availableFrom}
              onChange={(e) => setField('availableFrom', e.target.value)}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-bark">
              <input
                type="checkbox"
                checked={draft.furnished}
                className="h-4 w-4 accent-terracotta-600"
                onChange={(e) => setField('furnished', e.target.checked)}
              />
              Furnished
            </label>
          </div>
          <TextField
            label="Amenities (comma-separated)"
            value={draft.amenities}
            placeholder="Parking, UPS, Separate gate"
            onChange={(e) => setField('amenities', e.target.value)}
          />
        </>
      )}

      {draft.section === 'arenas' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Sports (comma-separated)"
              required
              value={draft.sportTypes}
              placeholder="Futsal, Cricket"
              onChange={(e) => setField('sportTypes', e.target.value)}
              error={fieldError(errors, showErrors, 'sportTypes')}
            />
            <TextField
              label="Surface"
              required
              value={draft.surface}
              placeholder="Astro turf"
              onChange={(e) => setField('surface', e.target.value)}
              error={fieldError(errors, showErrors, 'surface')}
            />
            <TextField
              label="Capacity (people)"
              required
              type="number"
              placeholder="40"
              {...num('capacity')}
              error={fieldError(errors, showErrors, 'capacity')}
            />
            <SelectField
              label="Slot length"
              value={String(draft.slotMinutes)}
              onChange={(e) => setField('slotMinutes', Number(e.target.value))}
            >
              {[30, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </SelectField>
            <TextField
              label="Opens at"
              type="time"
              value={draft.opens}
              onChange={(e) => setField('opens', e.target.value)}
              error={fieldError(errors, showErrors, 'opens')}
            />
            <TextField
              label="Closes at"
              type="time"
              value={draft.closes}
              onChange={(e) => setField('closes', e.target.value)}
            />
            <TextField
              label="Min. booking notice (hours)"
              type="number"
              placeholder="2"
              {...num('minAdvanceHours')}
            />
            <TextField
              label="Book ahead up to (days)"
              type="number"
              placeholder="14"
              {...num('maxAdvanceDays')}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-bark">Facilities</legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['floodlights', 'Floodlights'],
                  ['parking', 'Parking'],
                  ['washrooms', 'Washrooms'],
                  ['changingRooms', 'Changing rooms'],
                ] as Array<[DraftField, string]>
              ).map(([field, label]) => (
                <label
                  key={field}
                  className="flex items-center gap-2 text-sm font-medium text-bark"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(draft[field])}
                    className="h-4 w-4 accent-terracotta-600"
                    onChange={(e) => setField(field, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  )
}

function PhotosStep({
  draft,
  errors,
  showErrors,
  onPhotosChange,
  onPendingChange,
}: {
  draft: ListItemDraft
  errors: FormErrors
  showErrors: boolean
  onPhotosChange: (urls: string[]) => void
  onPendingChange: (pending: number) => void
}) {
  const limit = PHOTO_LIMITS[draft.section]
  const minimum = PHOTO_MINIMUM[draft.section] ?? 0
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">Photos</h2>
      <p className="text-sm text-bark-light">
        {minimum > 0
          ? `This section needs at least ${minimum} uploaded photos to publish (up to ${limit}). `
          : `Photos are optional but listings with them get far more interest (up to ${limit}). `}
        The first photo is the cover — drag tiles or use “Make cover” to change it. Photos upload as
        you add them; only finished uploads count.
      </p>

      <PhotoUploader
        section={draft.section}
        photos={draft.photos}
        onPhotosChange={onPhotosChange}
        onPendingChange={onPendingChange}
      />

      {fieldError(errors, showErrors, 'photos') && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
          {errors.photos}
        </p>
      )}
    </div>
  )
}

const PRICE_UNITS: Array<{ value: PriceUnit; label: string }> = [
  { value: 'hour', label: 'per hour' },
  { value: 'day', label: 'per day' },
  { value: 'week', label: 'per week' },
  { value: 'month', label: 'per month' },
]

function PriceStep({
  draft,
  errors,
  showErrors,
  setField,
  ownerArea,
  ownerCity,
}: StepProps & { ownerArea: string; ownerCity: string }) {
  const unitOptions =
    draft.section === 'properties'
      ? PRICE_UNITS.filter((u) => u.value === 'month' || u.value === 'week')
      : PRICE_UNITS
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">Price & place</h2>

      {draft.listingType === 'borrow' ? (
        <p className="rounded-2xl bg-moss-50 dark:bg-moss-900/50 px-4 py-3 text-sm font-semibold text-moss-900 dark:text-moss-100">
          Free borrow — neighbors lend this one for nothing. Karma points included.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label={draft.listingType === 'sell' ? 'Asking price (Rs)' : 'Price (Rs)'}
              required
              type="number"
              min={1}
              placeholder="5000"
              value={draft.price}
              onChange={(e) =>
                setField('price', e.target.value === '' ? '' : Number(e.target.value))
              }
              error={fieldError(errors, showErrors, 'price')}
              className="flex-1"
            />
            {draft.listingType === 'rent' && draft.section !== 'arenas' && (
              <SelectField
                label="Charged"
                value={draft.priceUnit}
                onChange={(e) => setField('priceUnit', e.target.value as PriceUnit)}
              >
                {unitOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </SelectField>
            )}
            {draft.section === 'arenas' && (
              <p className="pb-2 text-sm font-medium text-bark-light">charged per hour</p>
            )}
          </div>
          {draft.listingType === 'sell' && (
            <label className="flex items-center gap-2 text-sm font-medium text-bark">
              <input
                type="checkbox"
                checked={draft.negotiable}
                className="h-4 w-4 accent-terracotta-600"
                onChange={(e) => setField('negotiable', e.target.checked)}
              />
              Open to offers (negotiable)
            </label>
          )}
          {draft.price !== '' && Number(draft.price) > 0 && (
            <p className="text-sm text-bark-light">
              Neighbors will see:{' '}
              <span className="font-semibold text-bark">
                {formatMoney(Number(draft.price), 'PKR')}
                {draft.listingType === 'rent'
                  ? ` per ${draft.section === 'arenas' ? 'hour' : draft.priceUnit}`
                  : ''}
              </span>
            </p>
          )}
        </>
      )}

      <div className="rounded-2xl bg-bark/5 p-4 text-sm">
        <p className="font-semibold text-bark">Location</p>
        <p className="mt-1 text-bark-light">
          Your listing is placed at your home area — {ownerArea}, {ownerCity} — so nearby neighbors
          find it first. (Per-listing locations arrive in a later update.)
        </p>
      </div>
    </div>
  )
}

function PreviewStep({
  draft,
  owner,
}: {
  draft: ListItemDraft
  owner: NonNullable<ReturnType<typeof useApp>['state']['currentUser']>
}) {
  const preview = useMemo(() => buildPreviewListing(draft, owner), [draft, owner])
  const built = useMemo(() => buildCreateInput(draft, owner.id), [draft, owner.id])
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold text-bark">Preview & publish</h2>
      {preview ? (
        <>
          <p className="text-sm text-bark-light">This is exactly the card neighbors will see.</p>
          <div className="mx-auto w-full max-w-sm">
            <ListingCard listing={preview} owner={owner} ownerTier={null} distanceKm={null} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/60 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
          <p className="font-semibold">A few things still need fixing:</p>
          <ul className="mt-1 list-disc pl-5">
            {'errors' in built &&
              Object.values(built.errors).map((message) => <li key={message}>{message}</li>)}
          </ul>
          <p className="mt-1">Use Back to fix them, then return here.</p>
        </div>
      )}
    </div>
  )
}
