import { cn } from '@/utils/cn'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const

/** Accessible loading indicator — pair with visible text where possible. */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      className={cn('animate-spin text-terracotta-600', SIZES[size], className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Full-screen loading state (app hydration). */
export function LoadingScreen({ label = 'Meeting the neighbors…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream">
      <Spinner size="lg" />
      <p className="text-sm font-medium text-bark-light">{label}</p>
    </div>
  )
}
