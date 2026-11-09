/**
 * DoorIntro (Part 1 rework) — the door opens onto the REAL page.
 *
 * No jsdom / testing-library is installed in this repo and the suite
 * runs in a node environment, so coverage is at two levels:
 *  - SSR (react-dom/server): the wrapped page is present in the DOM
 *    beneath the wall from the very first render, the wall + doorway
 *    cutout + tagline render, and the destination carries the
 *    miniaturising doorway scale.
 *  - Pure helpers exported from DoorIntro: geometry (s0, centre),
 *    the session/?nointro replay gate, signed-in/out timings, and
 *    the stage transitions for ready / skip / reduced-motion.
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { AppProvider } from '@/context/AppContext'
import {
  DoorIntro,
  doorwayGeometry,
  doorwayPath,
  doorTiming,
  doorTotalMs,
  introShouldSkip,
  stageOnReady,
  stageOnSkip,
  DOOR_TIMING_SIGNED_IN,
  DOOR_TIMING_SIGNED_OUT,
} from './DoorIntro'

describe('DoorIntro SSR — real page beneath the wall', () => {
  it('renders the wrapped page content in the destination from first render', () => {
    const html = renderToString(
      createElement(
        AppProvider,
        null,
        createElement(
          DoorIntro,
          null,
          createElement('main', null, 'REAL PAGE MARKER'),
        ),
      ),
    )
    expect(html).toContain('REAL PAGE MARKER')
    // Destination wrapper + wall both present, page inside destination.
    expect(html).toContain('data-door-destination="true"')
    expect(html).toContain('data-door-wall="true"')
    expect(html.indexOf('data-door-destination')).toBeLessThan(html.indexOf('REAL PAGE MARKER'))
    // The wall is an SVG cutout (evenodd) and the tagline shows.
    expect(html).toContain('fill-rule="evenodd"')
    expect(html).toContain('Everything behind the door')
    // Destination starts miniaturised into the doorway (scale < 1).
    const dest = html.slice(html.indexOf('data-door-destination'))
    const scale = /scale\(([0-9.]+)\)/.exec(dest)
    expect(scale).not.toBeNull()
    expect(Number(scale![1])).toBeGreaterThan(0)
    expect(Number(scale![1])).toBeLessThan(1)
  })
})

describe('doorway geometry', () => {
  it('s0 squeezes the viewport exactly to doorway width, centred', () => {
    const g = doorwayGeometry(1280, 800)
    expect(g.doorBoxSize).toBe(280)
    expect(g.doorwayWidth).toBeCloseTo(87.5)
    expect(g.s0).toBeCloseTo(g.doorwayWidth / 1280)
    expect(g.centerX).toBe(640)
    expect(g.doorwayLeft + g.doorwayWidth / 2).toBeCloseTo(g.centerX)
  })

  it('scales responsively on a small phone viewport', () => {
    const g = doorwayGeometry(360, 640)
    expect(g.doorBoxSize).toBeCloseTo(208.8)
    expect(g.s0).toBeLessThan(0.2)
    expect(g.centerX).toBe(180)
  })

  it('doorway path is an arch (line, arc, line)', () => {
    const d = doorwayPath(doorwayGeometry(1280, 800))
    expect(d).toContain(' A ')
    expect(d.endsWith('Z')).toBe(true)
  })
})

describe('session gate — intro plays once per session', () => {
  it('skips when the session flag is set', () => {
    expect(introShouldSkip({ search: '', seen: '1' })).toBe(true)
  })
  it('skips with ?nointro regardless of the flag', () => {
    expect(introShouldSkip({ search: '?nointro=1', seen: null })).toBe(true)
  })
  it('plays when neither gate applies', () => {
    expect(introShouldSkip({ search: '', seen: null })).toBe(false)
    expect(introShouldSkip({ search: '?other=1', seen: '0' })).toBe(false)
  })
})

describe('stage transitions', () => {
  it('ready opens the door in the normal path', () => {
    expect(stageOnReady({ reduced: false, skipped: false })).toBe('open')
  })
  it('reduced-motion completes via the plain fade — never swings', () => {
    expect(stageOnReady({ reduced: true, skipped: false })).toBe('exit')
  })
  it('a pre-ready skip goes to the end fade once ready', () => {
    expect(stageOnReady({ reduced: false, skipped: true })).toBe('exit')
  })
  it('skip completes from enter (when ready) and from open', () => {
    expect(stageOnSkip('enter', true)).toBe('exit')
    expect(stageOnSkip('open', true)).toBe('exit')
  })
  it('skip while still loading waits for readiness', () => {
    expect(stageOnSkip('enter', false)).toBeNull()
  })
})

describe('timings', () => {
  it('signed-out totals roughly three seconds', () => {
    const total = doorTotalMs(DOOR_TIMING_SIGNED_OUT)
    expect(total).toBeGreaterThanOrEqual(2500)
    expect(total).toBeLessThanOrEqual(3100)
  })
  it('signed-in is compressed to roughly 1.2 seconds', () => {
    const total = doorTotalMs(DOOR_TIMING_SIGNED_IN)
    expect(total).toBeGreaterThanOrEqual(900)
    expect(total).toBeLessThanOrEqual(1400)
  })
  it('doorTiming picks the variant by session', () => {
    expect(doorTiming(true)).toBe(DOOR_TIMING_SIGNED_IN)
    expect(doorTiming(false)).toBe(DOOR_TIMING_SIGNED_OUT)
  })
})
