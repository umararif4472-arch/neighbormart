import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { APP_TAGLINE } from '@/config'
import { cn } from '@/utils/cn'

/**
 * The Open Door intro (brand program) — the signature cold-start
 * moment, shown once per browser session:
 *
 *  1. A closed door (the kit logo geometry, verbatim) bounces in on a
 *     terracotta field — warm charcoal in dark mode.
 *  2. While the app hydrates (Firebase, session, data), the doorknob
 *     pulses and the tagline fades in underneath.
 *  3. The moment hydration is ready — never on a timer — the tagline
 *     fades, the leaf swings open on its left hinge, warm light spills
 *     out, and the doorway zooms through into the app.
 *
 * Tap/click (or Enter/Space) skips. After 8s of loading a friendly
 * "taking longer" line appears; a hydration failure swaps in a retry.
 * prefers-reduced-motion gets a static door + plain fade. Session
 * flag `nm-door-seen`; `?nointro` bypasses entirely (dev/testing).
 */

const SEEN_KEY = 'nm-door-seen'
/** Let the entrance land before the door may open (~600ms total). */
const MIN_SHOW_MS = 600
const SLOW_MS = 8000
/** Swing duration is 700ms in CSS; start the zoom just before it ends. */
const OPEN_TO_EXIT_MS = 560
const EXIT_MS = 460

type Stage = 'enter' | 'open' | 'exit' | 'gone'

function introDisabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('nointro')) return true
    return window.sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function DoorIntro() {
  const { state, retryHydration } = useApp()
  const phase = state.hydration.phase

  const [disabled] = useState(introDisabled)
  const [reduced] = useState(prefersReducedMotion)
  const [stage, setStage] = useState<Stage>('enter')
  const [slow, setSlow] = useState(false)
  const [entranceDone, setEntranceDone] = useState(false)
  const skipRef = useRef(false)

  // The entrance beat: the door may not open before this elapses.
  useEffect(() => {
    if (disabled) return
    const t = window.setTimeout(() => setEntranceDone(true), MIN_SHOW_MS)
    return () => window.clearTimeout(t)
  }, [disabled])

  // Slow-load note: appears only while genuinely still loading.
  useEffect(() => {
    if (disabled || phase !== 'loading') {
      setSlow(false)
      return
    }
    const t = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(t)
  }, [disabled, phase])

  // Readiness drives the show — no artificial delay beyond the
  // entrance beat. Skipped/reduced-motion runs skip the swing.
  useEffect(() => {
    if (disabled || stage !== 'enter' || phase !== 'ready' || !entranceDone) return
    setStage(skipRef.current || reduced ? 'exit' : 'open')
  }, [disabled, stage, phase, reduced, entranceDone])

  useEffect(() => {
    if (stage !== 'open') return
    const t = window.setTimeout(() => setStage('exit'), OPEN_TO_EXIT_MS)
    return () => window.clearTimeout(t)
  }, [stage])

  useEffect(() => {
    if (stage !== 'exit') return
    const t = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(SEEN_KEY, '1')
      } catch {
        // Private mode — the intro simply replays next launch.
      }
      setStage('gone')
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [stage])

  if (disabled || stage === 'gone') return null

  const opening = stage === 'open' || stage === 'exit'
  const exiting = stage === 'exit'
  const failed = phase === 'error'

  const skip = () => {
    skipRef.current = true
    if (phase === 'ready' && stage === 'enter') setStage('exit')
    if (stage === 'open') setStage('exit')
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      onClick={skip}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault()
          skip()
        }
      }}
      className={cn(
        'nm-door-bg fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-7 px-6 transition-opacity duration-[450ms]',
        exiting && 'pointer-events-none opacity-0',
      )}
    >
      {/* Doorway: perspective stage + light spill + the door itself. */}
      <div
        className={cn(
          'relative transition-transform duration-[450ms] ease-in',
          exiting && 'scale-[3]',
        )}
        style={{ perspective: '900px' }}
      >
        {/* Warm light spilling from the doorway as the leaf opens. */}
        <div
          aria-hidden
          className={cn(
            'absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-700',
            opening ? 'scale-150 opacity-80' : 'scale-50 opacity-0',
          )}
          style={{
            background:
              'radial-gradient(circle, rgb(255 233 196 / 0.85) 0%, rgb(217 154 43 / 0.35) 45%, transparent 70%)',
            filter: 'blur(6px)',
          }}
        />
        <div className={cn('relative w-[min(58vw,280px)]', !reduced && 'nm-door-in')}>
          <svg viewBox="0 0 512 512" className="h-auto w-full" role="img" aria-label="NeighborMart door">
            <defs>
              <radialGradient id="nm-door-glow" cx="50%" cy="80%" r="80%">
                <stop offset="0%" stopColor="#FFE9C4" />
                <stop offset="55%" stopColor="#F6C87E" />
                <stop offset="100%" stopColor="#D99A2B" />
              </radialGradient>
            </defs>
            {/* Cream arch frame — kit geometry, verbatim. */}
            <path d="M146 372 V226 A110 110 0 0 1 366 226 V372 Z" fill="#F6EBDD" />
            {/* The lit room inside the frame (revealed as the leaf opens). */}
            <path d="M176 372 V230 A80 80 0 0 1 336 230 V372 Z" fill="url(#nm-door-glow)" />
            {/* Door leaf + knob, hinged on the leaf's left edge (x=176). */}
            <g className={cn('nm-door-leaf', opening && 'nm-door-leaf-open')}>
              <path d="M176 372 V230 A80 80 0 0 1 336 230 V372 Z" fill="#5E2815" />
              {!reduced && phase === 'loading' && (
                <circle className="nm-door-knob-halo" cx="312" cy="316" r="9" fill="#D99A2B" />
              )}
              <circle cx="312" cy="316" r="9" fill="#D99A2B" />
            </g>
            {/* Welcome mat. */}
            <rect x="126" y="372" width="260" height="22" rx="11" fill="#D99A2B" />
          </svg>
        </div>
      </div>

      {/* Tagline + status, fading away as the door opens. */}
      <div
        className={cn(
          'flex flex-col items-center gap-3 text-center transition-opacity duration-300',
          opening && 'opacity-0',
        )}
      >
        <div className={cn(!reduced && 'nm-fade-up')} style={{ animationDelay: '0.3s' }}>
          <p className="font-display text-xl font-semibold text-brand-cream sm:text-2xl">
            {APP_TAGLINE}
          </p>
        </div>
        {failed ? (
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <p className="max-w-xs text-sm text-brand-cream/85">
              We couldn&apos;t open the door — the neighborhood didn&apos;t load. Check your
              connection and try again.
            </p>
            <button
              type="button"
              onClick={retryHydration}
              className="rounded-full bg-brand-cream px-5 py-2.5 text-sm font-semibold text-terracotta-700 shadow-sm transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cream"
            >
              Try again
            </button>
          </div>
        ) : (
          slow &&
          phase === 'loading' && (
            <p className="text-sm text-brand-cream/85">This is taking longer than usual…</p>
          )
        )}
      </div>
    </div>
  )
}
