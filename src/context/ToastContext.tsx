import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/utils/cn'

/**
 * Tiny toast system for ephemeral moments (tier-ups, trust changes,
 * issue-report confirmations). UI-only state — deliberately separate from
 * the app data context.
 */

export type ToastTone = 'success' | 'info' | 'warning' | 'danger'

export interface ToastOptions {
  title: string
  body?: string
  tone?: ToastTone
  emoji?: string
  /** ms before auto-dismiss (default 6s). */
  durationMs?: number
}

interface ToastItem extends Required<Pick<ToastOptions, 'title' | 'tone' | 'emoji'>> {
  id: number
  body?: string
}

interface ToastContextValue {
  push: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_EMOJI: Record<ToastTone, string> = {
  success: '🎉',
  info: '💡',
  warning: '⚠️',
  danger: '🚨',
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-moss-300 bg-moss-50 text-moss-900',
  info: 'border-terracotta-200 bg-terracotta-50 text-terracotta-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  danger: 'border-red-300 bg-red-50 text-red-900',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const push = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    const item: ToastItem = {
      id,
      title: options.title,
      body: options.body,
      tone: options.tone ?? 'info',
      emoji: options.emoji ?? DEFAULT_EMOJI[options.tone ?? 'info'],
    }
    // Keep at most 3 toasts on screen.
    setToasts((current) => [...current, item].slice(-3))
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, options.durationMs ?? 6000)
    timers.current.push(timer)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toaster — fixed above the mobile tab bar, announced politely */}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-3xl border p-4 shadow-xl',
              'motion-safe:animate-[toast-in_.3s_ease-out]',
              TONE_STYLES[toast.tone],
            )}
          >
            <span aria-hidden className="text-xl leading-none">
              {toast.emoji}
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold">{toast.title}</p>
              {toast.body && (
                <p className="mt-0.5 text-xs leading-relaxed opacity-90">{toast.body}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a <ToastProvider>')
  return context
}
