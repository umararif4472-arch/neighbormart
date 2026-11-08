import { useId, useState } from 'react'
import { cn } from '@/utils/cn'
import { StarIcon } from '@/components/icons'

export interface StarInputProps {
  value: number
  onChange: (value: number) => void
  error?: string | undefined
  /** Legend text (a11y) — e.g. "Rate your borrow". */
  legend: string
}

/**
 * Accessible 1–5 star picker: real radio inputs (keyboard-navigable for
 * free) with large friendly hit areas. Empty value is an explicit choice —
 * validation error shows below, not a silent disable.
 */
export function StarInput({ value, onChange, error, legend }: StarInputProps) {
  const name = useId()
  const [hover, setHover] = useState(0)
  const filled = hover || value

  return (
    <div className="flex flex-col gap-1.5">
      <fieldset className="flex flex-col gap-1.5" onMouseLeave={() => setHover(0)}>
        <legend className="text-sm font-semibold text-bark">
          {legend}
          <span aria-hidden className="ml-1 text-terracotta-600">
            *
          </span>
        </legend>
        <div className="flex gap-1" role="radiogroup" aria-label={legend}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label
              key={star}
              onMouseEnter={() => setHover(star)}
              className={cn(
                'cursor-pointer rounded-xl p-1 transition-transform',
                'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terracotta-600',
                hover >= star && 'scale-110',
              )}
            >
              <input
                type="radio"
                name={name}
                checked={value === star}
                onChange={() => onChange(star)}
                className="sr-only"
              />
              <StarIcon
                filled={star <= filled}
                className={cn(
                  'h-8 w-8 transition-colors',
                  star <= filled ? 'text-amber-400' : 'text-bark/20 hover:text-amber-200',
                )}
              />
              <span className="sr-only">
                {star} {star === 1 ? 'star' : 'stars'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
