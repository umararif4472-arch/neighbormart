import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '@/context/AppContext'
import { APP_TAGLINE } from '@/config'
import { cn } from '@/utils/cn'

/**
 * The Open Door intro (brand program) — the signature cold-start
 * moment, shown once per browser session. Part 1 rework: the door no
 * longer cross-fades into a separately rendered app. This component
 * WRAPS the real app:
 *
 *  - The destination wrapper below renders the actual routed page
 *    from the first frame, scaled down about the doorway centre by
 *    s0 = doorwayWidth / viewportWidth, so the whole live page sits
 *    miniaturised inside the doorway.
 *  - On top sits a wall layer (terracotta in light mode, warm
 *    charcoal in dark) drawn as a viewport-sized SVG rect with the
 *    arch doorway subtracted (fill-rule="evenodd") — a genuine
 *    cutout, not a painted backdrop. Through it you see the real
 *    page, tinted by a warm glow layer that fades as the zoom ends.
 *  - When hydration is ready (AppContext is the source of truth,
 *    never a bare timer) the kit door leaf swings on its left hinge,
 *    then the camera zooms through: the destination scales s0 → 1
 *    while the wall scales 1 → 1/s0 about the same centre and fades
 *    in the last stretch. At the end the plain app renders with NO
 *    wrapper transform at all — no jump, flicker or second reveal.
 *
 * Signed-in sessions (AppContext has a user at ready) get a
 * compressed ~1.2s version; signed-out gets the full ~2.7–3.0s.
 * Tap/click (or Enter/Space/Escape) skips to the end fade. After 8s
 * of loading a friendly "taking longer" line appears; a hydration
 * failure swaps in a retry. prefers-reduced-motion gets a static
 * door + plain cross-fade (no swing, no zoom, destination unscaled).
 * Session flag `nm-door-seen`; `?nointro` bypasses entirely.
 */

const SEEN_KEY = 'nm-door-seen'
const SLOW_MS = 8000

export type DoorStage = 'enter' | 'open' | 'zoom' | 'exit' | 'gone'

export interface DoorTiming {
  /** Minimum on-screen gate before the door may open. */
  minShowMs: number
  /** How long the leaf swings before the zoom starts. */
  swingMs: number
  /** Zoom-through duration. */
  zoomMs: number
  /** Final fade (skip / reduced-motion) duration. */
  exitMs: number
}

export const DOOR_TIMING_SIGNED_OUT: DoorTiming = {
  minShowMs: 1100,
  swingMs: 650,
  zoomMs: 950,
  exitMs: 450,
}
export const DOOR_TIMING_SIGNED_IN: DoorTiming = {
  minShowMs: 350,
  swingMs: 250,
  zoomMs: 550,
  exitMs: 350,
}

export function doorTiming(signedIn: boolean): DoorTiming {
  return signedIn ? DOOR_TIMING_SIGNED_IN : DOOR_TIMING_SIGNED_OUT
}

export function doorTotalMs(timing: DoorTiming): number {
  return timing.minShowMs + timing.swingMs + timing.zoomMs
}

/** Stage the intro moves to once hydration is ready and the gate passed. */
export function stageOnReady(opts: { reduced: boolean; skipped: boolean }): DoorStage {
  return opts.reduced || opts.skipped ? 'exit' : 'open'
}

/** Stage a skip lands on (null = record the skip, wait for readiness). */
export function stageOnSkip(stage: DoorStage, ready: boolean): DoorStage | null {
  if (stage === 'enter') return ready ? 'exit' : null
  if (stage === 'open') return 'exit'
  return null
}

// ---------------------------------------------------------------------------
// Doorway geometry — one source of truth shared by the wall cutout, the
// door artwork, the glow and both zoom transforms. The kit door SVG is
// 512×512; the doorway (inner arch) spans x 176–336, arch centre y 230
// r 80, bottom y 372, so its bbox is 160 wide × 222 tall, centre (256, 261).
// ---------------------------------------------------------------------------

export interface DoorwayGeometry {
  doorBoxSize: number
  doorBoxLeft: number
  doorBoxTop: number
  doorwayWidth: number
  doorwayHeight: number
  doorwayLeft: number
  doorwayTop: number
  doorwayBottom: number
  doorwayArcY: number
  doorwayRadius: number
  centerX: number
  centerY: number
  /** Destination start scale: the whole viewport squeezed to doorway width. */
  s0: number
}

export function doorwayGeometry(viewportW: number, viewportH: number): DoorwayGeometry {
  const doorBoxSize = Math.min(viewportW * 0.58, 280)
  const k = doorBoxSize / 512
  const doorBoxLeft = viewportW / 2 - doorBoxSize / 2
  const doorBoxTop = viewportH / 2 - doorBoxSize / 2
  const doorwayLeft = doorBoxLeft + 176 * k
  const doorwayTop = doorBoxTop + 150 * k
  return {
    doorBoxSize,
    doorBoxLeft,
    doorBoxTop,
    doorwayWidth: 160 * k,
    doorwayHeight: 222 * k,
    doorwayLeft,
    doorwayTop,
    doorwayBottom: doorBoxTop + 372 * k,
    doorwayArcY: doorBoxTop + 230 * k,
    doorwayRadius: 80 * k,
    centerX: doorwayLeft + 80 * k,
    centerY: doorBoxTop + 261 * k,
    s0: (160 * k) / Math.max(viewportW, 1),
  }
}

/** SVG path for the arch doorway at pixel coordinates (for the wall cutout). */
export function doorwayPath(g: DoorwayGeometry): string {
  const right = g.doorwayLeft + g.doorwayWidth
  return (
    `M ${g.doorwayLeft} ${g.doorwayBottom} L ${g.doorwayLeft} ${g.doorwayArcY} ` +
    `A ${g.doorwayRadius} ${g.doorwayRadius} 0 0 1 ${right} ${g.doorwayArcY} ` +
    `L ${right} ${g.doorwayBottom} Z`
  )
}

/** Session / URL gate: pure core of the replay prevention. */
export function introShouldSkip(opts: { search: string; seen: string | null }): boolean {
  if (new URLSearchParams(opts.search).has('nointro')) return true
  return opts.seen === '1'
}

function introDisabled(): boolean {
  try {
    return introShouldSkip({
      search: window.location.search,
      seen: window.sessionStorage.getItem(SEEN_KEY),
    })
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Private mode — the intro simply replays next launch.
  }
}

export function DoorIntro({ children }: { children: ReactNode }) {
  const { state, retryHydration } = useApp()
  const phase = state.hydration.phase
  const signedIn = state.currentUser != null
  const timing = doorTiming(signedIn)

  const [disabled] = useState(introDisabled)
  const [reduced] = useState(prefersReducedMotion)
  const [stage, setStage] = useState<DoorStage>('enter')
  const [slow, setSlow] = useState(false)
  const [gateFast, setGateFast] = useState(false)
  const [gateFull, setGateFull] = useState(false)
  const [viewport, setViewport] = useState(() =>
    typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: 1024, h: 768 },
  )
  const skipRef = useRef(false)
  // Timing captured when the door starts opening, so a session flag
  // flipping mid-run cannot change the running durations.
  const [runTiming, setRunTiming] = useState<DoorTiming>(timing)

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Entrance gates: the door may not open before these elapse (the
  // signed-in gate is the short one; which applies is chosen at ready).
  useEffect(() => {
    if (disabled) return
    const a = window.setTimeout(() => setGateFast(true), DOOR_TIMING_SIGNED_IN.minShowMs)
    const b = window.setTimeout(() => setGateFull(true), DOOR_TIMING_SIGNED_OUT.minShowMs)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
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

  // Readiness drives the show — no artificial delay beyond the gate.
  useEffect(() => {
    if (disabled || stage !== 'enter' || phase !== 'ready') return
    if (signedIn ? !gateFast : !gateFull) return
    setRunTiming(timing)
    setStage(stageOnReady({ reduced, skipped: skipRef.current }))
  }, [disabled, stage, phase, reduced, signedIn, gateFast, gateFull, timing])

  useEffect(() => {
    if (stage !== 'open') return
    const t = window.setTimeout(() => setStage('zoom'), runTiming.swingMs)
    return () => window.clearTimeout(t)
  }, [stage, runTiming])

  useEffect(() => {
    if (stage !== 'zoom') return
    const t = window.setTimeout(() => {
      markSeen()
      setStage('gone')
    }, runTiming.zoomMs)
    return () => window.clearTimeout(t)
  }, [stage, runTiming])

  useEffect(() => {
    if (stage !== 'exit') return
    const t = window.setTimeout(() => {
      markSeen()
      setStage('gone')
    }, runTiming.exitMs)
    return () => window.clearTimeout(t)
  }, [stage, runTiming])

  if (disabled || stage === 'gone') return <>{children}</>

  const opening = stage === 'open' || stage === 'zoom'
  const zooming = stage === 'zoom'
  const exiting = stage === 'exit'
  const failed = phase === 'error'
  const g = doorwayGeometry(viewport.w, viewport.h)
  const run = runTiming
  const origin = `${g.centerX}px ${g.centerY}px`

  const skip = () => {
    skipRef.current = true
    const next = stageOnSkip(stage, phase === 'ready')
    if (next) {
      setRunTiming(timing)
      setStage(next)
    }
  }

  // Destination: unscaled for reduced motion (plain cross-fade only);
  // otherwise miniaturised into the doorway until the zoom carries it
  // to exactly 1. On 'exit' it also returns to 1 under the fading wall.
  const destScale = reduced || zooming || exiting ? 1 : g.s0
  const destTransitionMs = zooming ? run.zoomMs : exiting ? run.exitMs : 0

  return (
    <>
      {/* The real page, underneath from the first frame. Input is
          disabled until the intro completes; the wall covers it. */}
      <div
        data-door-destination="true"
        aria-hidden
        style={{
          transform: `scale(${destScale})`,
          transformOrigin: origin,
          transition:
            destTransitionMs > 0
              ? `transform ${destTransitionMs}ms cubic-bezier(0.6, 0, 0.3, 1)`
              : undefined,
          pointerEvents: 'none',
        }}
      >
        {children}
      </div>

      {/* Warm light inside the doorway — over the miniaturised page,
          under the wall; fades away as the zoom completes. */}
      <div
        aria-hidden
        data-door-glow="true"
        className="pointer-events-none fixed z-[95]"
        style={{
          left: g.doorwayLeft,
          top: g.doorwayTop,
          width: g.doorwayWidth,
          height: g.doorwayHeight,
          borderTopLeftRadius: g.doorwayRadius,
          borderTopRightRadius: g.doorwayRadius,
          background:
            'radial-gradient(circle at 50% 80%, rgb(255 233 196 / 0.9) 0%, rgb(217 154 43 / 0.4) 55%, transparent 75%)',
          opacity: opening && !zooming ? 0.85 : 0,
          transition: `opacity ${zooming ? run.zoomMs : 500}ms ease`,
        }}
      />

      {/* The wall: full-viewport SVG with the doorway cut out of it,
          plus the kit door in front of the cutout. The whole layer
          zooms about the doorway centre and fades in the last stretch. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Skip intro"
        data-door-wall="true"
        onClick={skip}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault()
            skip()
          }
        }}
        className="fixed inset-0 z-[100] cursor-pointer"
        style={{
          transform: zooming && !reduced ? `scale(${1 / g.s0})` : undefined,
          transformOrigin: origin,
          opacity: exiting || zooming ? 0 : 1,
          transition: zooming
            ? `transform ${run.zoomMs}ms cubic-bezier(0.6, 0, 0.3, 1), opacity 330ms ease ${Math.max(run.zoomMs - 330, 0)}ms`
            : exiting
              ? `opacity ${run.exitMs}ms ease`
              : undefined,
          pointerEvents: exiting || zooming ? 'none' : undefined,
        }}
      >
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${viewport.w} ${viewport.h}`}
          preserveAspectRatio="none"
        >
          <path
            fillRule="evenodd"
            className="nm-door-wall-fill"
            d={`M 0 0 H ${viewport.w} V ${viewport.h} H 0 Z ${doorwayPath(g)}`}
          />
        </svg>

        {/* The kit door, exactly over the doorway cutout. */}
        <div
          className={cn('absolute', !reduced && 'nm-door-in')}
          style={{
            left: g.doorBoxLeft,
            top: g.doorBoxTop,
            width: g.doorBoxSize,
            height: g.doorBoxSize,
            perspective: '900px',
          }}
        >
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
            {/* The lit room inside the frame. Fades out the moment the
                leaf opens so the REAL page shows through the doorway,
                tinted by the glow layer above it. */}
            <path
              d="M176 372 V230 A80 80 0 0 1 336 230 V372 Z"
              fill="url(#nm-door-glow)"
              style={{ opacity: opening ? 0 : 1, transition: 'opacity 200ms ease' }}
            />
            {/* Door leaf + knob, hinged on the leaf's left edge (x=176). */}
            <g
              className={cn(
                'nm-door-leaf',
                opening && 'nm-door-leaf-open',
                signedIn && 'nm-door-leaf-fast',
              )}
            >
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

        {/* Tagline + status under the door, fading as it opens. */}
        <div
          className={cn(
            'absolute left-1/2 flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-3 px-6 text-center transition-opacity duration-300',
            opening && 'opacity-0',
          )}
          style={{ top: g.doorBoxTop + g.doorBoxSize + 24 }}
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
                className="rounded-full bg-brand-cream px-5 py-2.5 text-sm font-semibold text-door shadow-sm transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cream"
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
    </>
  )
}
