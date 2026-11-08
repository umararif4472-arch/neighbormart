import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'
import { Spinner } from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Visually (and functionally) disabled but still focusable for a11y. */
  ariaDisabled?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-terracotta-600 text-white hover:bg-terracotta-700 active:bg-terracotta-800 shadow-sm',
  secondary:
    'bg-surface text-bark border border-bark/15 hover:border-terracotta-300 dark:border-terracotta-800 hover:text-terracotta-700 dark:hover:text-terracotta-300 shadow-sm',
  ghost:
    'text-terracotta-700 dark:text-terracotta-300 hover:bg-terracotta-50 dark:hover:bg-terracotta-900/50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

/** The one button in the app — rounded, warm, keyboard-friendly. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    ariaDisabled,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading || ariaDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-full font-semibold transition-colors',
        'outline-offset-2 focus-visible:outline-2 focus-visible:outline-terracotta-600',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  )
})
